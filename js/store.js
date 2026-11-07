const CART_COOKIE = "rotorlab_cart";
const FAVORITES_COOKIE = "rotorlab_favorites";
const DELIVERY_PRICE = 199;
const buttonAnimationTimers = new WeakMap();
const buttonFeedbackTimers = new WeakMap();
let products = [];
let cart = getJsonCookie(CART_COOKIE);
let favorites = getJsonCookie(FAVORITES_COOKIE);
if (!Array.isArray(cart)) cart = [];
if (!Array.isArray(favorites)) favorites = [];
cart = cart.filter((item) => Number.isInteger(item.id) && Number.isInteger(item.quantity) && item.quantity > 0);
favorites = [...new Set(favorites.filter((id) => Number.isInteger(id)))];

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

function getProductImagePath(product) {
  return `images/products/${encodeURIComponent(product.image)}`;
}

function getCategoryImagePath(category) {
  const images = {
    "FPV-дрони": "alreadydone.jpg",
    "Мотори": "motor.jpg",
    "Польотні контролери": "fc.jpg",
    "Регулятори швидкості": "esc.jpg",
    "Камери": "cam.jpg",
    "Відеопередавачі": "vtx.jpg",
    "Антени": "antena.jpeg",
    "Акумулятори": "batt.jpg",
    "Пропелери": "props.jpg",
    "Рами": "frane.jpg",
    "Приймачі": "rx.jpg",
    "Зарядні пристрої": "charger.jpg",
  };
  return `images/example%20img/${encodeURIComponent(images[category] || "alreadydone.jpg")}`;
}

function updateCartCount() {
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  document.querySelectorAll(".cart-count").forEach((badge) => {
    badge.textContent = String(count);
  });
}

function updateFavoriteCount() {
  document.querySelectorAll(".favorites-count").forEach((badge) => {
    badge.textContent = String(favorites.length);
    badge.closest(".favorites-link")?.setAttribute(
      "aria-label",
      favorites.length ? `Обране: ${favorites.length} товарів` : "Обране",
    );
  });
}

function updateFavoriteButtons() {
  document.querySelectorAll(".product-card__favorite").forEach((button) => {
    const isFavorite = favorites.includes(Number(button.dataset.favoriteId));
    button.classList.toggle("is-favorite", isFavorite);
    button.setAttribute("aria-pressed", String(isFavorite));
    button.setAttribute("aria-label", isFavorite ? "Видалити з обраного" : "Додати до обраного");
  });
}

function renderSearchResults(query) {
  const results = document.querySelector("#site-search-results");
  if (!results) return;

  const normalizedQuery = query.trim().toLocaleLowerCase("uk");
  if (!normalizedQuery) {
    results.innerHTML = "<p>Введіть назву товару або категорію.</p>";
    return;
  }

  const matches = products.filter((product) =>
    `${product.title} ${product.category} ${product.description} ${product.manufacturer}`
      .toLocaleLowerCase("uk")
      .includes(normalizedQuery),
  ).slice(0, 8);

  results.innerHTML = matches.length
    ? matches.map((product) => `
      <a class="search-result" href="catalog.html?search=${encodeURIComponent(product.title)}">
        <img src="${getProductImagePath(product)}" alt="" />
        <span class="search-result__info">
          <strong>${escapeHtml(product.title)}</strong>
          <span>${escapeHtml(product.category)}</span>
        </span>
        <strong class="search-result__price">${formatPrice(product.price)}</strong>
      </a>`).join("")
    : "<p>Нічого не знайдено. Спробуйте змінити запит.</p>";
}

