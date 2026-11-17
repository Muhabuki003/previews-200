/* PUPSTOP — shared store shell.
   Loads assets/products.json once, then wires the cart drawer, its Shopify
   cartCreate checkout, toasts, scroll reveals and the mobile sticky bar.

   Checkout is intentionally inert until a product has real Shopify variant IDs
   in products.json: cartCreate is only ever called with a non-empty
   merchandiseId, so no request can produce a broken permalink. */

(function () {
  'use strict';

  const CONFIG_URL = 'assets/products.json';

  const money = (n) =>
    '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const state = {
    config: null,
    cart: [],
    discountCode: '',
    ready: false,
    queue: []
  };

  /* ---------------- config ---------------- */
  async function loadConfig() {
    const res = await fetch(CONFIG_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('products.json ' + res.status);
    state.config = await res.json();
    return state.config;
  }

  function onReady(fn) {
    if (state.ready) return fn(state.config);
    state.queue.push(fn);
  }

  function productBySlug(slug) {
    const list = state.config.products || [];
    return list.find((p) => p.slug === slug) || list[0];
  }

  /* ---------------- toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2100);
  }

  /* ---------------- cart ---------------- */
  function cartCount() {
    return state.cart.reduce((s, l) => s + l.qty, 0);
  }
  function cartSubtotal() {
    return state.cart.reduce((s, l) => s + l.price * l.qty, 0);
  }
  function freeShippingThreshold() {
    return Number((state.config && state.config.commerce.free_shipping_threshold) || 55);
  }

  function addLine(line) {
    const found = state.cart.find((l) => l.key === line.key);
    if (found) found.qty += line.qty;
    else state.cart.push(line);
    renderCart();
  }

  function cartHasUnlinkedLines() {
    return state.cart.some((l) => !l.variantId);
  }

  function renderCart() {
    const badge = document.getElementById('cartCount');
    if (badge) {
      badge.textContent = String(cartCount());
      badge.dataset.empty = cartCount() === 0 ? 'true' : 'false';
    }

    const box = document.getElementById('dLines');
    const promo = document.querySelector('.prog');
    const codeBlock = document.querySelector('.d-code-wrap');
    const checkoutBtn = document.getElementById('checkout');

    if (!box) return;

    if (!state.cart.length) {
      box.innerHTML =
        '<div class="d-empty">' +
        '<div class="media r11"><img src="assets/img/gallery-1.jpg" alt="Dog wearing a car safety harness on a back seat" loading="lazy"></div>' +
        '<h3>Your bag is empty</h3>' +
        '<p>Add the harness once checkout is linked — or read the fit guide on the product page first.</p>' +
        '</div>';
      if (promo) promo.hidden = true;
      if (codeBlock) codeBlock.hidden = true;
    } else {
      box.innerHTML = state.cart
        .map(
          (l, i) => `
        <div class="d-line">
          <div class="media r11"><img src="${l.image}" alt="${l.imageAlt || ''}" loading="lazy"></div>
          <div>
            <h4>${l.title}</h4>
            <div class="v">${l.variantTitle || ''}</div>
            <div class="p">${money(l.price)} ${l.compareAt ? '<s>' + money(l.compareAt) + '</s>' : ''}</div>
            <div style="display:flex;align-items:center">
              <span class="qty">
                <button data-q="-1" data-i="${i}" aria-label="Decrease quantity of ${l.title}">&minus;</button>
                <span>${l.qty}</span>
                <button data-q="1" data-i="${i}" aria-label="Increase quantity of ${l.title}">+</button>
              </span>
              <button class="d-rm" data-rm="${i}" aria-label="Remove ${l.title} from bag">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/></svg>
              </button>
            </div>
          </div>
        </div>`
        )
        .join('');
      if (promo) promo.hidden = false;
      if (codeBlock) codeBlock.hidden = false;
    }

    const sub = cartSubtotal();
    const subEl = document.getElementById('subtotal');
    if (subEl) subEl.textContent = money(sub);

    const left = Math.max(0, freeShippingThreshold() - sub);
    const progText = document.getElementById('progText');
    const progFill = document.getElementById('progFill');
    if (progText)
      progText.textContent = left > 0
        ? 'Add ' + money(left) + ' for free shipping'
        : 'Free shipping unlocked';
    if (progFill)
      progFill.style.width = Math.min(100, (sub / freeShippingThreshold()) * 100) + '%';

    if (checkoutBtn) {
      const unlinked = cartHasUnlinkedLines();
      checkoutBtn.disabled = !state.cart.length || unlinked;
      checkoutBtn.textContent = !state.cart.length
        ? 'Bag is empty'
        : unlinked
        ? 'Checkout link pending'
        : 'Checkout';
    }
  }

  /* ---------------- drawer ---------------- */
  let lastFocus = null;
  function openCart() {
    const drawer = document.getElementById('drawer');
    const scrim = document.getElementById('scrim');
    if (!drawer) return;
    lastFocus = document.activeElement;
    drawer.classList.add('on');
    scrim.classList.add('on');
    drawer.setAttribute('aria-hidden', 'false');
    const close = drawer.querySelector('.d-x');
    if (close) close.focus();
  }
  function closeCart() {
    const drawer = document.getElementById('drawer');
    const scrim = document.getElementById('scrim');
    if (!drawer) return;
    drawer.classList.remove('on');
    scrim.classList.remove('on');
    drawer.setAttribute('aria-hidden', 'true');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------------- Shopify Storefront checkout ---------------- */
  const CART_CREATE = `
    mutation CartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart { id checkoutUrl }
        userErrors { field message }
      }
    }`;

  async function checkout() {
    if (!state.cart.length) return;
    if (cartHasUnlinkedLines()) {
      toast('Checkout link pending — this product has no Shopify variant ID yet');
      return;
    }
    const btn = document.getElementById('checkout');
    const c = state.config.commerce;
    if (btn) { btn.disabled = true; btn.textContent = 'Opening checkout…'; }

    const input = {
      lines: state.cart.map((l) => ({ merchandiseId: l.variantId, quantity: l.qty }))
    };
    if (state.discountCode) input.discountCodes = [state.discountCode];

    try {
      const res = await fetch(c.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': c.storefront_token
        },
        body: JSON.stringify({ query: CART_CREATE, variables: { input } })
      });
      const json = await res.json();
      const errs = (json.data && json.data.cartCreate && json.data.cartCreate.userErrors) || [];
      if (errs.length) throw new Error(errs.map((e) => e.message).join('; '));
      const url = json.data && json.data.cartCreate && json.data.cartCreate.cart.checkoutUrl;
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (err) {
      toast('Checkout unavailable: ' + err.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Checkout'; }
    }
  }

  /* ---------------- reveals ---------------- */
  function initReveals() {
    const els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    document.documentElement.classList.add('reveal-ready');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    els.forEach((el) => io.observe(el));
    /* failsafe: never leave content hidden if the observer misses */
    setTimeout(() => els.forEach((el) => el.classList.add('in')), 4000);
  }

  /* ---------------- boot ---------------- */
  function wireShell() {
    document.querySelectorAll('[data-open-cart]').forEach((b) => b.addEventListener('click', openCart));
    document.querySelectorAll('[data-close-cart]').forEach((b) => b.addEventListener('click', closeCart));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCart();
        const lb = document.getElementById('lb');
        if (lb) { lb.classList.remove('on'); lb.setAttribute('aria-hidden', 'true'); }
      }
    });

    const dLines = document.getElementById('dLines');
    if (dLines)
      dLines.addEventListener('click', (e) => {
        const q = e.target.closest('[data-q]');
        if (q) {
          const i = +q.dataset.i;
          state.cart[i].qty = Math.max(1, state.cart[i].qty + +q.dataset.q);
          renderCart();
          return;
        }
        const r = e.target.closest('[data-rm]');
        if (r) {
          state.cart.splice(+r.dataset.rm, 1);
          renderCart();
        }
      });

    const apply = document.getElementById('applyCode');
    if (apply)
      apply.addEventListener('click', () => {
        const input = document.getElementById('codeIn');
        const v = (input.value || '').trim().toUpperCase();
        if (!v) return toast('Enter a code');
        state.discountCode = v;
        toast(v + ' saved — Shopify validates the code at checkout');
      });

    const checkoutBtn = document.getElementById('checkout');
    if (checkoutBtn) checkoutBtn.addEventListener('click', checkout);

    /* ---------- accordions (shared by PDP and FAQ page) ---------- */
    document.querySelectorAll('[data-accordion]').forEach((box) => {
      box.addEventListener('click', (e) => {
        const btn = e.target.closest('.acc-q');
        if (!btn) return;
        const panel = document.getElementById(btn.getAttribute('aria-controls'));
        if (!panel) return;
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        const inner = panel.firstElementChild;
        panel.style.height = open ? '0px' : (inner ? inner.offsetHeight : 0) + 'px';
      });
    });

    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();

    document.querySelectorAll('[data-copy]').forEach((b) => {
      b.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(b.dataset.copy);
          toast('Copied');
        } catch {
          toast(b.dataset.copy);
        }
      });
    });

    renderCart();
    initReveals();
  }

  loadConfig()
    .then(() => {
      state.ready = true;
      state.queue.forEach((fn) => fn(state.config));
      state.queue = [];
      wireShell();
    })
    .catch((err) => {
      console.error('PUPSTOP config failed:', err);
      const el = document.getElementById('configError');
      if (el) {
        el.hidden = false;
        el.textContent = 'Store config could not load (' + err.message + ').';
      }
    });

  window.PUPSTOP = {
    get config() { return state.config; },
    get cart() { return state.cart; },
    money,
    onReady,
    productBySlug,
    addLine,
    renderCart,
    openCart,
    closeCart,
    checkout,
    toast,
    cartCount
  };
})();
