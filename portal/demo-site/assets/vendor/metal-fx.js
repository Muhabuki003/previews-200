/**
 * metal-fx.js — zero-dependency vanilla-JS port of the `metal-fx` package.
 * ============================================================================
 * WHAT THIS IS
 *   Animated "liquid metal" WebGL2 material with three shapes:
 *     MetalFx.ring(host, opts)   — metal band around a button / chip / icon
 *     MetalFx.text(host, opts)   — metal inside the glyphs, with an inner rim
 *     MetalFx.badge(host, opts)  — the "New" pill: white fill, metal rim
 *   Plus MetalFx.supported(), MetalFx.glInfo() and instance.destroy().
 *
 *   No React, no imports, no build step, no CDN, no three.js. Load it with a
 *   plain <script src="metal-fx.js"></script> and use window.MetalFx.
 *   WebGL2 is required. Without it every factory degrades to the upstream
 *   behaviour: the host element is left as plain DOM, marked
 *   `data-metal-fx-unsupported` (and class `mfx-fallback`), and the returned
 *   instance's destroy() is a no-op. Nothing throws, nothing goes blank.
 *
 * PORT OF
 *   https://github.com/Jakubantalik/Libraries — packages/metal-fx/ (v2.0.10)
 *   MetalFx.tsx, MetalText.tsx, MetalBadge.tsx, useMetalBend.ts,
 *   engine/{shaders,presets,rim,textMask,renderer/core,renderer/outline,
 *   renderer/sampling,bend/config}.ts
 *
 *   Ported concepts (not copied code): the shared-renderer architecture (one
 *   offscreen GL sheet, per-instance 2D canvas that copies a scaled crop of it
 *   and carves the ring with destination-in / destination-out), the
 *   rounded-rect outline sampler, the cursor "liquid dent" spring field
 *   (directional gaussian + divergent radial term, with the BEND_DEFAULTS
 *   tuning values), the computed inner-shadow rim (band alpha minus the same
 *   band alpha shifted down one pixel), the DOM-metric text mask, and the
 *   chromatic / silver / gold preset parameter sets.
 *
 * ----------------------------------------------------------------------------
 * LICENSE — MIT (upstream `metal-fx`)
 *
 *   MIT License
 *
 *   Copyright (c) 2026 Jakub Antalik
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy
 *   of this software and associated documentation files (the "Software"), to deal
 *   in the Software without restriction, including without limitation the rights
 *   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *   copies of the Software, and to permit persons to whom the Software is
 *   furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in all
 *   copies or substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *   SOFTWARE.
 *
 * ----------------------------------------------------------------------------
 * SECOND LICENSE — Apache-2.0, Paper Shaders `liquidMetal` (upstream NOTICE)
 *
 *   Reproduced because upstream metal-fx v2's material IS Paper Shaders'
 *   `liquidMetal` and the package ships a NOTICE for it. Upstream NOTICE, verbatim:
 *
 *     metal-fx
 *     Copyright (c) Jakub Antalik
 *
 *     This product includes software developed by Paper Design, Inc.
 *
 *       Paper Shaders (https://github.com/paper-design/shaders)
 *       Copyright (c) Paper Design, Inc.
 *       Licensed under the Apache License, Version 2.0
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *     Specifically:
 *
 *       * The `liquidMetal` fragment shader is consumed unmodified at build time
 *         from the `@paper-design/shaders` npm package and inlined into the
 *         distributed bundle. See src/engine/shaders.ts.
 *
 *       * The sizing vertex shader in src/engine/shaders.ts (`VERT_SHADER_SRC`) is
 *         copied verbatim from `packages/shaders/src/vertex-shader.ts` @ 0.0.80.
 *         It is vendored rather than imported because the package exposes it only
 *         through `ShaderMount`, which owns its own canvas and animation loop.
 *
 *     No changes were made to either shader's source.
 *
 *   Apache License 2.0 text: http://www.apache.org/licenses/LICENSE-2.0
 *
 *   HONEST SCOPE NOTE (read this before assuming provenance):
 *   this port does NOT bundle @paper-design/shaders and does NOT contain Paper's
 *   shader code. Both GLSL stages below are written from scratch for this port
 *   (a value-noise fbm warp over a sharpened stripe field with per-channel
 *   dispersion, a travelling specular sweep and a curvature vignette — using the
 *   same near-white/near-black stripe endpoints and tint-as-colour-burn idea so
 *   the three upstream presets keep their meaning). The Apache-2.0 attribution
 *   above is reproduced because this file is a port of a package that carries it,
 *   and because the visual design of the material is Paper's.
 *
 * ----------------------------------------------------------------------------
 * DIFFERENCES FROM UPSTREAM (deliberate, this port is not a byte-for-byte clone)
 *   - ~320px shared sheet at fixed resolution instead of 96px + DPR scaling; the
 *     crop is chosen per element from a target on-screen stripe period
 *     (`periodCssPx`) so a 110px chip and a 140px button read at the same
 *     physical metal density instead of one of them going flat.
 *   - The glow is a single blurred copy of the band (canvas `filter: blur()`)
 *     rather than upstream's multi-path SVG halo with per-frame luminance
 *     readback. Subtler, and it matches a dark dashboard palette ("no neon").
 *   - The inner-shadow rim is drawn as two clipped hairline strokes on the
 *     deformed outline instead of an alpha-difference + gaussian pass on the
 *     band, EXCEPT for MetalText, which uses the real alpha-difference maths
 *     because an inner shadow inside a glyph is the whole point of that variant.
 *   - No proximity reflections onto neighbouring elements (upstream's
 *     reflectionTargets) — out of scope, noted here so it isn't mistaken for a
 *     bug.
 */

