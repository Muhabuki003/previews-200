/* PUPSTOP — home page product grid, rendered from assets/products.json. */

(function () {
  'use strict';

  const P = window.PUPSTOP;

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  P.onReady((config) => {
    const grid = document.getElementById('gridProducts');
    if (!grid) return;
    const products = config.products || [];

    grid.innerHTML =
      products
        .map(
          (p) => `
      <a class="pcard" href="${encodeURIComponent(p.slug)}.html" data-reveal>
        <div class="media r45"><img src="${p.images[0].src}" alt="${esc(p.images[0].alt)}" loading="lazy"></div>
        <div class="body">
          <span class="tag-new">${esc(p.eyebrow || 'New')}</span>
          <h3>${esc(p.name)}</h3>
          <p class="p">${esc(p.sub)}</p>
          <div class="row">
            <span class="now">${P.money(p.price)}</span>
            ${p.compare_at ? `<span class="was">${P.money(p.compare_at)}</span>` : ''}
          </div>
          <span class="go">View product
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13"/><path d="m13 6 6 6-6 6"/></svg>
          </span>
        </div>
      </a>`
        )
        .join('') +
      `<div class="pnote" data-reveal data-delay="1">
        <div>
          <h3>One product at a time</h3>
          <p>PUPSTOP adds a new dog car product only once the last one has earned its place. No catalogue filler, no 40-item grid of the same thing in different colours.</p>
        </div>
        <ul>
          <li>Next up: a back-seat cover that works with the harness</li>
          <li>Then: a boot divider for estate cars</li>
          <li>Every one gets its own landing page in this layout</li>
        </ul>
      </div>`;

    /* hero price + primary CTA, from config so it can never drift */
    const lead = products[0];
    if (lead) {
      const cta = document.querySelector('[data-role="hero-cta"]');
      if (cta) {
        cta.href = encodeURIComponent(lead.slug) + '.html';
        cta.innerHTML =
          'Shop the harness — ' + P.money(lead.price) +
          ' <svg viewBox="0 0 24 24" aria-hidden="true" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"><path d="M5 12h13"/><path d="m13 6 6 6-6 6"/></svg>';
      }
    }
    document.body.dataset.ready = 'true';
  });
})();
