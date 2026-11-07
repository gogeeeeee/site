import html
import json
import os
import secrets
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
PRODUCTS_FILE = ROOT / "json" / "store_db.json"
DELIVERY_PRICE = 199
MAX_REQUEST_SIZE = 16_384
DELIVERY_METHODS = {
    "nova_poshta": "Нова пошта",
    "ukrposhta": "Укрпошта",
    "pickup": "Самовивіз",
}
PAYMENT_METHODS = {
    "cash_on_delivery": "Оплата при отриманні",
    "bank_transfer": "Банківський переказ після підтвердження",
}


class StoreHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if urlparse(self.path).path == "/server.py":
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/orders":
            self.send_json(404, {"error": "Маршрут не знайдено."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_SIZE:
                self.send_json(413, {"error": "Некоректний розмір запиту."})
                return
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            order_id, order_message, total = build_order(payload)
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(400, {"error": "Некоректний формат замовлення."})
            return
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
            return
        except (OSError, KeyError, TypeError, json.JSONDecodeError):
            self.send_json(500, {"error": "Не вдалося перевірити каталог товарів."})
            return

        token = os.environ.get("TELEGRAM_BOT_TOKEN")
        chat_id = os.environ.get("TELEGRAM_CHAT_ID")
        if not token or not chat_id:
            self.send_json(503, {"error": "Сервер магазину ще не налаштований для приймання замовлень."})
            return

        try:
            telegram_send_message(token, chat_id, order_message)
        except (HTTPError, URLError, TimeoutError, OSError, ValueError):
            self.send_json(502, {"error": "Не вдалося передати замовлення адміністратору. Спробуйте ще раз."})
            return

        self.send_json(201, {
            "orderId": order_id,
            "total": total,
        })

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format_string, *args):
        # Avoid writing order payloads or customer details to the server log.
        super().log_message(format_string, *args)


def required_text(value, field, maximum):
    if not isinstance(value, str):
        raise ValueError(f"Перевірте поле «{field}».")
    value = value.strip()
    if not value or len(value) > maximum:
        raise ValueError(f"Перевірте поле «{field}».")
    return value


def build_order(payload):
    if not isinstance(payload, dict):
        raise ValueError("Некоректні дані замовлення.")

    customer = payload.get("customer")
    items = payload.get("items")
    if not isinstance(customer, dict) or not isinstance(items, list) or not items or len(items) > 30:
        raise ValueError("Кошик порожній або містить некоректні дані.")

    name = required_text(customer.get("name"), "ім'я", 100)
    phone = required_text(customer.get("phone"), "телефон", 20)
    phone_digits = "".join(character for character in phone if character.isdigit())
    if len(phone_digits) < 10 or len(phone_digits) > 15:
        raise ValueError("Вкажіть коректний номер телефону.")

    email = customer.get("email", "")
    if not isinstance(email, str) or len(email) > 254:
        raise ValueError("Перевірте адресу електронної пошти.")
    email = email.strip()
    if email and ("@" not in email or email.startswith("@") or email.endswith("@")):
        raise ValueError("Вкажіть коректну адресу електронної пошти.")

    city = required_text(customer.get("city"), "місто", 100)
    delivery = customer.get("delivery")
    payment = customer.get("payment")
    if delivery not in DELIVERY_METHODS or payment not in PAYMENT_METHODS:
        raise ValueError("Оберіть коректний спосіб доставки та оплати.")
    address = customer.get("address", "")
    if delivery == "pickup":
        address = "Самовивіз"
    else:
        address = required_text(address, "відділення або адресу", 200)

    with PRODUCTS_FILE.open(encoding="utf-8") as file:
        products = json.load(file)
    products_by_id = {product["id"]: product for product in products}

    order_lines = []
    subtotal = 0
    seen_ids = set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Кошик містить некоректний товар.")
        product_id = item.get("id")
        quantity = item.get("quantity")
        if (not isinstance(product_id, int) or isinstance(product_id, bool)
                or not isinstance(quantity, int) or isinstance(quantity, bool)
                or quantity < 1 or quantity > 100 or product_id in seen_ids
                or product_id not in products_by_id):
            raise ValueError("Кошик містить некоректний товар або кількість.")
        seen_ids.add(product_id)
        product = products_by_id[product_id]
        line_total = product["price"] * quantity
        subtotal += line_total
        title = html.escape(product["title"])
        order_lines.append(
            f"• {title} — {quantity} × {product['price']} ₴ = {line_total} ₴"
        )

    shipping = DELIVERY_PRICE if delivery != "pickup" else 0
    total = subtotal + shipping
    order_id = secrets.token_hex(4).upper()
    safe = lambda value: html.escape(value, quote=True)
    message = "\n".join([
        "<b>Нове замовлення RotorLab</b>",
        f"Номер: <b>{order_id}</b>",
        f"Ім'я: {safe(name)}",
        f"Телефон: {safe(phone)}",
        f"Email: {safe(email) if email else 'не вказано'}",
        f"Місто: {safe(city)}",
        f"Доставка: {DELIVERY_METHODS[delivery]}",
        f"Адреса/відділення: {safe(address)}",
        f"Оплата: {PAYMENT_METHODS[payment]}",
        "",
        "<b>Товари:</b>",
        *order_lines,
        "",
        f"Товари: {subtotal} ₴",
        f"Доставка: {shipping} ₴",
        f"<b>Разом: {total} ₴</b>",
    ])
    if len(message) > 3900:
        raise ValueError("Замовлення завелике. Зменште кількість позицій.")
    return order_id, message, total


def telegram_send_message(token, chat_id, message):
    body = json.dumps({
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML",
    }).encode("utf-8")
    request = Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        result = json.loads(response.read().decode("utf-8"))
    if not result.get("ok"):
        raise ValueError("Telegram не прийняв повідомлення.")


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    print(f"RotorLab server: http://{host}:{port}")
    ThreadingHTTPServer((host, port), StoreHandler).serve_forever()