function ensureSearchDialog() {
  let dialog = document.querySelector("#site-search-dialog");
  if (dialog) return dialog;

  document.body.insertAdjacentHTML("beforeend", `
    <dialog class="search-dialog" id="site-search-dialog" aria-labelledby="site-search-title">
      <div class="search-dialog__header">
        <h2 id="site-search-title">Пошук товарів</h2>
        <button type="button" class="icon-button search-dialog__close" aria-label="Закрити пошук">×</button>
      </div>
      <label class="search-dialog__field">
        <span class="visually-hidden">Назва товару або категорія</span>
        <input id="site-search-input" type="search" placeholder="Наприклад, мотор або акумулятор" autocomplete="off" />
      </label>
      <div class="search-dialog__results" id="site-search-results" aria-live="polite">
        <p>Введіть назву товару або категорію.</p>
      </div>
    </dialog>`);

  dialog = document.querySelector("#site-search-dialog");
  dialog.querySelector("#site-search-input").addEventListener("input", (event) => {
    renderSearchResults(event.currentTarget.value);
  });
  dialog.querySelector(".search-dialog__close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") dialog.close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

function openSearchDialog() {
  const dialog = ensureSearchDialog();
  if (!dialog.open) dialog.showModal();
  renderSearchResults(document.querySelector("#site-search-input").value);
  document.querySelector("#site-search-input").focus();
}

function toggleFavorite(productId) {
  const id = Number(productId);
  if (!products.some((product) => product.id === id)) return;

  favorites = favorites.includes(id)
    ? favorites.filter((favoriteId) => favoriteId !== id)
    : [...favorites, id];
  saveJsonCookie(FAVORITES_COOKIE, favorites);
  updateFavoriteCount();
  updateFavoriteButtons();
  renderFavorites();
}

window.toggleFavorite = toggleFavorite;

function renderFavorites() {
  const list = document.querySelector("#favorites-list");
  if (!list) return;

  const favoriteProducts = favorites
    .map((id) => products.find((product) => product.id === id))
    .filter(Boolean);

  list.innerHTML = favoriteProducts.length
    ? favoriteProducts.map((product) => `
      <article class="favorite-item">
        <img src="${getProductImagePath(product)}" alt="${escapeHtml(product.title)}" loading="lazy" />
        <div class="favorite-item__text">
          <p class="eyebrow">${escapeHtml(product.category)}</p>
          <h3>${escapeHtml(product.title)}</h3>
          <p class="price">${formatPrice(product.price)}</p>
        </div>
        <div class="favorite-item__actions">
          <button type="button" class="button button--primary" onclick="addToCart(${product.id}, this)">Додати в кошик</button>
          <button type="button" class="button button--ghost" onclick="toggleFavorite(${product.id})">Видалити</button>
        </div>
      </article>`).join("")
    : '<p>Список обраного порожній. Додайте товари натисканням на серце в каталозі.</p>';
}

function showButtonSuccess(button) {
  if (!(button instanceof HTMLElement)) return;
  const timer = buttonFeedbackTimers.get(button);
  if (timer) clearTimeout(timer);
  button.classList.remove("button-clicking");
  button.classList.add("button-success");
  buttonFeedbackTimers.set(button, setTimeout(() => {
    button.classList.remove("button-success");
    buttonFeedbackTimers.delete(button);
  }, 700));
}

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("button, .button");
  if (!button || button.disabled) return;

  if (button.matches(".search-trigger")) {
    openSearchDialog();
  }

  const animationTimer = buttonAnimationTimers.get(button);
  if (animationTimer) clearTimeout(animationTimer);
  button.classList.remove("button-clicking");
  void button.offsetWidth;
  button.classList.add("button-clicking");
  buttonAnimationTimers.set(button, setTimeout(() => {
    button.classList.remove("button-clicking");
    buttonAnimationTimers.delete(button);
  }, 700));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const dialog = document.querySelector("#site-search-dialog");
    if (dialog?.open) dialog.close();
  }
});

function persistCart() {
  saveJsonCookie(CART_COOKIE, cart);
  updateCartCount();
  renderCart();
}

function addToCart(productId, button) {
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
  showButtonSuccess(button);
}

window.addToCart = addToCart;

