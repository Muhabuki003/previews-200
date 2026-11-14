/* ==========================================================================
   AlivioVital — drawer cart engine (replaces PC theme-mini-cart.js)
   Local cart in localStorage, checkout via native Shopify cart permalink.
   Renders into the existing #miniCart drawer UI. Works on the static site
   (no same-origin /cart.js calls — those 404'd and broke the drawer).
   Exposes the theme-compatible openCart() + AlivioCart.add().
   ========================================================================== */
(function () {
  "use strict";

  var SHOP = "ehh05e-7q.myshopify.com";
  var KEY = "av_cart_v1";

  /* Known products (variant -> display data). Covers all static PDP buy boxes
     and the drawer upsell. Images are self-hosted (no Shopify CDN hotlinks). */
  var PRODUCTS = {
    "53981241409850": { title: "Fiber Gummies",          price: 16.99, meta: "60 gummies", image: "/img/products/fiber-1-400.jpg" },
    "53963239850298": { title: "60 Billion Probiotic",   price: 19.99, meta: "30 capsules", image: "/img/products/probiotic-1-400.jpg" },
    "53963239883066": { title: "Digestive Enzymes", price: 14.99, meta: "60 capsules", image: "/img/products/enzymes-1-400.jpg" },
    "53963239915834": { title: "Probiotic + Enzyme Duo", price: 24.99, meta: "2 bottles", image: "/img/products/duo-1-400.jpg" },
    "53964397838650": { title: "Cranberry + Probiotic",     price: 25.99, meta: "30 capsules", image: "/img/products/cranberry-1-400.jpg" },
    "67983524921658": { title: "Heatless Curling Ribbon",  price: 24.99, meta: "4-piece set · light purple", image: "/img/products/ribbon-1-400.jpg" }
  };

  /* Upsell slides rebuilt from our own products (PC's slides used dead variant ids). */
  var UPSELL = [
    { variant: "53981241409850", title: "Fiber Gummies", price: "$16.99", image: "/img/products/fiber-1-400.jpg" },
    { variant: "53963239850298", title: "60 Billion Probiotic", price: "$19.99", image: "/img/products/probiotic-1-400.jpg" },
    { variant: "53963239883066", title: "Digestive Enzymes", price: "$14.99", image: "/img/products/enzymes-1-400.jpg" },
    { variant: "53964397838650", title: "Cranberry + Probiotic", price: "$25.99", image: "/img/products/cranberry-1-400.jpg" }
  ];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function save(cart) {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {}
  }
  function fmt(n) { return "$" + Number(n).toFixed(2); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var cart = load();

  function subtotal() {
    return cart.reduce(function (t, l) { return t + (l.price || 0) * (l.qty || 1); }, 0);
  }
  function count() {
    return cart.reduce(function (t, l) { return t + (l.qty || 0); }, 0);
  }
  function checkoutUrl() {
    var parts = cart.map(function (l) { return l.variant + ":" + (l.qty || 1); });
    var url = "https://" + SHOP + "/cart/" + parts.join(",");
    var code = loadPromo();
    return url + (code ? "?discount=" + encodeURIComponent(code) : "");
  }

  /* ---------- promo code + reservation note (CRO kit) ---------- */
  var PROMO_KEY = "av_promo_v1";
  var RESERVE_KEY = "av_reserve_at";
  var RESERVE_MINUTES = 10;

  function loadPromo() {
    try { return localStorage.getItem(PROMO_KEY) || ""; } catch (e) { return ""; }
  }
  function savePromo(code) {
    try { code ? localStorage.setItem(PROMO_KEY, code) : localStorage.removeItem(PROMO_KEY); } catch (e) {}
  }

  /* ---------- Trustpilot banner ---------- */
  var TRUSTPILOT = {
    profile: "https://www.trustpilot.com/review/aliviovital.com",
    score: "",          // fills in from the real profile once it has reviews
    reviews: ""
  };

  function injectTrust() {
    if (document.getElementById("avTrustpilot")) return;
    var star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.3l-6.2 3.7 1.7-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.5 4.8 1.7 7z"/></svg>';
    var stars = "";
    for (var i = 0; i < 5; i++) stars += "<i>" + star + "</i>";
    var mark = "";
    for (var j = 0; j < 5; j++) mark += "<i>" + star + "</i>";
    var score = TRUSTPILOT.score
      ? '<span class="av-tp-score"><b>' + TRUSTPILOT.score + "</b> &middot; " + TRUSTPILOT.reviews + " reviews</span>"
      : '<span class="av-tp-score">Verified customer reviews</span>';

    var dlg = $("miniCart");
    if (!dlg) return;
    var band = document.createElement("div");
    band.id = "avTrustpilot";
    band.innerHTML =
      "<style>" +
      "#avTrustpilot{position:relative;display:block;overflow:hidden;background:#0d3d3d;border-bottom:1px solid rgba(0,0,0,.08);}" +
      "#avTrustpilot img{display:block;width:100%;aspect-ratio:2.6/1;object-fit:cover;object-position:center 35%;opacity:.92;}" +
      "#avTrustpilot .av-tp-ov{position:absolute;inset:0;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:5px;padding:12px 16px;text-align:right;color:#fff;background:linear-gradient(90deg,rgba(10,40,40,0) 32%,rgba(10,40,40,.74) 72%);}" +
      "#avTrustpilot .av-tp-brand{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#fff;}" +
      "#avTrustpilot .av-tp-mark,#avTrustpilot .av-tp-stars{display:inline-flex;gap:1.5px;}" +
      "#avTrustpilot .av-tp-mark i,#avTrustpilot .av-tp-stars i{display:inline-flex;align-items:center;justify-content:center;background:#00b67a;}" +
      "#avTrustpilot .av-tp-mark i{width:12px;height:12px;}" +
      "#avTrustpilot .av-tp-mark i:nth-child(n+2){display:none;}" +
      "#avTrustpilot .av-tp-stars i{width:14px;height:14px;}" +
      "#avTrustpilot svg{width:9px;height:9px;fill:#fff;}" +
      "#avTrustpilot b{font-size:13px;font-weight:600;line-height:1.25;}" +
      "</style>" +
      '<img src="/img/band-outdoor-900.jpg" alt="">' +
      '<span class="av-tp-ov">' +
        '<span class="av-tp-brand"><span class="av-tp-mark">' + mark + "</span>Trustpilot</span>" +
        '<span class="av-tp-stars">' + stars + "</span>" +
        "<b>" + (TRUSTPILOT.score ? TRUSTPILOT.reviews + " happy customers" : "Verified customer reviews") + "</b>" +
      "</span>";

    var head = $("miniCartHeader");
    if (head && head.nextSibling) dlg.insertBefore(band, head.nextSibling);
    else dlg.insertBefore(band, dlg.firstChild);
  }

  function injectCro() {
    var dlg = $("miniCart");
    if (!dlg || $("avCroBar")) return;

    var style = document.createElement("style");
    style.textContent =
      "#avCroBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 18px;background:#eef7f7;border-bottom:1px solid rgba(0,0,0,.07);font-size:12.5px;color:#0A5C5C;}" +
      "#avCroBar b{font-weight:600;}" +
      "#avCroBar .av-clock{font-variant-numeric:tabular-nums;}" +
      "#avPromo{display:flex;gap:8px;padding:12px 18px 0;flex-wrap:wrap;width:100%;box-sizing:border-box;}" +
      "#avPromo input{flex:1 1 140px;min-width:0;width:auto;padding:10px 12px;border:1px solid rgba(0,0,0,.18);border-radius:8px;font-size:13px;box-sizing:border-box;}" +
      "#avPromo button{padding:10px 16px;border-radius:8px;border:0;background:#0A5C5C;color:#fff;font-size:13px;font-weight:600;cursor:pointer;}" +
      "#avPromoMsg{width:100%;margin:0;font-size:12px;color:#0A5C5C;}";
    dlg.appendChild(style);

    var bar = document.createElement("div");
    bar.id = "avCroBar";
    bar.innerHTML = "<span>&#10003; <b>Free shipping</b> on every order</span>" +
      '<span style="opacity:.35">&middot;</span><span><b>60-day</b> money-back guarantee</span>' +
      '<span style="opacity:.35">&middot;</span><span>Bag saved for <b class="av-clock" id="avCroClock">10:00</b></span>';
    var head = $("miniCartHeader");
    if (head && head.nextSibling) dlg.insertBefore(bar, head.nextSibling);
    else dlg.insertBefore(bar, dlg.firstChild);

    var foot = $("miniCartFooter");
    if (foot) {
      var box = document.createElement("div");
      box.id = "avPromo";
      box.innerHTML =
        '<input id="avPromoInput" type="text" placeholder="Discount code" autocomplete="off" spellcheck="false" aria-label="Discount code">' +
        '<button id="avPromoApply" type="button">Apply</button>' +
        '<p id="avPromoMsg" role="status" aria-live="polite"></p>';
      foot.insertBefore(box, foot.firstChild);
      var inp = $("avPromoInput"), btn = $("avPromoApply"), msg = $("avPromoMsg");
      var cur = loadPromo();
      if (cur) { inp.value = cur; msg.textContent = "Code " + cur + " applied at checkout."; }
      btn.addEventListener("click", function () {
        var code = (inp.value || "").trim().toUpperCase();
        if (!code) { savePromo(""); msg.textContent = ""; return; }
        savePromo(code);
        msg.textContent = "Code " + code + " applied at checkout.";
      });
    }
  }

  function startReserve() {
    var clock = $("avCroClock");
    if (!clock) return;
    if (!cart.length) { var b = $("avCroBar"); if (b) b.style.display = "none"; return; }
    var started = 0;
    try { started = Number(localStorage.getItem(RESERVE_KEY)) || 0; } catch (e) {}
    var win = RESERVE_MINUTES * 60000;
    if (!started || Date.now() - started > win) {
      started = Date.now();
      try { localStorage.setItem(RESERVE_KEY, String(started)); } catch (e) {}
    }
    clearInterval(window.__avClock);
    function tick() {
      var left = Math.max(0, started + win - Date.now());
      if (!left) { var bar = $("avCroBar"); if (bar) bar.style.display = "none"; clearInterval(window.__avClock); return; }
      var m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      clock.textContent = m + ":" + (s < 10 ? "0" : "") + s;
    }
    tick();
    window.__avClock = setInterval(tick, 1000);
  }

  /* ---------- DOM helpers ---------- */
  function $(id) { return document.getElementById(id); }

  function renderHeader() {
    var n = count();
    var hi = $("headerIconsCart");
    if (hi) hi.setAttribute("data-count", n);
    var lbl = $("custom-headerIconsCart");
    if (lbl) {
      var c = lbl.querySelector(".custom-cart-count");
      if (c) c.textContent = n;
    }
  }

  function render() {
    var body = $("miniCartBody");
    var empty = $("miniCartEmpty");
    var head = $("miniCartHeader");
    var footer = $("miniCartFooter");
    var upsell = $("miniCartUpsell");

    if (!body) return;

    if (cart.length === 0) {
      body.innerHTML = "";
      if (empty) empty.classList.add("active");
      if (head) head.classList.remove("active");
      if (footer) footer.classList.remove("active");
      if (upsell) upsell.classList.remove("active");
      var t = $("miniCartHeaderTitle");
      if (t) t.innerHTML = "Your cart <strong>0</strong>";
      var ip = $("miniCartFooterItemcount");
      if (ip) ip.textContent = "0";
      var cp = $("miniCartFooterCheckoutPrice");
      if (cp) cp.textContent = "";
      renderHeader();
      return;
    }

    if (empty) empty.classList.remove("active");
    if (head) head.classList.add("active");
    if (footer) footer.classList.add("active");
    if (upsell) upsell.classList.add("active");

    var t = $("miniCartHeaderTitle");
    if (t) t.innerHTML = "Your Cart <strong>" + count() + "</strong>";

    body.innerHTML = cart.map(function (l) {
      return '<div class="miniCartBodyItem" data-key="' + l.variant + '">' +
        '<img class="miniCartBodyItemImage" src="' + esc(l.image) + '" alt="' + esc(l.title) + '" loading="lazy" decoding="async">' +
        '<div>' +
          '<div class="miniCartBodyItemFlex">' +
            '<div>' +
              '<div class="miniCartBodyItemTitle">' + esc(l.title) + "</div>" +
              (l.meta ? '<div class="miniCartBodyItemVariant">' + esc(l.meta) + "</div>" : "") +
            "</div>" +
            '<button class="miniCartBodyItemRemove" aria-label="Remove">' +
              '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.28125 3.28125L3.86719 12.6562C3.89502 13.1979 4.28906 13.5938 4.80469 13.5938H10.1953C10.713 13.5938 11.0997 13.1979 11.1328 12.6562L11.7188 3.28125" stroke="#8F8F8F" stroke-width="0.9375" stroke-linecap="round" stroke-linejoin="round"></path><path d="M2.34375 3.28125H12.6562H2.34375Z" fill="#8F8F8F"></path><path d="M2.34375 3.28125H12.6562" stroke="#8F8F8F" stroke-width="0.9375" stroke-miterlimit="10" stroke-linecap="round"></path><path d="M9.60938 5.15625L9.375 11.7188M5.625 3.28125V2.10938C5.62473 2.01697 5.64273 1.92541 5.67797 1.83998C5.71321 1.75455 5.76499 1.67693 5.83034 1.61159C5.89568 1.54624 5.9733 1.49446 6.05873 1.45922C6.14416 1.42398 6.23571 1.40598 6.32812 1.40625H8.67188C8.76429 1.40598 8.85584 1.42398 8.94127 1.45922C9.0267 1.49446 9.10432 1.54624 9.16966 1.61159C9.23527 1.67693 9.35727 1.72541 9.39251 1.83998C9.42775 1.95455 9.44575 2.02541 9.375 2.10938V3.28125H5.625ZM7.5 5.15625V11.7188V5.15625ZM5.39062 5.15625L5.625 11.7188L5.39062 5.15625Z" stroke="#8F8F8F" stroke-width="0.9375" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
            "</button>" +
          "</div>" +
          '<div class="miniCartBodyItemFlex">' +
            '<div class="miniCartBodyItemQuantity">' +
              '<button class="miniCartBodyItemQuantityMinus">-</button>' +
              '<div class="miniCartBodyItemQuantityCount">' + l.qty + "</div>" +
              '<button class="miniCartBodyItemQuantityPlus">+</button>' +
            "</div>" +
            '<div class="miniCartBodyItemPrice">' + fmt((l.price || 0) * (l.qty || 1)) + "</div>" +
          "</div>" +
        "</div>" +
      "</div>";
    }).join("");

    var ip = $("miniCartFooterItemcount");
    if (ip) ip.textContent = String(count()) + (count() === 1 ? " item" : " items");
    var cp = $("miniCartFooterCheckoutPrice");
    if (cp) cp.textContent = fmt(subtotal());
    renderHeader();
  }

  function upsellMarkup() {
    return UPSELL.map(function (p) {
      return '<div class="swiper-slide">' +
        '<div class="miniCartUpsellItem" data-variant="' + p.variant + '">' +
          '<div class="miniCartUpsellItemWrap">' +
            '<img class="miniCartUpsellItemWrapImg" src="' + esc(p.image) + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async">' +
            '<div class="miniCartUpsellItemWrapBody">' +
              '<div class="miniCartUpsellItemWrapBodyTitle">' + esc(p.title) + "</div>" +
              '<div class="miniCartUpsellItemWrapBodyPrice">' + p.price + "</div>" +
            "</div>" +
            '<button class="miniCartUpsellItemWrapATC button">ADD</button>' +
          "</div>" +
        "</div>" +
      "</div>";
    }).join("");
  }

  function rebuildUpsell() {
    var wrap = document.querySelector("#miniCartUpsell .swiper-wrapper");
    if (!wrap) return;
    wrap.innerHTML = upsellMarkup();
    var sw = window.Swiper && document.querySelector("#miniCartUpsell .swiper");
    if (sw && sw.swiper) { try { sw.swiper.update(); } catch (e) {} }
  }

  /* ---------- actions ---------- */
  function add(variant, qty, silent) {
    qty = parseInt(qty, 10) || 1;
    variant = String(variant);
    var p = PRODUCTS[variant] || { title: "Product", price: 0, meta: "", image: "" };
    var found = null;
    cart.forEach(function (l) { if (l.variant === variant) found = l; });
    if (found) found.qty += qty;
    else cart.push({ variant: variant, title: p.title, price: p.price, meta: p.meta, image: p.image, qty: qty });
    save(cart);
    render();
    if (!silent) openCart();
  }

  function setQty(variant, qty) {
    cart.forEach(function (l) {
      if (l.variant === variant) l.qty = Math.max(1, parseInt(qty, 10) || 1);
    });
    save(cart);
    render();
  }

  function remove(variant) {
    cart = cart.filter(function (l) { return l.variant !== variant; });
    save(cart);
    render();
  }

  function openCart() {
    var d = $("miniCart");
    if (!d) return;
    if (typeof d.showModal === "function" && !d.open) d.showModal();
    document.body.classList.add("noScroll");
    render();
    injectTrust();
    injectCro();
    startReserve();
  }

  function closeCart() {
    var d = $("miniCart");
    if (d && d.open) { try { d.close(); } catch (e) {} }
    document.body.classList.remove("noScroll");
  }

  /* ---------- wiring ---------- */
  function bind() {
    var d = $("miniCart");
    if (!d) return;

    var closes = d.querySelectorAll(".closeCart");
    for (var i = 0; i < closes.length; i++) {
      closes[i].addEventListener("click", closeCart);
    }

    /* backdrop click closes */
    d.addEventListener("click", function (e) {
      if (e.target === d) closeCart();
    });

    /* qty / remove (delegated) */
    d.addEventListener("click", function (e) {
      var row = e.target.closest ? e.target.closest(".miniCartBodyItem") : null;
      if (!row) return;
      var v = row.getAttribute("data-key");
      if (e.target.classList.contains("miniCartBodyItemQuantityMinus")) {
        var q = parseInt(row.querySelector(".miniCartBodyItemQuantityCount").textContent, 10);
        if (q <= 1) remove(v); else setQty(v, q - 1);
      } else if (e.target.classList.contains("miniCartBodyItemQuantityPlus")) {
        var q2 = parseInt(row.querySelector(".miniCartBodyItemQuantityCount").textContent, 10);
        setQty(v, q2 + 1);
      } else if (e.target.closest(".miniCartBodyItemRemove")) {
        remove(v);
      }
    });

    /* checkout */
    var co = $("miniCartFooterCheckout");
    if (co) {
      co.addEventListener("click", function () {
        if (!cart.length) return;
        window.location.href = checkoutUrl();
      });
    }

    /* upsell ADD (delegated) */
    d.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".miniCartUpsellItemWrapATC") : null;
      if (!btn) return;
      var item = btn.closest(".miniCartUpsellItem");
      if (item) add(item.getAttribute("data-variant"), 1);
    });

    /* header cart icon(s) */
    var triggers = [];
    var byData = document.querySelectorAll("[data-cart]");
    for (var j = 0; j < byData.length; j++) triggers.push(byData[j]);
    var custom = $("custom-headerIconsCart");
    if (custom) triggers.push(custom);
    var icon = document.querySelector(".pc-header__cart-icon");
    if (icon && icon.closest("a")) triggers.push(icon.closest("a"));
    for (var k = 0; k < triggers.length; k++) {
      (function (el) {
        el.addEventListener("click", function (e) {
          if (el.tagName === "A") e.preventDefault();
          openCart();
        });
      })(triggers[k]);
    }

    /* static PDP buy-box forms (action = /cart/VARIANT:QTY) -> add + open drawer */
    document.addEventListener("submit", function (e) {
      var f = e.target;
      if (!f || f.tagName !== "FORM") return;
      var action = (f.getAttribute("action") || "").trim();
      var m = /\/cart\/(\d+):(\d+)/.exec(action);
      if (!m) return;
      e.preventDefault();
      var qty = 1;
      var q = f.querySelector('input[name="qty"]');
      if (q && q.value) qty = parseInt(q.value, 10) || 1;
      add(m[1], qty);
    });

    rebuildUpsell();
    render();
    injectTrust();
    injectCro();
    startReserve();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  /* theme-compatible public API */
  window.openCart = openCart;
  window.AlivioCart = {
    add: function (v, q) { return add(v, q, true); },
    setQty: setQty,
    remove: remove,
    count: count,
    subtotal: subtotal,
    open: openCart,
    close: closeCart,
    checkoutUrl: checkoutUrl
  };
})();
