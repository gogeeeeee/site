const CART_COOKIE = "rotorlab_cart";
const DELIVERY_PRICE = 199;
let products = [];
let cart = getJsonCookie(CART_COOKIE);
if (!Array.isArray(cart)) cart = [];
cart = cart.filter((item) => Number.isInteger(item.id) && Number.isInteger(item.quantity) && item.quantity > 0);

function saveJsonCookie(name, value) {
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);
  document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

function getJsonCookie(name) {
  const cookie = document.cookie.split("; ").find((item) => item.startsWith(`${name}=`));
  if (!cookie) return null;

  try {
    return JSON.parse(decodeURIComponent(cookie.substring(name.length + 1)));
  } catch (error) {
    console.error(`Не вдалося прочитати cookie "${name}".`, error);
    return null;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatPrice(price) {
  return `${new Intl.NumberFormat("uk-UA").format(price)} ₴`;
}

function updateCartCount() {
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  document.querySelectorAll(".cart-count").forEach((badge) => {
    badge.textContent = String(count);
  });
}

function persistCart() {
  saveJsonCookie(CART_COOKIE, cart);
  updateCartCount();
  renderCart();
}

function addToCart(productId) {
  const id = Number(productId);
  if (!products.some((product) => product.id === id)) {
    console.error(`Товар із id ${productId} відсутній у базі.`);
    return;
  }

  const item = cart.find((entry) => entry.id === id);
  if (item) {
    item.quantity += 1;
  } else {
    cart.push({ id, quantity: 1 });
  }
  persistCart();
}

window.addToCart = addToCart;

function createProductCard(product) {
  return `
    <article class="product-card">
      <img src="images/products/${encodeURIComponent(product.image)}" alt="${escapeHtml(product.title)}" />
      <div class="product-card__body">
        <p class="eyebrow">${escapeHtml(product.category)}</p>
        <h3>${escapeHtml(product.title)}</h3>
        <p class="product-card__text">${escapeHtml(product.description)}</p>
        <div class="product-card__meta">
          <span class="price">${formatPrice(product.price)}</span>
          <span class="rating">★ ${escapeHtml(product.rating)}</span>
        </div>
        <div class="product-card__actions">
          <a href="product.html" class="button button--ghost">Детальніше</a>
          <button type="button" class="button button--primary" onclick="addToCart(${product.id})">У кошик</button>
        </div>
      </div>
    </article>`;
}

function getVisibleProducts() {
  const search = document.querySelector("#product-search")?.value.trim().toLocaleLowerCase("uk");
  const category = document.querySelector("#category-filter")?.value;
  const manufacturer = document.querySelector("#manufacturer-filter")?.value;
  const minPriceValue = document.querySelector("#min-price")?.value;
  const maxPriceValue = document.querySelector("#max-price")?.value;
  const minPrice = minPriceValue === "" || minPriceValue === undefined ? 0 : Number(minPriceValue);
  const maxPrice = maxPriceValue === "" || maxPriceValue === undefined ? Infinity : Number(maxPriceValue);
  const sort = document.querySelector("#sort-products")?.value;

  const visible = products.filter((product) => {
    const matchesSearch = !search || `${product.title} ${product.category} ${product.description}`.toLocaleLowerCase("uk").includes(search);
    return matchesSearch
      && (!category || product.category === category)
      && (!manufacturer || product.manufacturer === manufacturer)
      && product.price >= minPrice
      && product.price <= maxPrice;
  });

  if (sort === "price-asc") visible.sort((a, b) => a.price - b.price);
  if (sort === "price-desc") visible.sort((a, b) => b.price - a.price);
  if (sort === "popular") visible.sort((a, b) => b.rating - a.rating);
  return visible;
}

function renderCatalog() {
  const grid = document.querySelector("#catalog-products");
  if (!grid) return;

  const visible = getVisibleProducts();
  grid.innerHTML = visible.length
    ? visible.map(createProductCard).join("")
    : "<p>За вашим запитом товарів не знайдено.</p>";
  const count = document.querySelector("#product-count");
  if (count) count.textContent = `Показано ${visible.length} з ${products.length} товарів`;
}

function populateFilters() {
  const categories = [...new Set(products.map((product) => product.category))];
  const manufacturers = [...new Set(products.map((product) => product.manufacturer))];
  const categoryFilter = document.querySelector("#category-filter");
  const manufacturerFilter = document.querySelector("#manufacturer-filter");

  if (categoryFilter) {
    const selectedCategory = new URLSearchParams(window.location.search).get("category");
    categoryFilter.innerHTML = '<option value="">Усі категорії</option>' + categories
      .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
      .join("");
    if (categories.includes(selectedCategory)) categoryFilter.value = selectedCategory;
  }
  if (manufacturerFilter) {
    manufacturerFilter.innerHTML = '<option value="">Усі виробники</option>' + manufacturers
      .map((manufacturer) => `<option value="${escapeHtml(manufacturer)}">${escapeHtml(manufacturer)}</option>`)
      .join("");
  }
}

function renderHome() {
  const categoriesGrid = document.querySelector("#home-categories");
  if (categoriesGrid) {
    const icons = ["✈️", "⚙️", "🧠", "🔌", "📷", "📡", "📶", "🔋", "🌀", "🛠️", "🎮", "🔌"];
    const categories = [...new Set(products.map((product) => product.category))];
    categoriesGrid.innerHTML = categories.map((category, index) => `
      <a class="category-card" href="catalog.html?category=${encodeURIComponent(category)}">
        <div class="category-card__icon" aria-hidden="true">${icons[index % icons.length]}</div>
        <h3>${escapeHtml(category)}</h3>
      </a>`).join("");
  }

  const featuredGrid = document.querySelector("#featured-products");
  if (featuredGrid) featuredGrid.innerHTML = products.slice(0, 4).map(createProductCard).join("");
}

function renderCart() {
  const container = document.querySelector("#cart-items");
  if (!container) return;

  const cartProducts = cart.map((item) => ({
    ...products.find((product) => product.id === item.id),
    quantity: item.quantity,
  })).filter((product) => product.id);

  if (cartProducts.length === 0) {
    container.innerHTML = "<p>Ваш кошик порожній. <a href=\"catalog.html\">Перейдіть до каталогу</a>, щоб обрати товари.</p>";
  } else {
    container.innerHTML = cartProducts.map((product) => `
      <article class="cart-item">
        <img src="images/products/${encodeURIComponent(product.image)}" alt="${escapeHtml(product.title)}" />
        <div class="cart-item__info">
          <h3>${escapeHtml(product.title)}</h3>
          <p>${escapeHtml(product.category)}</p>
        </div>
        <div class="cart-item__price">${formatPrice(product.price)}</div>
        <div class="quantity-picker quantity-picker--small">
          <button type="button" data-cart-action="decrease" data-product-id="${product.id}" aria-label="Зменшити кількість">−</button>
          <input type="number" value="${product.quantity}" min="1" data-cart-action="set-quantity" data-product-id="${product.id}" aria-label="Кількість ${escapeHtml(product.title)}" />
          <button type="button" data-cart-action="increase" data-product-id="${product.id}" aria-label="Збільшити кількість">+</button>
        </div>
        <div class="cart-item__total">${formatPrice(product.price * product.quantity)}</div>
        <button type="button" class="remove-button" data-cart-action="remove" data-product-id="${product.id}" aria-label="Видалити ${escapeHtml(product.title)}">✕</button>
      </article>`).join("");
  }

  const subtotal = cartProducts.reduce((sum, product) => sum + product.price * product.quantity, 0);
  const delivery = subtotal > 0 ? DELIVERY_PRICE : 0;
  const subtotalElement = document.querySelector("#cart-subtotal");
  const deliveryElement = document.querySelector("#cart-delivery");
  const totalElement = document.querySelector("#cart-total");
  if (subtotalElement) subtotalElement.textContent = formatPrice(subtotal);
  if (deliveryElement) deliveryElement.textContent = formatPrice(delivery);
  if (totalElement) totalElement.textContent = formatPrice(subtotal + delivery);
}

function handleCartAction(event) {
  const control = event.target.closest("[data-cart-action]");
  if (!control) return;
  const id = Number(control.dataset.productId);
  const item = cart.find((entry) => entry.id === id);
  if (!item) return;

  switch (control.dataset.cartAction) {
    case "increase":
      item.quantity += 1;
      break;
    case "decrease":
      item.quantity -= 1;
      if (item.quantity <= 0) cart = cart.filter((entry) => entry.id !== id);
      break;
    case "remove":
      cart = cart.filter((entry) => entry.id !== id);
      break;
    case "set-quantity": {
      const quantity = Number(control.value);
      if (!Number.isInteger(quantity) || quantity < 1) {
        control.value = String(item.quantity);
        return;
      }
      item.quantity = quantity;
      break;
    }
    default:
      return;
  }
  persistCart();
}

async function loadProducts() {
  try {
    const response = await fetch("json/store_db.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Файл бази має містити масив товарів.");
    products = data;
    populateFilters();
    renderCatalog();
    renderHome();
    renderCart();
  } catch (error) {
    console.error("Не вдалося завантажити товари з json/store_db.json.", error);
    const grid = document.querySelector("#catalog-products, #featured-products, #cart-items");
    if (grid) grid.innerHTML = "<p role=\"alert\">Не вдалося завантажити товари. Перевірте файл бази та запустіть сайт через локальний вебсервер.</p>";
    const count = document.querySelector("#product-count");
    if (count) count.textContent = "Помилка завантаження товарів";
  }
}

updateCartCount();
document.querySelectorAll("#product-search, #category-filter, #manufacturer-filter, #min-price, #max-price, #sort-products")
  .forEach((control) => control.addEventListener("input", renderCatalog));
document.querySelector("#cart-items")?.addEventListener("click", handleCartAction);
document.querySelector("#cart-items")?.addEventListener("change", handleCartAction);

if (document.querySelector("#catalog-products, #featured-products, #home-categories, #cart-items")) {
  loadProducts();
}
