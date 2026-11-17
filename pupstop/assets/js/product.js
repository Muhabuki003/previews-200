/* PUPSTOP — product landing renderer.
   Everything on this page comes from one entry in assets/products.json.
   To publish product #2, add an object to that array and link to
   product.html?p=<slug>. No code changes needed. */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const P = window.PUPSTOP;

  const state = { variant: 0, bundle: 'one', addon: false, tip: 0 };

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function slugFromUrl() {
    const p = new URLSearchParams(window.location.search).get('p');
    return window.PUPSTOP_SLUG || p || '';
  }

  function render(p) {
    const money = P.money;

    /* --- head --- */
    document.title = p.name + ' — PUPSTOP';
    const md = document.querySelector('meta[name="description"]');
    if (md && p.meta_description) md.setAttribute('content', p.meta_description);

    /* --- breadcrumb + head copy --- */
    $('pEyebrow').textContent = p.eyebrow || 'Dog car safety';
    $('pTitle').textContent = p.name;
    $('pSub').textContent = p.sub || '';
    $('pPriceNow').textContent = money(p.price);
    $('pPriceWas').textContent = p.compare_at ? money(p.compare_at) : '';
    $('pPriceWas').hidden = !p.compare_at;
    $('pBadge').textContent = p.badge || 'Sale';
    $('pBadge').hidden = !p.badge;
    $('pCurrency').textContent = p.currency || 'USD';

    /* --- gallery --- */
    const main = $('mainImg');
    const first = p.images[0];
    main.src = first.src;
    main.alt = first.alt;

    $('thumbs').innerHTML = p.images
      .map(
        (im, i) => `
      <button class="thumb" aria-current="${i === 0}" data-i="${i}" aria-label="Show image ${i + 1} of ${p.images.length}">
        <div class="media r11"><img src="${im.src}" alt="" loading="lazy"></div>
      </button>`
      )
      .join('');

    let current = 0;
    $('thumbs').addEventListener('click', (e) => {
      const t = e.target.closest('.thumb');
      if (!t) return;
      const i = +t.dataset.i;
      if (i === current) return;
      current = i;
      main.style.opacity = '0';
      const swap = () => {
        main.src = p.images[i].src;
        main.alt = p.images[i].alt;
        main.style.opacity = '1';
      };
      setTimeout(swap, 130);
      $('thumbs')
        .querySelectorAll('.thumb')
        .forEach((b) => b.setAttribute('aria-current', String(+b.dataset.i === i)));
    });

    /* --- usps --- */
    $('usps').innerHTML = (p.usps || [])
      .map((u) => `<li><span class="tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 13 4 4L19 7"/></svg></span>${esc(u)}</li>`)
      .join('');

    /* --- fit tips (same slot the template uses for its quote slider) --- */
    const tips = p.fit_tips || [];
    function paintTip() {
      const t = tips[state.tip];
      if (!t) return;
      $('qText').textContent = t;
      $('qLabel').textContent = 'Fit note ' + (state.tip + 1) + ' of ' + tips.length;
    }
    if (tips.length) {
      paintTip();
      $('qNext').addEventListener('click', () => {
        state.tip = (state.tip + 1) % tips.length;
        paintTip();
      });
      $('qPrev').addEventListener('click', () => {
        state.tip = (state.tip - 1 + tips.length) % tips.length;
        paintTip();
      });
    } else {
      document.querySelector('.slider').hidden = true;
    }

    /* --- variants --- */
    const variants = p.variants || [];
    $('pills').innerHTML = variants
      .map(
        (v, i) =>
          `<button class="pill" aria-pressed="${i === 0}" data-i="${i}">${esc(v.label || v.name)}</button>`
      )
      .join('');

    /* --- bundles --- */
    const bundles = p.bundles || [];
    $('bundleLabel').textContent = p.bundle_label || 'Bundle';
    const thumbSrc = p.images[0].src;
    $('bundles').innerHTML = bundles
      .map(
        (b) => `
      <button class="bundle" role="radio" aria-checked="${b.id === state.bundle}" data-b="${esc(b.id)}">
        ${b.best ? '<span class="best">Best value</span>' : ''}
        <div class="media r11"><img src="${thumbSrc}" alt="" loading="lazy"></div>
        <div><div class="b-name">${esc(b.name)}</div><div class="b-sub">${esc(b.sub || '')}</div></div>
        <div class="b-price"><div class="b-now">${money(b.price)}</div>${b.compare_at ? `<div class="b-was">${money(b.compare_at)}</div>` : ''}</div>
      </button>`
      )
      .join('');

    /* --- add-on --- */
    const addon = p.addon;
    if (addon && addon.enabled) {
      $('addonName').textContent = addon.name;
      $('addonDesc').textContent = addon.desc || '';
      $('addonPrice').textContent = money(addon.price);
      $('addon').addEventListener('click', () => {
        state.addon = !state.addon;
        $('addon').setAttribute('aria-checked', String(state.addon));
      });
      $('addon').addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          state.addon = !state.addon;
          $('addon').setAttribute('aria-checked', String(state.addon));
        }
      });
    } else {
      $('addonBlock').hidden = true;
    }

    /* --- timeline --- */
    $('timeline').innerHTML = (p.shipping_steps || [])
      .map(
        (s, i) => `
      <div class="tl">
        <div class="tl-ico" aria-hidden="true">${
          [
            '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
            '<svg viewBox="0 0 24 24"><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/></svg>',
            '<svg viewBox="0 0 24 24"><path d="M12 3 21 8v8l-9 5-9-5V8l9-5Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>'
          ][i] || ''
        }</div>
        <div class="tl-h">${esc(s.title)}</div><div class="tl-d">${esc(s.detail)}</div>
      </div>`
      )
      .join('');

    /* --- photo strip + lightbox --- */
    const strip = p.photo_strip || [];
    $('photoStripLabel').textContent = p.photo_strip_label || 'Gallery';
    $('photoStrip').innerHTML = strip
      .map(
        (im, i) => `
      <button class="vthumb" data-vid="${i}" aria-label="Enlarge photo ${i + 1}">
        <div class="media r916"><img src="${im.src}" alt="${esc(im.alt)}" loading="lazy"></div>
      </button>`
      )
      .join('');

    const lb = $('lb');
    const lbImg = $('lbImg');
    $('photoStrip').addEventListener('click', (e) => {
      const b = e.target.closest('.vthumb');
      if (!b) return;
      const im = strip[+b.dataset.vid];
      lbImg.src = im.src;
      lbImg.alt = im.alt;
      lb.classList.add('on');
      lb.setAttribute('aria-hidden', 'false');
      $('lbClose').focus();
    });
    function closeLb() {
      lb.classList.remove('on');
      lb.setAttribute('aria-hidden', 'true');
    }
    $('lbClose').addEventListener('click', closeLb);
    lb.addEventListener('click', (e) => {
      if (e.target === lb) closeLb();
    });

    /* --- specs --- */
    $('specs').innerHTML = (p.specs || [])
      .map((s) => `<div class="row"><dt>${esc(s.k)}</dt><dd>${esc(s.v)}</dd></div>`)
      .join('');

    /* --- FAQ accordion --- */
    const faq = p.faq || [];
    $('faqAcc').innerHTML = faq
      .map(
        (f, i) => `
      <div class="acc-item">
        <h3 style="margin:0">
          <button class="acc-q" aria-expanded="false" aria-controls="faq-a-${i}" id="faq-q-${i}">
            <span>${esc(f.q)}</span><span class="ic" aria-hidden="true"></span>
          </button>
        </h3>
        <div class="acc-a" id="faq-a-${i}" role="region" aria-labelledby="faq-q-${i}">
          <div class="acc-a-in">${esc(f.a)}</div>
        </div>
      </div>`
      )
      .join('');

    /* accordion clicks are delegated by app.js on [data-accordion] */

    /* --- reviews: real ones only, otherwise honest empty state --- */
    const reviews = p.reviews || [];
    if (reviews.length) {
      $('reviewsEmpty').hidden = true;
      const list = $('reviewsList');
      list.hidden = false;
      list.innerHTML = reviews
        .map(
          (r) => `
        <article class="card">
          <div class="st" aria-label="${r.rating} out of 5 stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
          <h3>${esc(r.title)}</h3>
          <p>${esc(r.body)}</p>
          <div class="who">${esc(r.name)}</div>
          <div class="when">${esc(r.date)}</div>
        </article>`
        )
        .join('');
      $('rvCount').textContent = reviews.length + (reviews.length === 1 ? ' review' : ' reviews');
    } else {
      $('rvCount').textContent = 'No reviews yet';
    }

    /* --- buy state --- */
    function activeBundle() {
      return bundles.find((b) => b.id === state.bundle) || bundles[0];
    }
    function selectedVariant() {
      return variants[state.variant] || variants[0] || { name: '', shopify_variant_id: '' };
    }
    function resolvedVariantId() {
      const b = activeBundle();
      return (b && b.shopify_variant_id) || selectedVariant().shopify_variant_id || '';
    }

    function updateBuy() {
      const b = activeBundle();
      const v = selectedVariant();
      const id = resolvedVariantId();
      const price = money(b.price);

      $('pPriceNow').textContent = price;
      $('pPriceWas').textContent = b.compare_at ? money(b.compare_at) : '';
      $('pPriceWas').hidden = !b.compare_at;
      document.querySelectorAll('#pills .pill').forEach((el, i) =>
        el.setAttribute('aria-pressed', String(i === state.variant))
      );
      document.querySelectorAll('#bundles .bundle').forEach((el) =>
        el.setAttribute('aria-checked', String(el.dataset.b === b.id))
      );

      $('sbName').textContent = p.short_name || p.name;
      $('sbPrice').textContent = (v.name ? v.name + ' · ' : '') + price;

      const linked = Boolean(id);
      [$('atc'), $('atc2')].forEach((btn) => {
        btn.disabled = !linked;
        btn.textContent = linked ? 'Add to bag — ' + price : 'Checkout link pending';
        btn.setAttribute('aria-disabled', String(!linked));
      });
      $('atcNote').hidden = linked;
      $('atcNote').innerHTML =
        'This product is not linked to the Shopify store yet, so checkout is disabled. ' +
        'Paste its variant ID into <b>assets/products.json</b> and the button activates — no code changes.';
    }

    $('pills').addEventListener('click', (e) => {
      const p2 = e.target.closest('.pill');
      if (!p2) return;
      state.variant = +p2.dataset.i;
      updateBuy();
    });
    $('bundles').addEventListener('click', (e) => {
      const b = e.target.closest('.bundle');
      if (!b) return;
      state.bundle = b.dataset.b;
      updateBuy();
    });

    function addToCart() {
      const id = resolvedVariantId();
      if (!id) {
        P.toast('Checkout link pending — this product has no Shopify variant ID yet');
        return;
      }
      const b = activeBundle();
      const v = selectedVariant();
      P.addLine({
        key: p.slug + ':' + b.id + ':' + v.name,
        title: p.name,
        variantTitle: [v.name, b.name].filter(Boolean).join(' · '),
        price: b.price,
        compareAt: b.compare_at,
        qty: b.qty || 1,
        image: p.images[0].src,
        imageAlt: p.images[0].alt,
        variantId: id,
        slug: p.slug
      });
      if (state.addon && addon && addon.enabled) {
        if (addon.shopify_variant_id) {
          P.addLine({
            key: p.slug + ':addon',
            title: addon.name,
            variantTitle: '',
            price: addon.price,
            compareAt: null,
            qty: 1,
            image: p.images[0].src,
            imageAlt: p.images[0].alt,
            variantId: addon.shopify_variant_id,
            slug: p.slug
          });
        } else {
          P.toast('Add-on has no Shopify variant ID yet — not added');
        }
      }
      P.openCart();
      P.toast((p.short_name || p.name) + ' added to bag');
    }

    $('atc').addEventListener('click', addToCart);
    $('atc2').addEventListener('click', addToCart);

    updateBuy();

    /* --- sticky bar: appears once the main buy button scrolls past --- */
    const sbar = $('sbar');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        (es) => {
          sbar.classList.toggle('on', !es[0].isIntersecting && es[0].boundingClientRect.top < 0);
        },
        { threshold: 0 }
      ).observe($('atc'));
    }

    /* --- free-shipping line in the promo block --- */
    $('promoCopy').textContent =
      'Orders over ' + P.money(P.config.commerce.free_shipping_threshold) + ' ship free within the US. 30-day money-back guarantee if the fit is wrong.';

    document.body.dataset.ready = 'true';
  }

  P.onReady((config) => {
    const slug = slugFromUrl();
    const p = P.productBySlug(slug);
    if (!p) {
      document.body.dataset.ready = 'error';
      $('pdpError').hidden = false;
      return;
    }
    try {
      render(p);
    } catch (err) {
      console.error('Product render failed:', err);
      document.body.dataset.ready = 'error';
      const el = $('pdpError');
      if (el) {
        el.hidden = false;
        el.textContent = 'This product could not be rendered: ' + err.message;
      }
    }
  });
})();
