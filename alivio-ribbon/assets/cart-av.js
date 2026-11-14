/* =====================================================================
   AlivioVital · cart drawer engine (ONDA drawer markup)
   - local cart in localStorage "av_cart_v1" (SAME key + line schema the
     homepage engine uses, so the bag survives PDP <-> home navigation)
   - checkout = native Shopify permalink  /cart/{variant}:{qty},...
   - 5-minute bag timer that persists, and empties the bag on expiry
   ===================================================================== */
(function () {
  "use strict";
  var SHOP = "https://ehh05e-7q.myshopify.com";
  var KEY = "av_cart_v1";          // shared with js/theme-mini-cart.js
  var EXP = "av_onda_exp";         // countdown deadline
  var PROMO = "av_promo_v1";       // shared discount code
  var TTL = 300;                   // 5 minutes
  var FREE = 0;                    // AlivioVital ships free on every order
  var $ = function (s) { return document.querySelector(s); };
  var expired = false;

  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  function money(n) { return "$" + Number(n).toFixed(2); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var lines = read();

  function idOf(l) { return l.vid || l.variant; }
  function arm() { if (lines.length) { try { localStorage.setItem(EXP, String(Date.now() + TTL * 1000)); } catch (e) {} expired = false; } }
  function remaining() {
    var t = 0;
    try { t = +localStorage.getItem(EXP) || 0; } catch (e) {}
    return Math.max(0, Math.round((t - Date.now()) / 1000));
  }
  function count() { return lines.reduce(function (a, l) { return a + (l.qty || 1); }, 0); }
  function total() { return lines.reduce(function (a, l) { return a + (l.qty || 1) * (l.price || 0); }, 0); }

  function paint() {
    var box = $("#dLines");
    if (!box) return;
    if (!lines.length) {
      box.innerHTML = '<div class="d-empty">Your bag is empty.<br><span>Add something you love.</span></div>';
    } else {
      box.innerHTML = lines.map(function (l, i) {
        return '<div class="d-line"><div class="ph r11 sm">' + (l.img ? '<img src="' + esc(l.img) + '" alt="">' : "") +
          '</div><div class="d-lm"><h4>' + esc(l.title) + "</h4>" +
          (l.option || l.meta ? '<div class="d-lv">' + esc(l.option || l.meta) + "</div>" : "") +
          '<div class="d-q"><button data-d="-1" data-i="' + i + '" aria-label="Less">&minus;</button><span>' + (l.qty || 1) +
          '</span><button data-d="1" data-i="' + i + '" aria-label="More">+</button></div></div>' +
          '<div class="d-lp">' + money((l.price || 0) * (l.qty || 1)) + "</div>" +
          '<button class="d-rm" data-rm="' + i + '" aria-label="Remove">&times;</button></div>';
      }).join("");
    }
    var sub = $("#subtotal"); if (sub) sub.textContent = money(total());
    var badge = $("#cartCount");
    if (badge) { badge.textContent = count(); badge.hidden = count() === 0; }
    var fill = $("#progFill"), txt = $("#progText");
    if (fill) {
      if (FREE <= 0) {
        fill.style.width = "100%";
        if (txt) txt.textContent = "Free shipping on every order";
      } else {
        var pct = Math.min(100, (total() / FREE) * 100);
        fill.style.width = pct + "%";
        if (txt) txt.textContent = total() >= FREE ? "Free shipping unlocked" : "Add " + money(FREE - total()) + " to unlock Free Shipping";
      }
    }
    save(lines);
  }

  function open() {
    var d = $("#drawer"); if (!d) return;
    d.classList.add("on"); d.setAttribute("aria-hidden", "false");
    var s = $("#scrim"); if (s) s.classList.add("on");
    document.body.style.overflow = "hidden";
  }
  function close() {
    var d = $("#drawer"); if (!d) return;
    d.classList.remove("on"); d.setAttribute("aria-hidden", "true");
    var s = $("#scrim"); if (s) s.classList.remove("on");
    document.body.style.overflow = "";
  }

  function checkoutUrl() {
    var parts = lines.map(function (l) { return idOf(l) + ":" + (l.qty || 1); }).join(",");
    var url = SHOP + "/cart/" + parts;
    var code = "";
    try { code = localStorage.getItem(PROMO) || ""; } catch (e) {}
    return url + (code ? "?discount=" + encodeURIComponent(code) : "");
  }

  function add(item) {
    var rows = (item.lines && item.lines.length)
      ? item.lines
      : [{ variantId: item.vid || item.variant, qty: item.qty || 1 }];
    var unit = item.price, q = rows.reduce(function (a, r) { return a + (r.qty || 1); }, 0);
    if (rows.length === 1 && rows[0].qty > 1) unit = item.unitPrice != null ? item.unitPrice : item.price / rows[0].qty;
    rows.forEach(function (r) {
      var vid = String(r.variantId), qty = r.qty || 1;
      var hit = lines.filter(function (l) { return String(idOf(l)) === vid; })[0];
      if (hit) { hit.qty = (hit.qty || 1) + qty; return; }
      lines.push({
        vid: vid,
        variant: vid,                     // homepage engine reads .variant
        title: item.title,
        option: item.option || "",
        meta: item.option || "",
        price: +(rows.length > 1 ? (item.linePrice || item.price / q) : unit),
        img: item.img || "",
        qty: qty
      });
    });
    arm(); paint(); paintClock(); open();
  }

  window.AlivioCart = window.GecomoCart = {
    open: open, close: close, count: count, total: total, add: add,
    checkout: function () { if (lines.length) location.href = checkoutUrl(); }
  };
  window.openCart = open;

  document.addEventListener("click", function (e) {
    if (e.target.closest("#cartBtn, [data-cart]")) { e.preventDefault(); open(); return; }
    if (e.target.closest("#dClose, .d-x, #scrim")) { close(); return; }
    var q = e.target.closest("[data-d]");
    if (q) {
      var i = +q.dataset.i, d = +q.dataset.d;
      lines[i].qty = (lines[i].qty || 1) + d;
      if (lines[i].qty < 1) lines.splice(i, 1);
      paint(); return;
    }
    var rm = e.target.closest("[data-rm]");
    if (rm) { lines.splice(+rm.dataset.rm, 1); paint(); return; }
    if (e.target.closest("#checkout, .d-check")) { e.preventDefault(); window.AlivioCart.checkout(); return; }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

  /* ---- countdown ---------------------------------------------------- */
  var box = $("#clock");
  function fmt(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }
  function expire() {
    expired = true;
    lines = []; save(lines);
    try { localStorage.removeItem(EXP); } catch (e) {}
    paint(); close();
    if (box) box.textContent = "00:00";
  }
  function paintClock() {
    if (!box) return;
    if (!lines.length) { box.textContent = expired ? "00:00" : fmt(TTL); return; }
    var left = remaining();
    if (left <= 0) { expire(); return; }
    box.textContent = fmt(left);
  }
  if (lines.length) {
    if (!localStorage.getItem(EXP)) arm();
    else if (remaining() <= 0) expired = true;
  }
  if (expired) expire();
  paintClock();
  setInterval(paintClock, 1000);
  paint();
})();
