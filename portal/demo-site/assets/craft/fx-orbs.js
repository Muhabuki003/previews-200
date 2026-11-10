/* ============================================================================
   fx-orbs.js — static port of Libraries.dev thinking-orbs (one state: morph)
   ----------------------------------------------------------------------------
   Origin: Libraries.dev (Jakubantalik/Libraries.dev), packages/thinking-orbs/
   src/engine/{core,morph,profiles}.ts — vendored 2026-09-04, MIT.
   The source ships nine dotted-orb states on plain 2D canvas; a storefront
   loading mark needs exactly one: the slowly shaping dotted outline (circle →
   triangle → square → circle), dots breathing faintly. Geometry ported
   directly from morph.ts; the rAF mount/dpr handling is written fresh.

   API:
     var orb = FxOrb.mount(canvasEl, { size: 64, color: '#c96f8c', speed: 1 });
     orb.stop();                                  // teardown (rAF cancelled)
   Defaults: size 64 (a separate design from the 20px inline size — not a
   scale factor), color resolves against the host page's --coll-accent when
   omitted, speed 1. Empty canvas + reduced motion = one static frame drawn,
   no loop started.

   Usage (replace a bare "Loading…" placeholder while data fetches):
     <div class="fx-orb"><canvas width="64" height="64" aria-hidden="true"></canvas></div>
     var orb = FxOrb.mount(document.querySelector('.fx-orb canvas'), { size: 64 });
     ...fetch().then(function(){ orb.stop(); detach the .fx-orb wrapper });
   ========================================================================== */
(function (global) {
  'use strict';

  function lerp(a, b, f) { return a + (b - a) * f; }
  function smoothE(x) { return x * x * (3 - 2 * x); }

  /* --- shape paths, parameterised by arc length (top-centre, clockwise) ---- */
  function polyPath(verts) {
    var V = verts.length, L = [], total = 0, i;
    for (i = 0; i < V; i++) {
      var a = verts[i], b = verts[(i + 1) % V];
      var l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      L.push(l); total += l;
    }
    return function (f) {
      var target = f * total, k = 0;
      while (target > L[k] && k < V - 1) { target -= L[k]; k++; }
      var a = verts[k], b = verts[(k + 1) % V];
      var ff = L[k] ? Math.min(1, target / L[k]) : 0;
      return [a[0] + (b[0] - a[0]) * ff, a[1] + (b[1] - a[1]) * ff];
    };
  }
  var CIRCLE = function (f) {
    var a = -Math.PI / 2 + f * 2 * Math.PI;
    return [Math.cos(a) * 0.24, Math.sin(a) * 0.24];
  };
  var TRIANGLE = polyPath([[0, -0.26], [0.24, 0.16], [-0.24, 0.16]]);
  var SQUARE = polyPath([[0, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2], [-0.2, -0.2]]);
  var CYCLE = [CIRCLE, TRIANGLE, SQUARE];
  var HOLD = 1.4, MORPH = 0.9, SEG = HOLD + MORPH;

  /* --- one frame of dots for time t (seconds) ------------------------------- */
  function morphDots(size, t) {
    var K = CYCLE.length, tc = t % (SEG * K);
    var k = Math.floor(tc / SEG), local = tc - k * SEG;
    var m = local > HOLD ? smoothE((local - HOLD) / MORPH) : 0;
    var pA = CYCLE[k], pB = CYCLE[(k + 1) % K];

    var M = 160, pts = [], L = [], total = 0, i;
    for (i = 0; i < M; i++) {
      var f = i / M, a = pA(f), b = pB(f);
      pts.push([lerp(a[0], b[0], m), lerp(a[1], b[1], m)]);
    }
    for (i = 0; i < M; i++) {
      var p1 = pts[i], p2 = pts[(i + 1) % M];
      var l = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      L.push(l); total += l;
    }
    var n = Math.max(6, Math.round(34 * 1));          /* 34 dots at iconD 1    */
    var re = 0.021 * 1.35;                            /* dot radius factor     */
    var pulse = 1 + 0.02 * Math.sin(local * 3.1);     /* faint breathing       */
    var c2 = size / 2, seg = 0, acc = 0, dots = [];
    for (var k2 = 0; k2 < n; k2++) {
      var target = (k2 / n) * total;
      while (acc + L[seg] < target && seg < M - 1) { acc += L[seg]; seg++; }
      var a = pts[seg], b = pts[(seg + 1) % M];
      var ff = L[seg] ? Math.min(1, (target - acc) / L[seg]) : 0;
      var x = (a[0] + (b[0] - a[0]) * ff) * pulse;
      var y = (a[1] + (b[1] - a[1]) * ff) * pulse;
      dots.push({ x: c2 + x * size, y: c2 + y * size, r: Math.max(0.35, re * size) });
    }
    return dots;
  }

  /* --- hex '#rrggbb' → [r,g,b] ---------------------------------------------- */
  function parseHex(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function cssAccent() {
    var src = document.body || document.documentElement;
    var v = getComputedStyle(src).getPropertyValue('--coll-accent').trim();
    return /^#/.test(v) ? v : null;
  }

  /* --- mount ----------------------------------------------------------------- */
  function mount(canvas, opts) {
    opts = opts || {};
    var size = opts.size || 64;
    var color = opts.color || cssAccent() || '#111111';
    var speed = opts.speed || 1;
    var rgb = parseHex(color) || [17, 17, 17];
    var fill = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.92)';
    var dpr = (global.devicePixelRatio || 1);
    var ctx = canvas.getContext('2d');
    var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var raf = 0, running = false, start = 0;

    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';

    function draw(t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      var dots = morphDots(size, t);
      ctx.fillStyle = fill;
      for (var i = 0; i < dots.length; i++) {
        ctx.beginPath();
        ctx.arc(dots[i].x, dots[i].y, dots[i].r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (reduced) { draw(0.5); return { stop: function () {} }; }

    function frame(now) {
      if (!start) start = now;
      draw(((now - start) / 1000) * speed);
      raf = global.requestAnimationFrame(frame);
    }
    raf = global.requestAnimationFrame(frame);
    running = true;
    return {
      stop: function () {
        if (running) { global.cancelAnimationFrame(raf); running = false; }
      }
    };
  }

  global.FxOrb = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