function createProductCard(product) {
  const isFavorite = favorites.includes(product.id);
  return `
    <article class="product-card">
      <button type="button" class="product-card__favorite${isFavorite ? " is-favorite" : ""}" data-favorite-id="${product.id}" aria-label="${isFavorite ? "Видалити з обраного" : "Додати до обраного"}" aria-pressed="${isFavorite}" onclick="toggleFavorite(${product.id})">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 016.5 4c1.74 0 3.41.81 4.5 2.09A6.15 6.15 0 0115.5 4 4.5 4.5 0 0120 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
      </button>
      <img src="${getProductImagePath(product)}" alt="${escapeHtml(product.title)}" loading="lazy" />
      <div class="product-card__body">
        <p class="eyebrow">${escapeHtml(product.category)}</p>
        <h3>${escapeHtml(product.title)}</h3>
        <p class="product-card__text">${escapeHtml(product.description)}</p>
        <div class="product-card__meta">
          <span class="price">${formatPrice(product.price)}</span>
          <span class="rating">${escapeHtml(product.rating)} / 5</span>
        </div>
        <div class="product-card__actions">
          <a href="product.html" class="button button--ghost">Детальніше</a>
          <button type="button" class="button button--primary" onclick="addToCart(${product.id}, this)">У кошик</button>
        </div>
      </div>
    </article>`;
}