/* eslint-disable no-bitwise */
(function (global, factory) {
  var api = factory();
  if (global) global.MetalFx = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  // ────────────────────────────────────────────────────────────────────────
  // Constants
  // ────────────────────────────────────────────────────────────────────────

  /** Shared GL sheet edge, device px. Upstream uses 96 (plasma-era, soft). */
  var SHEET = 320;
  /** Main loop interval: shader + composite. 33ms ≈ 30fps (upstream: 66ms). */
  var FRAME_INTERVAL_MS = 33;
  /** Interval while a cursor dent is running — the dent is the one 60fps thing. */
  var FRAME_INTERVAL_ACTIVE_MS = 16;
  /** Cap on devicePixelRatio for per-instance 2D canvases. */
  var DPR_CAP = 2;
  /** Baseline pill box upstream calibrates `shaderScale` against. */
  var CANONICAL_PILL_W = 140;
  var CANONICAL_PILL_H = 40;
  /** Outline sampling: points per corner arc / spacing along straight edges. */
  var ARC_N = 14;
  var EDGE_STEP = 1.5;

  /**
   * Preset parameter sets. `repetition` here is stripe periods across the whole
   * sheet (this port's unit) — upstream's 1.5 was over its own 96px sheet.
   * Tint is applied as a colour-burn weighted by `tintAmount`, matching the
   * way Paper's shader consumes `colorTint` (alpha = blend amount).
   */
  var PRESETS = {
    chromatic: {
      tint: '#88ccff', tintAmount: 0.34, shiftRed: 0.75, shiftBlue: 0.75,
      repetition: 14, softness: 0.055, distortion: 0.16, contour: 0.40,
      angle: 90, speed: 1.0, bright: 1.0, shaderOpacity: 1.0
    },
    silver: {
      tint: '#ffffff', tintAmount: 0.40, shiftRed: 0.30, shiftBlue: 0.30,
      repetition: 14, softness: 0.070, distortion: 0.10, contour: 0.40,
      angle: 90, speed: 1.0, bright: 0.96, shaderOpacity: 0.92
    },
    gold: {
      tint: '#ffcc55', tintAmount: 0.72, shiftRed: 0.30, shiftBlue: 0.30,
      repetition: 15, softness: 0.060, distortion: 0.12, contour: 0.42,
      angle: 90, speed: 0.85, bright: 1.02, shaderOpacity: 0.95
    }
  };

  /**
   * Cursor "liquid dent" tuning. Values carried over from upstream
   * engine/bend/config.ts BEND_DEFAULTS so the feel matches; the field maths
   * implemented below is described in the comments there.
   */
  var BEND_DEFAULTS = {
    enabled: true,
    strength: 0.74,
    fadeInMs: 200,
    fadeOutMs: 350,
    smoothMs: 140,
    reach: 36,
    blob: 13,
    liquidBlob: 10,
    maxDisp: 9,
    gain: 0.6,
    pressGain: 0.55,
    pullGain: 0.49,
    press: 5,
    liquid: 7.5,
    liquidReach: 8,
    liquidStiffness: 53,
    liquidDamping: 9,
    stiffness: 260,
    damping: 13,
    mass: 1,
    follow: 0.32
  };

  var GLSL_VERT = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 a_pos;',
    'void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }'
  ].join('\n');

  var GLSL_FRAG = [
    '#version 300 es',
    'precision highp float;',
    '',
    'uniform vec2  u_resolution;',
    'uniform float u_time;',
    'uniform float u_reps;',
    'uniform float u_softness;',
    'uniform float u_distortion;',
    'uniform float u_contour;',
    'uniform float u_shiftRed;',
    'uniform float u_shiftBlue;',
    'uniform float u_angle;',
    'uniform float u_scale;',
    'uniform vec3  u_tint;',
    'uniform float u_tintAmount;',
    'uniform float u_bright;',
    '',
    'out vec4 fragColor;',
    '',
    'float hash21(vec2 p) {',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    '',
    'float vnoise(vec2 p) {',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  float a = hash21(i);',
    '  float b = hash21(i + vec2(1.0, 0.0));',
    '  float c = hash21(i + vec2(0.0, 1.0));',
    '  float d = hash21(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',
    '',
    'float fbm(vec2 p) {',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  for (int i = 0; i < 3; i++) {',
    '    v += a * vnoise(p);',
    '    p = p * 2.07 + vec2(11.3, 7.9);',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',
    '',
    '// One stripe period of metal: bright sheet body, dark gap, soft shoulders.',
    'float stripe(float c, float s) {',
    '  float f = fract(c);',
    '  return smoothstep(0.0, s, f) * (1.0 - smoothstep(1.0 - s, 1.0, f));',
    '}',
    '',
    'vec3 burn(vec3 a, vec3 b) {',
    '  return 1.0 - min(vec3(1.0), (1.0 - a) / max(b, vec3(0.02)));',
    '}',
    '',
    'void main() {',
    '  vec2 res = u_resolution;',
    '  // Pattern space: y in [-0.5, 0.5], 1.0 == sheet height, aspect kept.',
    '  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;',
    '  p *= u_scale;',
    '  float t = u_time;',
    '',
    '  float ca = cos(u_angle), sa = sin(u_angle);',
    '  vec2 r = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);',
    '',
    '  // Liquid churn. Noise is stretched along the stripes so the warp reads as',
    '  // flowing material rather than as grain.',
    '  vec2 nq = vec2(r.x * 0.45, r.y * 1.15) + vec2(t * 0.021, -t * 0.013);',
    '  float n1 = fbm(nq);',
    '  float n2 = vnoise(nq * 5.3 + vec2(3.1, -t * 0.05));',
    '  float warp = ((n1 - 0.5) * 2.2 + (n2 - 0.5) * 0.55) * (0.5 + u_distortion * 4.0);',
    '',
    '  float coord = r.y * u_reps + warp + t * 0.06;',
    '  float s = clamp(u_softness, 0.002, 0.5);',
    '',
    '  // Dispersion: R and B sample the stripe field at a shifted coordinate,',
    '  // which is the only place colour separation can come from in this model.',
    '  float g  = stripe(coord, s);',
    '  float rr = stripe(coord + u_shiftRed * 0.9, s);',
    '  float bb = stripe(coord - u_shiftBlue * 0.9, s);',
    '',
    '  vec3 dark = vec3(0.085, 0.090, 0.095);',
    '  vec3 lite = vec3(0.985, 0.985, 1.000);',
    '  vec3 band = vec3(rr, g, bb);',
    '  vec3 col = lite * band + dark * (1.0 - band);',
    '',
    '  // Rolled-sheet edge light: brightest where a stripe transitions.',
    '  col += vec3(0.22) * (g * (1.0 - g) * 4.0);',
    '',
    '  // Travelling specular sweep across the sheet.',
    '  float sweep = exp(-pow((r.y + 0.5 - fract(t * 0.041)) * 5.0, 2.0));',
    '  col += vec3(0.30) * sweep * (0.35 + 0.65 * g);',
    '',
    '  // Curvature: a mild vignette so the sheet reads as a bent surface.',
    '  float vg = length(vec2(r.x * 0.55, r.y * 0.85));',
    '  col *= 1.0 - u_contour * 0.55 * smoothstep(0.05, 0.62, vg);',
    '',
    '  col *= u_bright;',
    '  col = mix(col, burn(col, u_tint), clamp(u_tintAmount, 0.0, 1.0));',
    '  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  // ────────────────────────────────────────────────────────────────────────
  // Small helpers
  // ────────────────────────────────────────────────────────────────────────

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function hexToRgb(hex) {
    var h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h.slice(0, 6), 16);
    if (!isFinite(n)) n = 0xffffff;
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }

  /** Reusable flat point buffer for outlines (x0,y0,x1,y1,…). */
  function createOutlineBuf(capacity) {
    return { xy: new Float32Array((capacity || 512) * 2), n: 0 };
  }

  var _o = { x: 0, y: 0 };

  /**
   * Sample a rounded rect clockwise from the end of the top-left corner into
   * `buf`. `deform` (optional) displaces every emitted point — that is how the
   * cursor dent bends the silhouette while keeping the edges anti-aliased at any
   * stretch (a pixel displacement filter can't).
   */
  function roundRectOutline(x, y, w, h, rad, deform, buf) {
    buf = buf || createOutlineBuf();
    rad = Math.max(0, Math.min(rad, Math.min(w, h) / 2));
    var need = 4 * (ARC_N + 1) + Math.ceil((2 * (w + h)) / EDGE_STEP) + 8;
    if (buf.xy.length < need * 2) buf.xy = new Float32Array(need * 2);
    var xy = buf.xy;
    var n = 0;
    function push(px, py) {
      if (deform) { deform(px, py, _o); xy[n * 2] = _o.x; xy[n * 2 + 1] = _o.y; }
      else { xy[n * 2] = px; xy[n * 2 + 1] = py; }
      n++;
    }
    function edge(x0, y0, x1, y1) {
      var len = Math.hypot(x1 - x0, y1 - y0);
      var k = Math.max(1, Math.ceil(len / EDGE_STEP));
      for (var i = 0; i < k; i++) { var tt = i / k; push(x0 + (x1 - x0) * tt, y0 + (y1 - y0) * tt); }
    }
    function arc(cx, cy, a0, a1) {
      for (var i = 0; i <= ARC_N; i++) {
        var a = a0 + (a1 - a0) * (i / ARC_N);
        push(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
      }
    }
    edge(x + rad, y, x + w - rad, y);
    arc(x + w - rad, y + rad, -Math.PI / 2, 0);
    edge(x + w, y + rad, x + w, y + h - rad);
    arc(x + w - rad, y + h - rad, 0, Math.PI / 2);
    edge(x + w - rad, y + h, x + rad, y + h);
    arc(x + rad, y + h - rad, Math.PI / 2, Math.PI);
    edge(x, y + h - rad, x, y + rad);
    arc(x + rad, y + rad, Math.PI, 1.5 * Math.PI);
    buf.n = n;
    return buf;
  }

  /** Emit an outline buffer as a canvas path, scaled+offset out of css px. */
  function tracePath(ctx, buf, scale, offX, offY) {
    var xy = buf.xy;
    for (var i = 0; i < buf.n; i++) {
      var x = xy[i * 2] * scale + offX;
      var y = xy[i * 2 + 1] * scale + offY;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /** Separable box blur (twice ≈ gaussian) over a Float32 alpha plane. */
  function boxBlurAlpha(src, w, h, radius) {
    var r = Math.max(0, Math.round(radius));
    if (r < 1) return src;
    var tmp = new Float32Array(src.length);
    var out = new Float32Array(src.length);
    var norm = 1 / (2 * r + 1);
    var x, y, i, sum;
    for (y = 0; y < h; y++) {
      var row = y * w;
      for (x = 0; x < w; x++) {
        sum = 0;
        for (i = -r; i <= r; i++) sum += src[row + clamp(x + i, 0, w - 1)];
        tmp[row + x] = sum * norm;
      }
    }
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) {
        sum = 0;
        for (i = -r; i <= r; i++) sum += tmp[clamp(y + i, 0, h - 1) * w + x];
        out[y * w + x] = sum * norm;
      }
    }
    return out;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Shared WebGL2 renderer — one offscreen sheet, every instance crops it
  // ────────────────────────────────────────────────────────────────────────

  var SHARED = null;
  var _supported = null;
  var _contextLost = false;

  function supported() {
    if (_supported !== null) return _supported;
    if (typeof document === 'undefined') return (_supported = false);
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2');
      _supported = !!gl;
      if (gl) {
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
    } catch (e) {
      _supported = false;
    }
    return _supported;
  }

  /** Honest capability report — used by the demo to say which path ran. */
  function glInfo() {
    var out = { available: false, vendor: null, renderer: null, version: null, reason: null };
    if (typeof document === 'undefined') { out.reason = 'no-dom'; return out; }
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2');
      if (!gl) { out.reason = 'webgl2-context-unavailable'; return out; }
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      out.available = true;
      out.vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      out.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      out.version = gl.getParameter(gl.VERSION);
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    } catch (e) {
      out.reason = String(e && e.message ? e.message : e);
    }
    return out;
  }

  function compileStage(gl, type, src) {
    var sh = gl.createShader(type);
    if (!sh) throw new Error('metal-fx: gl.createShader returned null');
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('metal-fx: shader compile failed: ' + (log || '(no info log)'));
    }
    return sh;
  }

  function buildPipeline(gl) {
    var vs = compileStage(gl, gl.VERTEX_SHADER, GLSL_VERT);
    var fs = compileStage(gl, gl.FRAGMENT_SHADER, GLSL_FRAG);
    var prog = gl.createProgram();
    if (!prog) throw new Error('metal-fx: gl.createProgram returned null');
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      var log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error('metal-fx: program link failed: ' + (log || '(no info log)'));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    if (!buf) throw new Error('metal-fx: gl.createBuffer returned null');
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var names = ['u_resolution', 'u_time', 'u_reps', 'u_softness', 'u_distortion', 'u_contour',
      'u_shiftRed', 'u_shiftBlue', 'u_angle', 'u_scale', 'u_tint', 'u_tintAmount', 'u_bright'];
    var uniforms = {};
    for (var i = 0; i < names.length; i++) uniforms[names[i]] = gl.getUniformLocation(prog, names[i]);
    return { program: prog, buffer: buf, uniforms: uniforms };
  }

  function ensureShared() {
    if (SHARED && !_contextLost) return SHARED;
    if (!supported()) return null;

    var canvas = document.createElement('canvas');
    canvas.width = SHEET;
    canvas.height = SHEET;
    var gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true
    });
    if (!gl) { _supported = false; return null; }

    var pipe = buildPipeline(gl);
    gl.viewport(0, 0, SHEET, SHEET);
    gl.clearColor(0, 0, 0, 1);
    gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // One GL→2D readback per sheet frame, shared by every instance. Without
    // this each instance's drawImage(GLcanvas, …) forces its own readback, which
    // in a software rasterizer costs ~10x more than the composite itself.
    var mirror = document.createElement('canvas');
    mirror.width = SHEET;
    mirror.height = SHEET;
    var mctx = mirror.getContext('2d');

    SHARED = {
      canvas: canvas,
      mirror: mirror,
      mctx: mctx,
      gl: gl,
      program: pipe.program,
      buffer: pipe.buffer,
      uniforms: pipe.uniforms,
      instances: [],
      raf: 0,
      stats: { frames: 0, instances: 0, listLen: 0, sheetMsSum: 0, drawMsSum: 0, sheetMs: 0, drawMs: 0, tickMs: 0 },
      startMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      lastDrawMs: -1e9,
      preset: 'chromatic',
      presetDirty: true,
      hex: '',
      ctxLost: false
    };

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      if (SHARED) SHARED.ctxLost = true;
      _contextLost = true;
    }, false);
    canvas.addEventListener('webglcontextrestored', function () {
      if (!SHARED) return;
      var rebuilt = buildPipeline(SHARED.gl);
      SHARED.program = rebuilt.program;
      SHARED.buffer = rebuilt.buffer;
      SHARED.uniforms = rebuilt.uniforms;
      SHARED.presetDirty = true;
      SHARED.ctxLost = false;
      _contextLost = false;
    }, false);

    if (typeof requestAnimationFrame === 'function') {
      TICK = tick;
      SHARED.raf = requestAnimationFrame(TICK);
    }
    return SHARED;
  }

  function presetFor(name) { return PRESETS[name] || PRESETS.chromatic; }

  function drawSheet(nowMs) {
    var S = SHARED;
    if (!S || S.ctxLost) return;
    var gl = S.gl;
    var P = presetFor(S.preset);
    var u = S.uniforms;
    var t = ((nowMs - S.startMs) / 1000) * P.speed;

    gl.useProgram(S.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, S.buffer);
    var loc = gl.getAttribLocation(S.program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    if (u.u_resolution) gl.uniform2f(u.u_resolution, SHEET, SHEET);
    if (u.u_time) gl.uniform1f(u.u_time, t);
    if (u.u_reps) gl.uniform1f(u.u_reps, P.repetition);
    if (u.u_softness) gl.uniform1f(u.u_softness, P.softness);
    if (u.u_distortion) gl.uniform1f(u.u_distortion, P.distortion);
    if (u.u_contour) gl.uniform1f(u.u_contour, P.contour);
    if (u.u_shiftRed) gl.uniform1f(u.u_shiftRed, P.shiftRed);
    if (u.u_shiftBlue) gl.uniform1f(u.u_shiftBlue, P.shiftBlue);
    if (u.u_angle) gl.uniform1f(u.u_angle, (P.angle * Math.PI) / 180);
    if (u.u_scale) gl.uniform1f(u.u_scale, 1);
    if (u.u_bright) gl.uniform1f(u.u_bright, P.bright);
    if (u.u_tintAmount) gl.uniform1f(u.u_tintAmount, P.tintAmount);
    if (u.u_tint) { var c = hexToRgb(P.tint); gl.uniform3f(u.u_tint, c.r, c.g, c.b); }

    gl.viewport(0, 0, SHEET, SHEET);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    S.mctx.drawImage(S.canvas, 0, 0);
    S.lastDrawMs = nowMs;
  }

  function tick(nowMs) {
    var S = SHARED;
    if (!S) return;
    S.raf = requestAnimationFrame(TICK);
    if (S.ctxLost) return;

    var ta = nowPerf();
    var sheetDue = nowMs - S.lastDrawMs >= FRAME_INTERVAL_MS - 1;
    if (sheetDue) drawSheet(nowMs);
    var tb = nowPerf();

    var list = S.instances;
    var drew = 0;
    for (var i = 0; i < list.length; i++) {
      var inst = list[i];
      if (!inst || inst.destroyed) continue;
      if (inst.visible === false) continue; // off-screen: costs nothing
      if (sheetDue || inst.needsDraw(nowMs)) { inst.draw(nowMs, sheetDue); drew++; }
    }
    var tc = nowPerf();

    // Rolling diagnostics. The demo's readout and the headless verifier both
    // report these, so a slow frame gets attributed instead of guessed at:
    // `sheetMs` is the GL draw + the one GL→2D readback, `drawMs` is all the
    // per-instance compositing. Whatever is left of the frame is the browser's
    // own paint/composite time, which this code does not control.
    var st = S.stats;
    st.frames++;
    st.instances = drew;
    st.listLen = list.length;
    st.sheetMsSum += (tb - ta);
    st.drawMsSum += (tc - tb);
    st.sheetMs = +(st.sheetMsSum / st.frames).toFixed(2);
    st.drawMs = +(st.drawMsSum / st.frames).toFixed(2);
    st.tickMs = +(st.sheetMsSum + st.drawMsSum) / st.frames;
  }

  /** rAF indirection so tick can be referenced before its definition. */
  var TICK = null;

  function nowPerf() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  // ────────────────────────────────────────────────────────────────────────
  // Global pointer tracking (cursor light + liquid dent)
  // ────────────────────────────────────────────────────────────────────────

  var POINTER = { x: 0, y: 0, vx: 0, vy: 0, has: false, down: false };
  var _lastPointer = null;
  var _pointerBound = 0;

  function pointerInit() {
    if (_pointerBound++) return;
    if (typeof document === 'undefined') return;
    document.addEventListener('pointermove', function (e) {
      var n = performance.now();
      if (_lastPointer) {
        var dt = Math.max(0.004, (n - _lastPointer.t) / 1000);
        var a = 1 - Math.exp(-dt / 0.04); // ~40ms time constant, event-rate independent
        POINTER.vx += ((e.clientX - _lastPointer.x) / dt - POINTER.vx) * a;
        POINTER.vy += ((e.clientY - _lastPointer.y) / dt - POINTER.vy) * a;
      }
      _lastPointer = { x: e.clientX, y: e.clientY, t: n };
      POINTER.x = e.clientX;
      POINTER.y = e.clientY;
      POINTER.has = true;
    }, { passive: true });
    document.addEventListener('pointerleave', function () {
      POINTER.has = false; _lastPointer = null;
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', function () { POINTER.has = false; _lastPointer = null; });
    }
    document.addEventListener('pointerdown', function () { POINTER.down = true; });
    document.addEventListener('pointerup', function () { POINTER.down = false; });
    document.addEventListener('pointercancel', function () { POINTER.down = false; });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Instance
  // ────────────────────────────────────────────────────────────────────────

  var uid = 0;
  /** Baked 1×64 vertical sheen strip, shared by every instance. */
  var SHEEN_CANVAS = null;

  function fail(host, kind) {
    host.classList.add('mfx-fallback');
    host.setAttribute('data-metal-fx-unsupported', '');
    host.setAttribute('data-metal-fx-kind', kind);
    var api = {
      host: host, kind: kind, supported: false, destroyed: false,
      needsDraw: function () { return false; },
      draw: function () {},
      update: function () { return api; },
      refresh: function () {},
      destroy: function () { api.destroyed = true; }
    };
    return api;
  }

  function createInstance(kind, host, options) {
    if (!host || !host.nodeType) throw new Error('metal-fx: ' + kind + '() needs a DOM element');
    if (!supported()) return fail(host, kind);
    var S = ensureShared();
    if (!S) return fail(host, kind);
    pointerInit();

    var opts = options || {};
    var inst = {
      id: ++uid,
      kind: kind,
      host: host,
      destroyed: false,
      supported: true,
      S: S
    };

    // ---- shared options -------------------------------------------------
    inst.preset = opts.preset || 'chromatic';
    inst.strength = clamp(opts.strength == null ? 1 : opts.strength, 0, 1);
    inst.opacity = opts.metalOpacity == null ? 1 : clamp(opts.metalOpacity, 0, 1);
    inst.shaderScale = opts.shaderScale || (kind === 'circle' ? 1.3 : 1.6);
    inst.periodCssPx = opts.periodCssPx || (kind === 'text' ? 110 : (kind === 'chip' ? 26 : 34));
    inst.cornerRadius = opts.borderRadius == null ? null : Number(opts.borderRadius);
    inst.glow = opts.glow === undefined ? (kind === 'ring' || kind === 'chip' || kind === 'badge') : !!opts.glow;
    inst.glowPx = opts.glowPx == null ? 7 : Number(opts.glowPx);
    inst.glowAlpha = opts.glowAlpha == null ? 0.30 : Number(opts.glowAlpha);
    inst.sheen = opts.sheen === undefined ? true : !!opts.sheen;
    inst.bend = opts.bend === undefined ? (kind === 'ring' || kind === 'chip') : !!opts.bend;
    inst.bendCfg = Object.assign({}, BEND_DEFAULTS, opts.bendConfig || {});

    if (S.preset !== inst.preset) { /* presets are per-sheet; last writer wins */ }
    S.preset = inst.preset;

    // ---- DOM ------------------------------------------------------------
    host.classList.add('mfx-root');
    host.setAttribute('data-metal-fx-kind', kind);
    host.setAttribute('data-metal-fx-preset', inst.preset);
    var hostCS = getComputedStyle(host);
    if (hostCS.position === 'static') host.style.position = 'relative';

    // ---- canvases -------------------------------------------------------
    var canvas = document.createElement('canvas');
    canvas.className = 'mfx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;pointer-events:none;display:block;z-index:0';
    var ctx = canvas.getContext('2d');
    var scratch = document.createElement('canvas');
    var sctx = scratch.getContext('2d');
    host.appendChild(canvas);

    var dpr = clamp(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1, 1, DPR_CAP);

    // ---- dent state -----------------------------------------------------
    var D = {
      cx: 0, cy: 0, ax: 0, ay: 0, vax: 0, vay: 0,
      la: 0, vla: 0, stx: 0, sty: 0, stl: 0,
      pressure: 0, env: 0, active: false, lastMs: 0
    };
    var _field = { x: 0, y: 0 };
    var fDirX = 0, fDirY = 0, fRadK = 0, fS2b = 1, fS2l = 1;

    function evalField(x, y, out) {
      var dx = x - D.cx, dy = y - D.cy;
      var q = dx * dx + dy * dy;
      var gb = Math.exp(-q / fS2b);
      var gl2 = Math.exp(-q / fS2l);
      out.x = fDirX * gb + dx * fRadK * gl2;
      out.y = fDirY * gb + dy * fRadK * gl2;
    }

    var deformOn = false;
    var deformFn = function (x, y, out) {
      evalField(x, y, _field);
      out.x = x + _field.x;
      out.y = y + _field.y;
    };

    function bendActive() { return deformOn && (D.env > 0.001 || D.active); }

    /** Integrate the spring field. Mirrors upstream useMetalBend's simulation. */
    function stepBend(nowMs, cssW, cssH, rect) {
      var cfg = inst.bendCfg;
      var dt = D.lastMs ? clamp((nowMs - D.lastMs) / 1000, 0.001, 0.032) : 1 / 60;
      D.lastMs = nowMs;

      var ecx = cssW / 2, ecy = cssH / 2;
      var tx = 0, ty = 0;
      D.pressure = 0;

      if (cfg.enabled && POINTER.has) {
        var lx = POINTER.x - rect.left, ly = POINTER.y - rect.top;
        var ddx = lx - ecx, ddy = ly - ecy;
        var d = Math.hypot(ddx, ddy);
        var R = Math.min(cssW, cssH) / 2;
        var reach = Math.max(cssW, cssH) / 2 + cfg.reach;
        var wasActive = D.active;
        D.active = d < reach;
        var u = Math.max(0, 1 - Math.abs(d - R) / Math.max(1, cfg.liquidReach));
        D.pressure = u * u * (3 - 2 * u);
        if (D.active) {
          if (!wasActive) { D.cx = lx; D.cy = ly; }
          // `follow` is defined per 60Hz frame; convert to this frame's dt.
          var fa = 1 - Math.pow(1 - Math.min(0.999, cfg.follow), dt * 60);
          D.cx += (lx - D.cx) * fa;
          D.cy += (ly - D.cy) * fa;
          var edgeFade = 1 - Math.max(0, (d - (reach - cfg.reach)) / cfg.reach);
          tx = POINTER.vx * (cfg.gain / 100) * edgeFade;
          ty = POINTER.vy * (cfg.gain / 100) * edgeFade;
          var ux = d > 0.001 ? ddx / d : 0, uy = d > 0.001 ? ddy / d : 0;
          var pen = R - d;
          if (pen > 0) {
            // Inside the edge: press toward the centre by penetration depth.
            var mp = pen * cfg.pressGain;
            tx -= ux * mp; ty -= uy * mp;
          } else {
            // Outside: pull toward the cursor, fading out at reach.
            var out = -pen;
            var f = Math.max(0, 1 - out / Math.max(1, cfg.reach));
            var mo = out * cfg.pullGain * (f * f * (3 - 2 * f));
            tx += ux * mo; ty += uy * mo;
          }
          var tm = Math.hypot(tx, ty);
          if (tm > cfg.maxDisp) { tx *= cfg.maxDisp / tm; ty *= cfg.maxDisp / tm; }
        }
      } else {
        D.active = false;
      }

      // Low-pass the targets so the springs chase a smooth signal.
      var sa = 1 - Math.exp(-(dt * 1000) / Math.max(1, cfg.smoothMs));
      D.stx += (tx - D.stx) * sa;
      D.sty += (ty - D.sty) * sa;

      var m = Math.max(0.05, cfg.mass);
      D.vax += ((-cfg.stiffness * (D.ax - D.stx) - cfg.damping * D.vax) / m) * dt;
      D.vay += ((-cfg.stiffness * (D.ay - D.sty) - cfg.damping * D.vay) / m) * dt;
      D.ax += D.vax * dt; D.ay += D.vay * dt;

      var pressAmt = POINTER.down && D.active && cfg.enabled ? cfg.press : 0;
      var tl = D.active && cfg.enabled ? cfg.liquid * (D.pressure + (POINTER.down ? 0.5 : 0)) : 0;
      D.stl += (tl - D.stl) * sa;
      D.vla += ((-cfg.liquidStiffness * (D.la - D.stl) - cfg.liquidDamping * D.vla) / m) * dt;
      D.la += D.vla * dt;

      var envTarget = D.active && cfg.enabled ? 1 : 0;
      var tauMs = Math.max(1, envTarget ? cfg.fadeInMs : cfg.fadeOutMs) / 3;
      D.env += (envTarget - D.env) * (1 - Math.exp(-(dt * 1000) / tauMs));
      if (D.env < 0.002 && envTarget === 0) D.env = 0;

      var amp = Math.hypot(D.ax, D.ay);
      var idle = !D.active && D.env === 0 && amp < 0.05 && Math.hypot(D.vax, D.vay) < 1 &&
        Math.abs(D.la) < 0.05 && pressAmt === 0;
      if (idle) {
        D.ax = D.ay = D.vax = D.vay = D.la = D.vla = 0;
        D.stx = D.sty = D.stl = 0;
        return false;
      }

      var k = Math.max(0, cfg.strength) * D.env;
      var pdx = ecx - D.cx, pdy = ecy - D.cy;
      var pl = Math.hypot(pdx, pdy) || 1; pdx /= pl; pdy /= pl;
      var sb = Math.max(0.5, cfg.blob), sl = Math.max(0.5, cfg.liquidBlob);
      fS2b = 2 * sb * sb; fS2l = 2 * sl * sl;
      fDirX = (D.ax + pdx * pressAmt) * k;
      fDirY = (D.ay + pdy * pressAmt) * k;
      fRadK = (D.la / sl) * k;
      return true;
    }

    // ---- per-kind geometry ---------------------------------------------
    var maskFn = null;          // painted in device px, origin = canvas top-left
    var maskNeedsPaint = true;
    var ringPx = null;          // css px band thickness, ring/chip only
    var isMaskKind = false;

    function resolveRadius(cssW, cssH) {
      if (inst.cornerRadius != null) return Math.min(inst.cornerRadius, Math.min(cssW, cssH) / 2);
      if (kind === 'badge') return Math.min(cssH, cssW) / 2;
      if (kind === 'circle') return Math.min(cssW, cssH) / 2;
      var raw = parseFloat(getComputedStyle(host).borderTopLeftRadius);
      if (!isFinite(raw) || raw <= 0) raw = 8;
      return Math.min(raw, Math.min(cssW, cssH) / 2);
    }

    /**
     * Copy a crop of the shared sheet into `dst` sized to the element box.
     * `periodCssPx` sets how many css px one stripe period occupies on screen,
     * which is what keeps a small chip and a wide headline at the same physical
     * metal density (upstream keys this off `shaderScale` against a 140x40 box).
     */
    function copySheet(dstCtx, cssW, cssH, offX, offY, dprNow) {
      var reps = presetFor(inst.preset).repetition;
      // src px per css px needed for the target period, clamped so the crop
      // never leaves the sheet (that clamp is what preserves aspect ratio).
      var s = SHEET / (inst.periodCssPx * reps);
      s = Math.min(s, SHEET / Math.max(1, cssW), SHEET / Math.max(1, cssH));
      s *= inst.shaderScale / 1.6; // 1.6 == the canonical pill, as upstream
      var srcW = Math.max(1, Math.min(SHEET, cssW * s));
      var srcH = Math.max(1, Math.min(SHEET, cssH * s));
      var sx = (SHEET - srcW) / 2;
      var sy = (SHEET - srcH) / 2;
      dstCtx.drawImage(
        S.mirror,
        sx, sy, srcW, srcH,
        offX, offY, cssW * dprNow, cssH * dprNow
      );
    }

    /** Soft cursor light: brightens the metal near the pointer, clipped to shape. */
    function drawCursorLight(dstCtx, cssW, cssH, offX, offY, dprNow, rect) {
      if (!POINTER.has) return 0;
      var lx = POINTER.x - rect.left, ly = POINTER.y - rect.top;
      if (lx < -60 || ly < -60 || lx > cssW + 60 || ly > cssH + 60) return 0;
      var d = Math.hypot(lx - cssW / 2, ly - cssH / 2);
      var reach = Math.max(cssW, cssH) / 2 + 70;
      var w = clamp(1 - d / reach, 0, 1);
      w = w * w * (3 - 2 * w);
      if (w <= 0.002) return 0;
      var rad = Math.max(cssW, cssH) * 0.55 * dprNow;
      var g = dstCtx.createRadialGradient(
        offX + lx * dprNow, offY + ly * dprNow, 0,
        offX + lx * dprNow, offY + ly * dprNow, rad
      );
      g.addColorStop(0, 'rgba(255,255,255,' + (0.55 * w).toFixed(3) + ')');
      g.addColorStop(0.55, 'rgba(255,255,255,' + (0.12 * w).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      dstCtx.save();
      dstCtx.globalCompositeOperation = 'lighter';
      dstCtx.fillStyle = g;
      dstCtx.fillRect(offX, offY, cssW * dprNow, cssH * dprNow);
      dstCtx.restore();
      return w;
    }

    /** Vertical sheen: light from above, clipped to whatever is already drawn.
     *  The gradient is baked once into a 1×64 strip and stretched — rebuilding a
     *  canvas gradient per frame per instance was measurable in the composite. */
    function drawSheen(dstCtx, pxW, pxH) {
      if (!SHEEN_CANVAS) {
        SHEEN_CANVAS = document.createElement('canvas');
        SHEEN_CANVAS.width = 1;
        SHEEN_CANVAS.height = 64;
        var sg = SHEEN_CANVAS.getContext('2d');
        var gr = sg.createLinearGradient(0, 0, 0, 64);
        gr.addColorStop(0, 'rgba(255,255,255,0.20)');
        gr.addColorStop(0.45, 'rgba(255,255,255,0.04)');
        gr.addColorStop(1, 'rgba(0,0,0,0.10)');
        sg.fillStyle = gr;
        sg.fillRect(0, 0, 1, 64);
      }
      dstCtx.drawImage(SHEEN_CANVAS, 0, 0, 1, 64, 0, 0, pxW, pxH);
    }

    /** Blurred copy of `src` as a halo, drawn underneath. Blurred at half
     *  resolution — the halo is soft by definition, and the full-res blur was
     *  the single most expensive call in the composite. */
    var haloCanvas = null, haloCanvasCtx = null;
    function drawHalo(dstCtx, pxW, pxH, alpha) {
      if (typeof dstCtx.filter !== 'string') return false;
      var hw = Math.max(2, pxW >> 1), hh = Math.max(2, pxH >> 1);
      if (!haloCanvas) {
        haloCanvas = document.createElement('canvas');
        haloCanvasCtx = haloCanvas.getContext('2d');
      }
      if (haloCanvas.width !== hw || haloCanvas.height !== hh) {
        haloCanvas.width = hw; haloCanvas.height = hh;
      } else {
        haloCanvasCtx.setTransform(1, 0, 0, 1, 0, 0);
        haloCanvasCtx.clearRect(0, 0, hw, hh);
      }
      haloCanvasCtx.save();
      haloCanvasCtx.filter = 'blur(' + (inst.glowPx * dpr / 2).toFixed(1) + 'px)';
      haloCanvasCtx.drawImage(srcCanvas, 0, 0, pxW, pxH, 0, 0, hw, hh);
      haloCanvasCtx.restore();
      dstCtx.save();
      dstCtx.globalAlpha = alpha;
      dstCtx.drawImage(haloCanvas, 0, 0, hw, hh, 0, 0, pxW, pxH);
      dstCtx.restore();
      return true;
    }

    // scratch canvas used both as the masked band and as the halo source
    var srcCanvas = scratch;
    var outerBuf = createOutlineBuf();
    var innerBuf = createOutlineBuf();

    var lastW = -1, lastH = -1, lastMargin = -1;
    var needsDrawFlag = true;

    inst.needsDraw = function (nowMs) {
      if (needsDrawFlag) return true;
      if (!inst.bend) return false;
      if (!POINTER.has) return false;
      var r = host.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      var d = Math.hypot(POINTER.x - (r.left + r.width / 2), POINTER.y - (r.top + r.height / 2));
      // Match the cursor light's reach so the highlight never goes stale.
      var reach = Math.max(r.width, r.height) / 2 + Math.max(inst.bendCfg.reach, 70);
      if (d <= reach) return true;
      return D.env > 0.001 || Math.abs(D.la) > 0.05; // still settling
    };

    inst.draw = function (nowMs, sheetFresh) {
      if (inst.destroyed) return;
      var rect = host.getBoundingClientRect();
      var cssW = Math.max(1, Math.round(rect.width));
      var cssH = Math.max(1, Math.round(rect.height));
      if (cssW < 2 || cssH < 2) return;

      // cursor dent drives geometry; needs ~60fps while it is live
      var bending = false;
      if (inst.bend) {
        D.lastMs = D.lastMs || nowMs;
        bending = stepBend(nowMs, cssW, cssH, rect);
        if (!bending && deformOn && D.env === 0 && D.active === false) {
          deformOn = false;
        } else if (bending) {
          deformOn = true;
        }
      }
      var margin = deformOn
        ? Math.ceil((inst.bendCfg.maxDisp + inst.bendCfg.liquid * 1.5) * Math.max(1, inst.bendCfg.strength)) + 4
        : (inst.glow ? Math.ceil(inst.glowPx * 2) : 0);

      var pxW = Math.ceil((cssW + 2 * margin) * dpr);
      var pxH = Math.ceil((cssH + 2 * margin) * dpr);
      if (lastW !== pxW || lastH !== pxH || lastMargin !== margin || maskNeedsPaint) {
        canvas.width = pxW; canvas.height = pxH;
        canvas.style.left = (-margin) + 'px';
        canvas.style.top = (-margin) + 'px';
        canvas.style.width = (cssW + 2 * margin) + 'px';
        canvas.style.height = (cssH + 2 * margin) + 'px';
        scratch.width = pxW; scratch.height = pxH;
        lastW = pxW; lastH = pxH; lastMargin = margin;
        maskNeedsPaint = true;
      }

      var offX = margin * dpr, offY = margin * dpr;
      var radius = resolveRadius(cssW, cssH);
      host.style.setProperty('--mfx-radius', radius + 'px');

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, pxW, pxH);
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, pxW, pxH);

      var deform = deformOn ? deformFn : null;

      // ---- build the metal band in the scratch canvas -------------------
      copySheet(sctx, cssW, cssH, offX, offY, dpr);
      drawCursorLight(sctx, cssW, cssH, offX, offY, dpr, rect);

      sctx.globalCompositeOperation = 'destination-in';
      if (isMaskKind) {
        if (maskNeedsPaint && maskFn) {
          // Mask is painted into its own canvas so it can be reused across frames.
          var mc = inst._maskCanvas || (inst._maskCanvas = document.createElement('canvas'));
          mc.width = pxW; mc.height = pxH;
          var mg = mc.getContext('2d');
          mg.setTransform(1, 0, 0, 1, 0, 0);
          mg.clearRect(0, 0, pxW, pxH);
          mg.save();
          mg.translate(offX, offY);
          mg.scale(dpr, dpr);
          maskFn(mg, cssW, cssH, dpr);
          mg.restore();
          inst._maskPainted = true;
          maskNeedsPaint = false;
        }
        if (inst._maskCanvas) {
          sctx.setTransform(1, 0, 0, 1, 0, 0);
          sctx.drawImage(inst._maskCanvas, 0, 0);
        }
      } else {
        // Ring: keep only the band between the outer and inner rounded rects.
        roundRectOutline(0, 0, cssW, cssH, radius, deform, outerBuf);
        var ring = ringPx == null ? Math.max(1, inst.shaderScale * 0.75) : ringPx;
        roundRectOutline(ring, ring, cssW - 2 * ring, cssH - 2 * ring, Math.max(0, radius - ring), deform, innerBuf);
        sctx.beginPath();
        tracePath(sctx, outerBuf, dpr, offX, offY);
        sctx.fillStyle = '#fff';
        sctx.fill();
        sctx.globalCompositeOperation = 'destination-out';
        sctx.beginPath();
        tracePath(sctx, innerBuf, dpr, offX, offY);
        sctx.fill();
      }
      sctx.globalCompositeOperation = 'source-over';
      if (inst.sheen) {
        sctx.save();
        sctx.globalCompositeOperation = 'source-atop';
        drawSheen(sctx, pxW, pxH);
        sctx.restore();
      }

      // ---- composite onto the host canvas ------------------------------
      // 1. halo behind everything
      if (inst.glow) drawHalo(ctx, pxW, pxH, inst.glowAlpha);
      // 2. opaque pill fill, drawn along the *deformed* outline so the body
      //    bends with the metal instead of tearing away from it
      if (inst.fill) {
        ctx.save();
        ctx.beginPath();
        roundRectOutline(0, 0, cssW, cssH, radius, deform, outerBuf);
        tracePath(ctx, outerBuf, dpr, offX, offY);
        ctx.fillStyle = inst.fill;
        ctx.fill();
        ctx.restore();
      }
      // 3. the metal band
      ctx.save();
      ctx.globalAlpha = clamp(inst.strength * inst.opacity, 0, 1);
      ctx.drawImage(scratch, 0, 0);
      ctx.restore();
      // 4. inner rim, re-blitted from its cached canvas (rebuilt only when the
      //    silhouette moved, so an idle ring pays one drawImage for it)
      if (inst.rim && !isMaskKind) {
        var ring = ringPx == null ? Math.max(1, inst.shaderScale * 0.75) : ringPx;
        var rimKey = pxW + ':' + pxH + ':' + radius.toFixed(2) + ':' + ring.toFixed(2) + ':' + dpr;
        if (rimKeyCache !== rimKey || deformOn || rimWasBending) {
          buildRim(pxW, pxH, cssW, cssH, radius, ring, dpr, offX, offY, deform);
          rimKeyCache = rimKey;
          rimWasBending = deformOn;
        }
        ctx.drawImage(rimCanvas, 0, 0);
      }
      // 5. text inner shadow uses its own computed overlay (see textRim)
      lastDrawnMs = nowMs;
    };

    var lastDrawnMs = 0;
    var rimCanvas = null, rimCtx = null, rimKeyCache = null, rimWasBending = false;

    /**
     * Inner rim — a hairline of light on the outer-top and inner-bottom edges of
     * the band (light from above on a torus). Two clipped strokes.
     *
     * This depends only on the *silhouette*, never on the moving metal, so it is
     * rasterised into its own canvas and re-blitted each frame (one unscaled
     * drawImage) instead of being stroked twice per frame. It is rebuilt only
     * when the outline actually changes: on resize, and while the cursor dent is
     * live. At rest it costs nothing.
     */
    function buildRim(pxW, pxH, cssW, cssH, radius, ring, dprNow, offX, offY, deform) {
      if (!rimCanvas) {
        rimCanvas = document.createElement('canvas');
        rimCtx = rimCanvas.getContext('2d');
      }
      if (rimCanvas.width !== pxW || rimCanvas.height !== pxH) {
        rimCanvas.width = pxW;
        rimCanvas.height = pxH;
      }
      rimCtx.setTransform(1, 0, 0, 1, 0, 0);
      rimCtx.clearRect(0, 0, pxW, pxH);
      var col = (inst.rim && inst.rim.color) || 'rgba(255,255,255,0.85)';
      var lw = Math.max(1, ((inst.rim && inst.rim.px) || 1) * dprNow);
      var cy = offY + (cssH / 2) * dprNow;
      var rp = ring == null ? Math.max(1, inst.shaderScale * 0.75) : ring;

      // outer edge, upper half only
      rimCtx.save();
      rimCtx.beginPath();
      rimCtx.rect(offX, offY, cssW * dprNow, Math.max(0, cy - offY));
      rimCtx.clip();
      rimCtx.beginPath();
      roundRectOutline(0, 0, cssW, cssH, radius, deform, outerBuf);
      tracePath(rimCtx, outerBuf, dprNow, offX, offY);
      rimCtx.strokeStyle = col;
      rimCtx.lineWidth = lw;
      rimCtx.stroke();
      rimCtx.restore();

      // inner edge, lower half only
      rimCtx.save();
      rimCtx.beginPath();
      rimCtx.rect(offX, cy, cssW * dprNow, Math.max(0, (offY + cssH * dprNow) - cy));
      rimCtx.clip();
      rimCtx.beginPath();
      roundRectOutline(rp, rp, cssW - 2 * rp, cssH - 2 * rp, Math.max(0, radius - rp), deform, innerBuf);
      tracePath(rimCtx, innerBuf, dprNow, offX, offY);
      rimCtx.strokeStyle = col;
      rimCtx.lineWidth = lw;
      rimCtx.stroke();
      rimCtx.restore();
    }

    inst.update = function (patch) {
      if (!patch) return inst;
      if (patch.preset) { inst.preset = patch.preset; S.preset = patch.preset; host.setAttribute('data-metal-fx-preset', patch.preset); }
      if (patch.strength != null) inst.strength = clamp(patch.strength, 0, 1);
      if (patch.metalOpacity != null) inst.opacity = clamp(patch.metalOpacity, 0, 1);
      if (patch.shaderScale != null) inst.shaderScale = patch.shaderScale;
      if (patch.periodCssPx != null) inst.periodCssPx = patch.periodCssPx;
      if (patch.fill != null) inst.fill = patch.fill;
      if (patch.rim !== undefined) inst.rim = patch.rim;
      if (patch.bendConfig) inst.bendCfg = Object.assign({}, inst.bendCfg, patch.bendConfig);
      if (patch.glow != null) inst.glow = !!patch.glow;
      needsDrawFlag = true;
      inst.draw((typeof performance !== 'undefined' ? performance.now() : Date.now()), true);
      return inst;
    };

    inst.refresh = function () { maskNeedsPaint = true; needsDrawFlag = true; inst.draw(performance.now(), true); };
    /** True while the cursor dent is displacing this instance's silhouette. */
    inst.isBending = function () { return deformOn; };
    inst.bendState = function () {
      return { env: +D.env.toFixed(3), amp: +Math.hypot(D.ax, D.ay).toFixed(3), liquid: +D.la.toFixed(3), active: D.active };
    };
    inst._setMask = function (fn) { maskFn = fn; isMaskKind = true; maskNeedsPaint = true; };
    inst._setRing = function (px) { ringPx = px; };
    inst._canvas = canvas;
    inst._margin = function () { return lastMargin; };

    // ---- register + first paint ----------------------------------------
    S.instances.push(inst);
    INSTANCES.push(inst);
    var now0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now0 - S.lastDrawMs >= FRAME_INTERVAL_MS - 1) drawSheet(now0);
    inst.draw(now0, true);
    needsDrawFlag = false;

    // ---- re-measure on box / DPR changes --------------------------------
    var roRaf = 0;
    if (typeof ResizeObserver !== 'undefined') {
      inst._ro = new ResizeObserver(function () {
        if (roRaf) return;
        roRaf = requestAnimationFrame(function () {
          roRaf = 0;
          maskNeedsPaint = true;
          needsDrawFlag = true;
          inst.draw(performance.now(), false);
        });
      });
      inst._ro.observe(host);
    }
    // Skip GL compositing for off-screen instances (upstream does the same).
    inst.visible = true;
    if (typeof IntersectionObserver !== 'undefined') {
      inst._io = new IntersectionObserver(function (entries) {
        for (var k = 0; k < entries.length; k++) {
          inst.visible = entries[k].isIntersecting;
          if (inst.visible) needsDrawFlag = true;
        }
      }, { rootMargin: '64px' });
      inst._io.observe(host);
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
      var onDpr = function () { remeasure(true); };
      var watchDpr = function () {
        if (inst._mql) inst._mql.removeEventListener('change', onDpr);
        inst._mql = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
        inst._mql.addEventListener('change', onDpr);
      };
      watchDpr();
    }
    function remeasure(fresh) {
      dpr = clamp(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1, 1, DPR_CAP);
      maskNeedsPaint = true;
      needsDrawFlag = true;
      inst.draw(performance.now(), !!fresh);
    }
    inst.remeasure = remeasure;

    var _destroy = function () {
      if (inst.destroyed) return;
      inst.destroyed = true;
      var i = S.instances.indexOf(inst);
      if (i >= 0) S.instances.splice(i, 1);
      var j = INSTANCES.indexOf(inst);
      if (j >= 0) INSTANCES.splice(j, 1);
      if (roRaf) cancelAnimationFrame(roRaf);
      if (inst._ro) inst._ro.disconnect();
      if (inst._io) inst._io.disconnect();
      if (inst._mql) inst._mql.removeEventListener('change', onDpr);
      if (inst._onDestroy) inst._onDestroy();
      if (inst._extraList) {
        for (var k = inst._extraList.length - 1; k >= 0; k--) {
          try { inst._extraList[k].remove(); } catch (e) { /* ignore */ }
        }
      }
      canvas.remove();
      host.classList.remove('mfx-root');
      host.removeAttribute('data-metal-fx-kind');
      host.removeAttribute('data-metal-fx-preset');
      host.style.removeProperty('--mfx-radius');
    };
    inst.destroy = _destroy;
    return inst;
  }

  var INSTANCES = [];

  // ────────────────────────────────────────────────────────────────────────
  // Public: ring / chip
  // ────────────────────────────────────────────────────────────────────────

  function ring(host, options) {
    var opts = options || {};
    var shape = opts.shape || opts.kind || 'ring';
    var inst = createInstance(shape === 'circle' ? 'circle' : 'ring', host, opts);
    if (!inst.supported) return inst;
    if (opts.shaderScale != null) inst.shaderScale = opts.shaderScale;
    inst._setRing(opts.ringPx != null ? Number(opts.ringPx) : inst.shaderScale * 0.75);
    inst.fill = opts.fill || null;
    inst.rim = opts.innerShadow === false ? null
      : (opts.rim === undefined ? { color: 'rgba(255,255,255,0.85)', px: 1 } : opts.rim);
    inst.refresh();
    return inst;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Public: text
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Paint an element's live text run onto a canvas using the DOM's own font and
   * metrics, so the canvas glyphs land on the DOM glyphs to within a device px.
   * `ctx` must already be scaled to css px with the origin at the wrapper's
   * top-left.
   */
  function paintTextRun(ctx, root, textEl) {
    var cs = getComputedStyle(textEl);
    var rr = root.getBoundingClientRect();
    var range = document.createRange();
    range.selectNodeContents(textEl);
    var rects = [];
    var rl = range.getClientRects();
    for (var i = 0; i < rl.length; i++) {
      if (rl[i].width > 0 && rl[i].height > 0) rects.push(rl[i]);
    }
    var tr = range.getBoundingClientRect();
    range.detach();

    ctx.save();
    ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';

    var text = textEl.textContent || '';
    var m = ctx.measureText(text);
    var asc = m.fontBoundingBoxAscent != null ? m.fontBoundingBoxAscent : parseFloat(cs.fontSize) * 0.9;
    var desc = m.fontBoundingBoxDescent != null ? m.fontBoundingBoxDescent : parseFloat(cs.fontSize) * 0.2;
    var baselineOf = function (r) { return (r.top - rr.top) + (r.height - (asc + desc)) / 2 + asc; };

    // Letter-spacing has to be reproduced or the mask drifts off the DOM glyphs
    // (a tracking of -0.035em at 76px is ~2.7px per glyph — visible by mid-word).
    // Native ctx.letterSpacing keeps the shaper's kerning; the per-glyph path is
    // the fallback for browsers without it.
    var tracking = parseFloat(cs.letterSpacing);
    if (!isFinite(tracking)) tracking = 0;
    var nativeTrack = false;
    if (tracking !== 0) {
      try { ctx.letterSpacing = (tracking) + 'px'; nativeTrack = ctx.letterSpacing === tracking + 'px'; } catch (e) { nativeTrack = false; }
    }
    var drawRun = function (str, x, y) {
      if (nativeTrack || tracking === 0) { ctx.fillText(str, x, y); return; }
      var cx = x;
      for (var k = 0; k < str.length; k++) {
        ctx.fillText(str[k], cx, y);
        cx += ctx.measureText(str[k]).width + tracking;
      }
    };

    if (rects.length <= 1) {
      // Single line (the normal case; `MetalFx.text` sets white-space:nowrap).
      drawRun(text, tr.left - rr.left, baselineOf(tr));
    } else {
      // Wrapped text: re-wrap by words to each line box and draw one line per
      // box. An approximation of the DOM's own line breaking — good for plain
      // word wrap, not for hyphenation or `word-break: break-all`.
      var words = text.split(/(\s+)/);
      var lineIdx = 0;
      var line = '';
      var startX = null;
      for (var w = 0; w < words.length; w++) {
        var candidate = line + words[w];
        var box = rects[Math.min(lineIdx, rects.length - 1)];
        var maxW = box.width + 0.5;
        if (line && ctx.measureText(candidate.trim()).width > maxW && lineIdx < rects.length - 1) {
          box = rects[lineIdx];
          drawRun(line.replace(/\s+$/, ''), (startX == null ? box.left : startX) - rr.left, baselineOf(box));
          lineIdx++;
          line = words[w];
          startX = null;
        } else {
          line = candidate;
        }
      }
      if (line.trim()) {
        var b2 = rects[Math.min(lineIdx, rects.length - 1)];
        drawRun(line.replace(/\s+$/, ''), (startX == null ? b2.left : startX) - rr.left, baselineOf(b2));
      }
    }
    ctx.restore();
  }

  function text(host, options) {
    var opts = options || {};
    if (!supported()) return fail(host, 'text');

    // Ensure there is an element to measure; wrap bare text in a span.
    var textEl = host.querySelector('[data-mfx-text]') || host.firstElementChild;
    if (!textEl) {
      textEl = document.createElement('span');
      textEl.setAttribute('data-mfx-text', '');
      textEl.textContent = (opts.text || host.textContent || '').trim();
      host.textContent = '';
      host.appendChild(textEl);
    }

    var inst = createInstance('text', host, Object.assign({}, opts, {
      metalOpacity: opts.metalOpacity == null ? 0.62 : opts.metalOpacity,
      shaderScale: opts.shaderScale == null ? 2.8 : opts.shaderScale,
      periodCssPx: opts.periodCssPx == null ? 110 : opts.periodCssPx,
      glow: opts.glow === true,
      bend: false,
      sheen: opts.sheen === undefined ? false : opts.sheen,
      // A metal ring behind glyphs would fight the letterforms.
      glowAlpha: opts.glowAlpha == null ? 0.35 : opts.glowAlpha
    }));
    if (!inst.supported) {
      textEl.setAttribute('data-mfx-text', '');
      return inst;
    }
    textEl.setAttribute('data-mfx-text', '');

    inst._canvas.style.zIndex = '3';
    inst._canvas.style.mixBlendMode = opts.blend || 'normal';

    inst._setMask(function (mc) { paintTextRun(mc, host, textEl); });

    // ---- inner-shadow rim: inside the glyphs, light from above ----------
    // Computed, not CSS (CSS has no text inner-shadow): glyph alpha minus the
    // same alpha shifted down one px leaves exactly the top rim, which is then
    // blurred, clipped to the glyph and drawn white above the metal.
    var rimCanvas = null;
    var rimState = { on: opts.innerShadow !== false, offsetY: 1, blur: 0.5, alpha: 0.9 };
    if (typeof opts.innerShadow === 'object' && opts.innerShadow) {
      rimState.offsetY = opts.innerShadow.offsetY == null ? 1 : opts.innerShadow.offsetY;
      rimState.blur = opts.innerShadow.blur == null ? 0.5 : opts.innerShadow.blur;
      rimState.alpha = opts.innerShadow.alpha == null ? 0.9 : opts.innerShadow.alpha;
    }
    if (rimState.on) {
      rimCanvas = document.createElement('canvas');
      rimCanvas.className = 'mfx-text-rim';
      rimCanvas.setAttribute('aria-hidden', 'true');
      rimCanvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:4';
      host.appendChild(rimCanvas);
      inst._extraList = (inst._extraList || []).concat([rimCanvas]);
    }

    var rimRaf = 0;
    function scheduleRim() {
      if (!rimCanvas || rimRaf) return;
      rimRaf = requestAnimationFrame(function () { rimRaf = 0; drawRim(); });
    }
    function drawRim() {
      if (!rimCanvas || inst.destroyed) return;
      var rr = host.getBoundingClientRect();
      var w = Math.max(1, Math.round(rr.width * dprNow()));
      var h = Math.max(1, Math.round(rr.height * dprNow()));
      rimCanvas.width = w; rimCanvas.height = h;
      rimCanvas.style.width = rr.width + 'px';
      rimCanvas.style.height = rr.height + 'px';
      var probe = document.createElement('canvas');
      probe.width = w; probe.height = h;
      var pctx = probe.getContext('2d', { willReadFrequently: true });
      pctx.fillStyle = '#fff';
      paintTextRun(pctx, host, textEl);
      var src = pctx.getImageData(0, 0, w, h).data;
      var n = w * h;
      var a = new Float32Array(n);
      for (var i = 0, j = 3; i < n; i++, j += 4) a[i] = src[j] / 255;
      var d = dprNow();
      var shift = Math.max(1, Math.round(rimState.offsetY * d)) * w;
      var rim = new Float32Array(n);
      for (var q = 0; q < n; q++) rim[q] = Math.max(0, a[q] - (q >= shift ? a[q - shift] : 0));
      var blurred = boxBlurAlpha(rim, w, h, Math.max(1, Math.round(rimState.blur * d * 1.5)));
      var out = new ImageData(w, h);
      var o = out.data;
      for (var i2 = 0, j2 = 0; i2 < n; i2++, j2 += 4) {
        o[j2] = 255; o[j2 + 1] = 255; o[j2 + 2] = 255;
        // clipped to the glyph so the blur never leaks outside the letterform
        o[j2 + 3] = Math.round(Math.min(1, blurred[i2] * a[i2] * rimState.alpha) * 255);
      }
      var g = rimCanvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      g.putImageData(out, 0, 0);
    }
    function dprNow() { return clamp(window.devicePixelRatio || 1, 1, DPR_CAP); }

    if (rimCanvas) {
      drawRim();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!inst.destroyed) { scheduleRim(); inst.refresh(); } });
      if (typeof ResizeObserver !== 'undefined') {
        var tro = new ResizeObserver(function () { scheduleRim(); inst.refresh(); });
        tro.observe(host);
        inst._extraList.push({ remove: function () { tro.disconnect(); } });
      }
      inst._onDestroy = function () { if (rimRaf) cancelAnimationFrame(rimRaf); };
    }

    inst.refresh();
    return inst;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Public: badge
  // ────────────────────────────────────────────────────────────────────────

  var BADGE = {
    w: 52, h: 26, radius: 999, font: '600 12px/1.4 Inter, system-ui, sans-serif',
    metalOpacity: 0.8, shaderScale: 1.6, periodCssPx: 26,
    coreSize: 49, coreR: 46, coreBlur: 100, coreAlpha: 0.94,
    glow: 0.41, textColor: '#1d211e'
  };

  function badge(host, options) {
    var opts = options || {};
    var label = (opts.label || host.textContent || 'New').trim();
    var scale = opts.scale == null ? 1 : Number(opts.scale);
    var W = (opts.width || BADGE.w) * scale;
    var H = (opts.height || BADGE.h) * scale;

    if (!supported()) {
      // Plain, still-lovely fallback: the white pill with its rims, no metal.
      host.textContent = label;
      host.classList.add('mfx-fallback', 'mfx-badge-fallback');
      host.setAttribute('data-metal-fx-unsupported', '');
      host.setAttribute('data-metal-fx-kind', 'badge');
      host.style.cssText += ';display:inline-flex;align-items:center;justify-content:center;' +
        'width:' + W + 'px;height:' + H + 'px;border-radius:' + (H / 2) + 'px;background:#fff;' +
        'color:' + (opts.textColor || BADGE.textColor) + ';font:' + BADGE.font +
        ';box-shadow:inset 0 0 8px rgba(255,255,255,.41),inset 0 0 0 1px rgba(255,255,255,.5),inset 0 1px 0 rgba(255,255,255,.78)';
      return fail(host, 'badge');
    }

    // Rebuild the pill: [canvas, white core, rims, label]
    host.textContent = '';
    host.style.cssText += ';position:relative;isolation:isolate;display:inline-block;' +
      'width:' + W + 'px;height:' + H + 'px;border-radius:' + (H / 2) + 'px;' +
      'background:' + (opts.fill || '#ffffff') + ';overflow:hidden';

    var labelEl = document.createElement('span');
    labelEl.style.cssText = 'position:relative;z-index:4;display:flex;align-items:center;justify-content:center;' +
      'width:100%;height:100%;font:' + (opts.font || BADGE.font) + ';color:' + (opts.textColor || BADGE.textColor) +
      ';white-space:nowrap;letter-spacing:0';
    labelEl.textContent = label;
    labelEl.setAttribute('aria-label', label);

    var core = document.createElement('div');
    core.setAttribute('aria-hidden', 'true');
    var cs = opts.core || {};
    var coreSize = cs.size == null ? BADGE.coreSize : cs.size;
    var coreR = cs.r == null ? BADGE.coreR : cs.r;
    var coreBlur = cs.blur == null ? BADGE.coreBlur : cs.blur;
    var coreA = cs.a == null ? BADGE.coreAlpha : cs.a;
    core.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;border-radius:' + (H / 2) + 'px;' +
      'opacity:' + coreA + ';background:radial-gradient(ellipse ' + coreSize + '% ' + coreSize + '% at 50% 50%,' +
      'rgba(255,255,255,1) ' + coreR + '%,rgba(255,255,255,0) ' + Math.min(100, coreR + coreBlur) + '%)';

    var glow = opts.glow == null ? BADGE.glow : opts.glow;
    var k = scale;
    var rims = document.createElement('div');
    rims.setAttribute('aria-hidden', 'true');
    rims.style.cssText = 'position:absolute;inset:0;z-index:3;pointer-events:none;border-radius:' + (H / 2) + 'px;' +
      'box-shadow:' +
      'inset 0 0 ' + (8.333 * k) + 'px 0 rgba(255,255,255,' + glow + '),' +
      'inset 0 0 0 ' + (0.833 * k) + 'px rgba(255,255,255,0.5),' +
      'inset 0 ' + (0.833 * k) + 'px 0 0 rgba(255,255,255,0.78)';

    host.appendChild(labelEl);
    host.appendChild(core);
    host.appendChild(rims);

    var inst = createInstance('badge', host, Object.assign({}, opts, {
      metalOpacity: opts.metalOpacity == null ? BADGE.metalOpacity : opts.metalOpacity,
      shaderScale: opts.shaderScale == null ? BADGE.shaderScale : opts.shaderScale,
      periodCssPx: opts.periodCssPx == null ? BADGE.periodCssPx : opts.periodCssPx,
      bend: false,
      fill: null,
      rim: null,
      glow: opts.glow === true || opts.glowPx != null
    }));
    if (!inst.supported) return inst;

    inst._canvas.style.zIndex = '1';
    inst._setMask(function (mc) {
      mc.beginPath();
      mc.roundRect ? mc.roundRect(0, 0, W, H, H / 2) : mc.rect(0, 0, W, H);
      mc.fill();
    });
    inst._extraList = (inst._extraList || []).concat([core, rims, labelEl]);
    inst.refresh();
    return inst;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Public surface
  // ────────────────────────────────────────────────────────────────────────

  function destroyAll() {
    for (var i = INSTANCES.length - 1; i >= 0; i--) {
      try { INSTANCES[i].destroy(); } catch (e) { /* ignore */ }
    }
    INSTANCES.length = 0;
    if (SHARED) {
      try {
        if (SHARED.raf) cancelAnimationFrame(SHARED.raf);
        SHARED.gl.deleteBuffer(SHARED.buffer);
        SHARED.gl.deleteProgram(SHARED.program);
        var lose = SHARED.gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      } catch (e) { /* ignore */ }
      SHARED = null;
    }
  }

  var MetalFx = {
    version: '2.0.10-vanilla.1',
    upstream: 'https://github.com/Jakubantalik/Libraries (packages/metal-fx)',
    presets: ['chromatic', 'silver', 'gold'],
    supported: supported,
    isSupported: supported,
    glInfo: glInfo,
    ring: ring,
    chip: function (host, options) { return ring(host, Object.assign({ kind: 'chip', periodCssPx: 26, shaderScale: 1.0 }, options || {})); },
    text: text,
    badge: badge,
    destroyAll: destroyAll,
    /** Live instance count — handy in a demo's verification readout. */
    instanceCount: function () { return INSTANCES.length; },
    /** Per-frame diagnostics: where the frame time actually goes. */
    stats: function () {
      var S = SHARED;
      if (!S) return { available: false };
      return {
        available: true,
        frames: S.stats.frames,
        instancesDrawnLastFrame: S.stats.instances,
        instancesLive: INSTANCES.length,
        sheetMs: S.stats.sheetMs,
        compositeMs: S.stats.drawMs,
        tickMs: +(S.stats.tickMs || 0).toFixed(2),
        contextLost: !!S.ctxLost
      };
    },
    sheetSize: SHEET,
    bendDefaults: BEND_DEFAULTS,
    __debug: function () { return SHARED; }
  };

  return MetalFx;
}));
