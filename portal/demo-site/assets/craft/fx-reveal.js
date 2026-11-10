/* ============================================================================
   fx-reveal.js — technique-only port of Libraries.dev img-fx (sweep-gradient)
   ----------------------------------------------------------------------------
   Origin: Libraries.dev (Jakubantalik/Libraries.dev), packages/img-fx (engine/
   + presets/sweep-gradient.ts) — vendored 2026-09-04, MIT.
   img-fx proper is WebGL via three.js — not vendorable into a no-build static
   page. This file ports the IDEA of its sweep-gradient preset (a diagonal
   band materializes the image) as a DOM cell-stagger: the image's box is
   covered by an N×M grid of slice cells, each showing its own slice of the
   image; cells fade in on a diagonal (x+y) schedule with slight jitter, so
   the image "sweeps" into view top-left → bottom-right.
   HONEST LIMITS: this is a masked reveal, not a shader mosaic — do not claim
   parity with img-fx. For a zero-code fallback use scrollcraft's own
   data-sc-reveal="iris" + data-sc-in, which the vendored engine already
   provides.

   API:
     FxReveal.attach(imgEl, { cells: 12, ms: 900 })   // cells = grid per axis
   Rules: cap at 12×12 = 144 nodes; run ONLY on the first row of product
   cards (a full grid of these is a mobile perf failure). Fires once on
   IntersectionObserver entry — never on scroll-up re-entry. Reduced motion:
   image just appears (no-op). Cells are removed when the sweep finishes, so
   the <img> remains the accessible, crawlable element throughout.
   ========================================================================== */
(function (global) {
  'use strict';

  var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function sliceStyle(c, r, cols, rows, src) {
    return 'background-image:url("' + src + '");' +
      'background-size:' + (cols * 100) + '% ' + (rows * 100) + '%;' +
      'background-position:' + (cols ? (c / (cols - 1)) * 100 : 50) + '% ' + (rows ? (r / (rows - 1)) * 100 : 50) + '%;';
  }

  function attach(img, opts) {
    if (reduced || !img || !img.src) return { done: true };
    opts = opts || {};
    var cols = Math.min(12, Math.max(2, opts.cells || 12));
    var ms = opts.ms || 900;

    var rect = img.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return { done: true };
    var rows = Math.max(2, Math.min(12, Math.round((cols * rect.height) / rect.width)));
    if (cols * rows > 144) rows = Math.floor(144 / cols);

    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;overflow:hidden;width:' + rect.width + 'px;height:' + rect.height + 'px;';
    var src = img.currentSrc || img.src;
    img.style.visibility = 'hidden';
    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);

    var cells = [], i = 0;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var el = document.createElement('i');
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = 'position:absolute;left:' + (c * 100 / cols) + '%;top:' + (r * 100 / rows) + '%;' +
          'width:' + (100 / cols) + '%;height:' + (100 / rows) + '%;' +
          sliceStyle(c, r, cols, rows, src) +
          'opacity:0;transition:opacity 280ms ease;will-change:opacity;';
        wrap.appendChild(el);
        cells.push(el);
        i++;
      }
    }
    var total = rows + cols - 2;

    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      var n = 0;
      cells.forEach(function (el, idx) {
        var c = idx % cols, r = Math.floor(idx / cols);
        var diag = c + r;
        var jitter = (Math.random() - 0.5) * ms * 0.24;
        var delay = (diag / total) * ms + jitter;
        if (delay < 0) delay = 0;
        setTimeout(function () { el.style.opacity = '1'; n++; if (n === cells.length) cleanup(); }, delay);
      });
    }, { rootMargin: '40px' });

    function cleanup() {
      setTimeout(function () {
        img.style.visibility = '';
        cells.forEach(function (el) { el.parentNode && el.parentNode.removeChild(el); });
        if (wrap.parentNode) {
          wrap.parentNode.insertBefore(img, wrap);
          wrap.parentNode.removeChild(wrap);
        }
      }, 350);
    }

    io.observe(wrap);
    return { done: false };
  }

  global.FxReveal = { attach: attach };
})(typeof window !== 'undefined' ? window : this);