function getVisibleProducts() {
  const searchInput = document.querySelector("#product-search");
  const searchValue = searchInput ? searchInput.value : new URLSearchParams(window.location.search).get("search");
  const search = (searchValue || "").trim().toLocaleLowerCase("uk");
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
    const categories = [...new Set(products.map((product) => product.category))];
    categoriesGrid.innerHTML = categories.map((category) => {
      return `
      <a class="category-card" href="catalog.html?category=${encodeURIComponent(category)}">
        <img class="category-card__image" src="${getCategoryImagePath(category)}" alt="${escapeHtml(category)}" loading="lazy" />
        <h3>${escapeHtml(category)}</h3>
      </a>`;
    }).join("");
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
        <img src="${getProductImagePath(product)}" alt="${escapeHtml(product.title)}" loading="lazy" />
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
        <button type="button" class="remove-button" data-cart-action="remove" data-product-id="${product.id}" aria-label="Видалити ${escapeHtml(product.title)}">Видалити</button>
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

function getDeliveryPrice() {
  return document.querySelector("#delivery-method")?.value === "pickup" ? 0 : DELIVERY_PRICE;
}

function renderCheckout() {
  const itemsContainer = document.querySelector("#checkout-items");
  if (!itemsContainer) return;

  const checkoutProducts = cart.map((item) => ({
    ...products.find((product) => product.id === item.id),
    quantity: item.quantity,
  })).filter((product) => product.id);
  itemsContainer.innerHTML = checkoutProducts.length
    ? checkoutProducts.map((product) => `
      <div class="summary-item">
        <span>${escapeHtml(product.title)} × ${product.quantity}</span>
        <strong>${formatPrice(product.price * product.quantity)}</strong>
      </div>`).join("")
    : "<p>Кошик порожній. <a href=\"catalog.html\">Перейдіть до каталогу</a>, щоб обрати товари.</p>";

  const subtotal = checkoutProducts.reduce((sum, product) => sum + product.price * product.quantity, 0);
  const delivery = subtotal > 0 ? getDeliveryPrice() : 0;
  document.querySelector("#checkout-subtotal").textContent = formatPrice(subtotal);
  document.querySelector("#checkout-delivery").textContent = formatPrice(delivery);
  document.querySelector("#checkout-total").textContent = formatPrice(subtotal + delivery);

  const button = document.querySelector("#place-order-button");
  if (button) button.disabled = checkoutProducts.length === 0;
}

function updateDeliveryFields() {
  const isPickup = document.querySelector("#delivery-method")?.value === "pickup";
  const address = document.querySelector("#delivery-address");
  const label = document.querySelector("#delivery-address-label");
  if (address) {
    address.required = !isPickup;
    address.disabled = isPickup;
  }
  if (label) label.hidden = isPickup;
  renderCheckout();
}

async function submitOrder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.completed === "true") return;
  const status = document.querySelector("#checkout-status");
  const button = document.querySelector("#place-order-button");
  const validItems = cart.filter((item) => products.some((product) => product.id === item.id));

  if (validItems.length === 0) {
    status.textContent = "Неможливо оформити замовлення: кошик порожній.";
    return;
  }
  if (!form.reportValidity()) return;

  const formData = new FormData(form);
  const payload = {
    customer: {
      name: formData.get("name"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      city: formData.get("city"),
      delivery: formData.get("delivery"),
      address: formData.get("address"),
      payment: formData.get("payment"),
    },
    items: validItems,
  };

  status.textContent = "Надсилаємо замовлення…";
  status.removeAttribute("data-error");
  button.disabled = true;
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Не вдалося оформити замовлення.");

    cart = [];
    saveJsonCookie(CART_COOKIE, cart);
    updateCartCount();
    form.dataset.completed = "true";
    form.querySelectorAll("input, select").forEach((control) => {
      control.disabled = true;
    });
    button.textContent = "Замовлення прийнято";
    showButtonSuccess(button);
    status.textContent = `Дякуємо! Замовлення №${result.orderId} передано менеджеру. Ми зв'яжемося з вами для підтвердження.`;
    document.querySelector(".summary-card--checkout").innerHTML = `
      <h2>Замовлення прийнято</h2>
      <p>Номер замовлення: <strong>${escapeHtml(result.orderId)}</strong></p>
      <p>До сплати: <strong>${formatPrice(result.total)}</strong></p>
      <p>Менеджер зв'яжеться з вами для підтвердження деталей.</p>
      <a href="catalog.html" class="button button--primary">Повернутися до каталогу</a>`;
  } catch (error) {
    console.error("Не вдалося оформити замовлення.", error);
    status.textContent = error instanceof TypeError
      ? "Сервер оформлення недоступний. Переконайтеся, що запущено server.py."
      : error.message;
    status.dataset.error = "true";
    button.disabled = false;
  }
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
  if (control.dataset.cartAction === "increase" || control.dataset.cartAction === "decrease") {
    const updatedControl = document.querySelector(
      `[data-cart-action="${control.dataset.cartAction}"][data-product-id="${id}"]`,
    );
    showButtonSuccess(updatedControl);
  }
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
    renderCheckout();
    renderFavorites();
    updateFavoriteCount();
    updateFavoriteButtons();
    const searchDialog = document.querySelector("#site-search-dialog");
    if (searchDialog?.open) {
      renderSearchResults(document.querySelector("#site-search-input").value);
    }
  } catch (error) {
    console.error("Не вдалося завантажити товари з json/store_db.json.", error);
    const grid = document.querySelector("#catalog-products, #featured-products, #cart-items");
    if (grid) grid.innerHTML = "<p role=\"alert\">Не вдалося завантажити товари. Перевірте файл бази та запустіть сайт через локальний вебсервер.</p>";
    const count = document.querySelector("#product-count");
    if (count) count.textContent = "Помилка завантаження товарів";
  }
}

updateCartCount();
updateFavoriteCount();
document.querySelectorAll("#product-search, #category-filter, #manufacturer-filter, #min-price, #max-price, #sort-products")
  .forEach((control) => control.addEventListener("input", renderCatalog));
document.querySelector("#cart-items")?.addEventListener("click", handleCartAction);
document.querySelector("#cart-items")?.addEventListener("change", handleCartAction);
document.querySelector("#checkout-form")?.addEventListener("submit", submitOrder);
document.querySelector("#delivery-method")?.addEventListener("change", updateDeliveryFields);
const catalogSearchInput = document.querySelector("#product-search");
const searchQuery = new URLSearchParams(window.location.search).get("search");
if (catalogSearchInput && searchQuery) catalogSearchInput.value = searchQuery;

loadProducts();
updateDeliveryFields();
