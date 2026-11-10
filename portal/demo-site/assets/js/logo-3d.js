/*!
 * logo-3d.js — JBELogo3D v1.0.0
 * Johnny Bravo Entertainment — premium 3D logo hero (hero component only).
 *
 * Self-contained. No build step, no npm, no CDN. Requires a locally vendored
 * three.js (r149 non-module build, exposing window.THREE) loaded BEFORE this
 * file. Nothing here reaches the network.
 *
 * What it does: the brand mark (raster wordmark with guitar + microphone) is
 * lifted into real 3D. The alpha channel is sampled into a vertex grid, each
 * vertex is pushed along Z by a bevel-eased alpha value, cells that carry no
 * ink are pruned, normals are recomputed, and the mesh is lit with a
 * procedurally generated environment map (PMREM, no external HDRI). The mark
 * therefore keeps its own artwork — it is never redrawn by hand — but gains
 * real depth, real specular response, real silhouette parallax.
 *
 * The intro is a GPU morph: every vertex carries aStart (a scattered point in
 * space) and aDelay (stagger weight); a single uniform uProgress drives the
 * assembly inside the vertex shader, so the whole reveal is one draw call.
 *
 * Public API
 *   window.JBELogo3D.mount(canvasEl, opts) -> handle
 *   window.JBELogo3D.version               -> '1.0.0'
 *   window.JBELogo3D.threeVersion          -> THREE.REVISION at load time
 *
 * handle = { mode, replay(), setReducedMotion(bool), render(), diagnostics(), destroy() }
 *
 * opts (all optional)
 *   src            string   logo image (default '../assets/img/jbe-logo-rev.png')
 *   alt            string   alt text for the no-WebGL fallback image
 *   sample         number   vertex grid width in cells (default 190; <=150 on small canvases)
 *   depth          number   relief depth as a fraction of mark height (default 0.17)
 *   metalness      number   default 0.62
 *   roughness      number   default 0.34
 *   alphaCutoff    number   ink threshold, default 0.14
 *   introDuration  number   ms, default 2400
 *   stagger        number   0..0.9, assembly stagger, default 0.55
 *   spin           number   idle yaw amplitude in radians, default 0.06
 *   interactive    boolean  pointer parallax, default true
 *   envMap         'auto'|false  procedural PMREM reflections; false disables
 *   fitMargin      number   framing air, default 1.12
 *   reducedMotion  boolean|null  null = follow the media query (default)
 *   tint           string   accent override (otherwise read from CSS vars)
 *   onReady        function(handle)
 *   onError        function(error)
 *
 * Theme: colours are read from CSS custom properties on the canvas element
 * (or opts.themeSource). See THEME_VARS below. Nothing is hardcoded at render
 * time — if the page retints, the next mount picks it up.
 *
 * Fallbacks, both of which keep the mark visible and settled (never blank):
 *   - prefers-reduced-motion: no animation loop at all; one frame is rendered
 *     with the mark already assembled and the camera already settled.
 *   - no WebGL / no THREE / texture failure / shader failure: an <img> of the
 *     same artwork is inserted beside the canvas and the canvas is hidden.
 *
 * License: MIT (project-internal).
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  /* Theme variables, in priority order. First hit wins; each has a fallback. */
  var THEME_VARS = {
    bg:       ['--jbe-bg', '--hero-bg', '--coll-bg'],
    ink:      ['--jbe-ink', '--coll-ink'],
    accent:   ['--jbe-accent', '--coll-accent'],
    accent2:  ['--jbe-accent-2', '--jbe-accent-soft', '--coll-accent-soft']
  };
  var THEME_FALLBACK = {
    bg: '#0a0b10',
    ink: '#f5f2ec',
    accent: '#d84818',   /* sampled from the JBE guitar (#D84818 warm red) */
    accent2: '#f0b078'   /* sampled warm highlight */
  };

  var DEFAULTS = {
    src: '../assets/img/jbe-logo-rev.png',
    alt: 'Johnny Bravo Entertainment',
    sample: 260,
    depth: 0.17,
    metalness: 0.62,
    roughness: 0.34,
    alphaCutoff: 0.14,
    introDuration: 2400,
    stagger: 0.55,
    spin: 0.06,
    interactive: true,
    envMap: 'auto',
    fitMargin: 1.12,
    reducedMotion: null,
    tint: null,
    themeSource: null,
    onReady: null,
    onError: null
  };

  /* ---------------------------------------------------------------- utils */

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    }
    return target;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function smoothstep(e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }

  function nowMs() {
    return (global.performance && global.performance.now) ? global.performance.now() : Date.now();
  }

  function prefersReducedMotion() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  function cssColor(el, names, fallback) {
    if (!el || !global.getComputedStyle) return fallback;
    var cs;
    try { cs = global.getComputedStyle(el); } catch (e) { return fallback; }
    if (!cs) return fallback;
    for (var i = 0; i < names.length; i++) {
      var v = cs.getPropertyValue(names[i]);
      if (v && v.trim()) return v.trim();
    }
    return fallback;
  }

  function readTheme(el, opts) {
    var src = opts.themeSource || el;
    var out = {};
    for (var key in THEME_VARS) {
      out[key] = cssColor(src, THEME_VARS[key], THEME_FALLBACK[key]);
    }
    if (opts.tint) out.accent = opts.tint;
    return out;
  }

  /* Cheap, non-throwing WebGL probe. Done before THREE is ever constructed so
   * a context-less environment produces zero console noise from three.js. */
  function webglAvailable() {
    if (typeof global.WebGLRenderingContext === 'undefined') return false;
    var c = null;
    try {
      c = global.document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return false;
      var lose = gl.getExtension && gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return true;
    } catch (e) {
      return false;
    }
  }

  /* Renderer string + a software-rasterizer verdict. Software GL (SwiftShader,
   * llvmpipe, ANGLE-over-WARP) can execute the full path, but the PMREM
   * prefilter is ruinously slow there, so we drop to lights-only shading and
   * a 1x pixel ratio instead of shipping a hero that stutters. */
  function rendererProfile(renderer) {
    var out = { string: '', software: false };
    try {
      var gl = renderer.getContext();
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      out.string = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl.getParameter(gl.RENDERER) || ''));
    } catch (e) { /* keep the empty string */ }
    out.software = /swiftshader|llvmpipe|softwarerasterizer|software|microsoft basic render|mesa offscreen/i.test(out.string);
    return out;
  }

  /* ------------------------------------------------------------- relief mesh
   * Samples the image alpha into a grid and builds an indexed, pruned relief
   * plane. Returns { geometry, width, height, depth, verts, tris }.
   */
  function buildRelief(img, opts) {
    var srcW = img.naturalWidth || img.width;
    var srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) throw new Error('logo image has no intrinsic size');

    var cellsW = Math.max(48, Math.min(320, Math.round(opts.sample)));
    var cellsH = Math.max(20, Math.round(cellsW * srcH / srcW));

    /* Source sampling canvas, capped so getImageData stays cheap. */
    var sw = Math.min(srcW, 1400);
    var sh = Math.max(1, Math.round(sw * srcH / srcW));
    var cv = global.document.createElement('canvas');
    cv.width = sw; cv.height = sh;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2d context unavailable');
    ctx.clearRect(0, 0, sw, sh);
    ctx.drawImage(img, 0, 0, sw, sh);

    var data;
    try {
      data = ctx.getImageData(0, 0, sw, sh).data;
    } catch (e) {
      throw new Error('logo pixels unreadable (tainted canvas — serve over http, not file://)');
    }

    /* Per-vertex alpha = MAX over the source block (max keeps thin script
     * strokes and the guitar strings alive at low grid resolutions). */
    var vw = cellsW + 1, vh = cellsH + 1;
    var alpha = new Float32Array(vw * vh);
    var boxR = Math.max(1, Math.round(sw / cellsW / 2));
    for (var j = 0; j < vh; j++) {
      var sy = Math.round(j / cellsH * (sh - 1));
      for (var i = 0; i < vw; i++) {
        var sx = Math.round(i / cellsW * (sw - 1));
        var best = 0;
        for (var yy = sy - boxR; yy <= sy + boxR; yy++) {
          if (yy < 0 || yy >= sh) continue;
          var rowOff = yy * sw;
          for (var xx = sx - boxR; xx <= sx + boxR; xx++) {
            if (xx < 0 || xx >= sw) continue;
            var a = data[(rowOff + xx) * 4 + 3];
            if (a > best) best = a;
          }
        }
        alpha[j * vw + i] = best / 255;
      }
    }

    /* Tight content box so the mark fills the frame with no dead padding. */
    var i0 = vw, i1 = -1, j0 = vh, j1 = -1;
    for (var jj = 0; jj < vh; jj++) {
      for (var ii = 0; ii < vw; ii++) {
        if (alpha[jj * vw + ii] > opts.alphaCutoff) {
          if (ii < i0) i0 = ii;
          if (ii > i1) i1 = ii;
          if (jj < j0) j0 = jj;
          if (jj > j1) j1 = jj;
        }
      }
    }
    if (i1 < 0) { i0 = 0; i1 = vw - 1; j0 = 0; j1 = vh - 1; }
    /* One cell of bleed so the silhouette is not clipped at the edge. */
    i0 = Math.max(0, i0 - 1); i1 = Math.min(vw - 1, i1 + 1);
    j0 = Math.max(0, j0 - 1); j1 = Math.min(vh - 1, j1 + 1);

    var spanI = Math.max(1, i1 - i0);
    var spanJ = Math.max(1, j1 - j0);
    var contentAspect = (spanI / cellsW * srcW) / (spanJ / cellsH * srcH);

    var UNIT = 2.0;                       /* mark width in world units */
    var objW = UNIT;
    var objH = UNIT / contentAspect;
    var depthUnit = opts.depth * objH;    /* relief depth */
    var zMax = depthUnit;

    var gw = spanI + 1, gh = spanJ + 1;
    var count = gw * gh;
    var pos = new Float32Array(count * 3);
    var uv = new Float32Array(count * 2);
    var start = new Float32Array(count * 3);
    var delay = new Float32Array(count);

    var pr = Math.random;
    for (var gj = 0; gj < gh; gj++) {
      for (var gi = 0; gi < gw; gi++) {
        var idx = gj * gw + gi;
        var ai = (j0 + gj) * vw + (i0 + gi);
        var a = alpha[ai];

        /* bevel-eased relief: solid ink reaches a flat top plate */
        var z = zMax * smoothstep(opts.alphaCutoff, 0.82, a);

        var x = (gi / gw - 0.5) * objW;
        var y = (0.5 - gj / gh) * objH;

        pos[idx * 3] = x;
        pos[idx * 3 + 1] = y;
        pos[idx * 3 + 2] = z;

        uv[idx * 2] = (i0 + gi) / cellsW;
        uv[idx * 2 + 1] = 1 - (j0 + gj) / cellsH;

        /* Scatter origin: a shell behind and around the mark. */
        var ang = pr() * Math.PI * 2;
        var rad = objW * (0.45 + pr() * 0.95);
        var sx2 = Math.cos(ang) * rad;
        var sy2 = Math.sin(ang) * rad * 0.55;
        var sz2 = -objW * (0.35 + pr() * 1.1);
        start[idx * 3] = sx2;
        start[idx * 3 + 1] = sy2;
        start[idx * 3 + 2] = sz2;

        /* Stagger: reading order left-to-right, jittered, ink leads. */
        delay[idx] = clamp(
          0.30 * (gi / Math.max(1, gw - 1)) + 0.45 * pr() + (a > 0.5 ? 0 : 0.18),
          0, 1
        );
      }
    }

    /* Prune: keep only cells that actually carry ink. Removes the flat
     * backsheet entirely — big win for overdraw and depth correctness. */
    var indexArr = [];
    for (var cj = 0; cj < gh - 1; cj++) {
      for (var ci = 0; ci < gw - 1; ci++) {
        var a00 = alpha[(j0 + cj) * vw + (i0 + ci)];
        var a10 = alpha[(j0 + cj) * vw + (i0 + ci + 1)];
        var a01 = alpha[(j0 + cj + 1) * vw + (i0 + ci)];
        var a11 = alpha[(j0 + cj + 1) * vw + (i0 + ci + 1)];
        if (a00 < opts.alphaCutoff && a10 < opts.alphaCutoff &&
            a01 < opts.alphaCutoff && a11 < opts.alphaCutoff) continue;
        var v0 = cj * gw + ci, v1 = v0 + 1, v2 = v0 + gw, v3 = v2 + 1;
        indexArr.push(v0, v2, v1, v1, v2, v3);
      }
    }
    if (!indexArr.length) throw new Error('logo alpha produced no geometry');

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    geo.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indexArr), 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    return {
      geometry: geo,
      width: objW,
      height: objH,
      depth: depthUnit,
      verts: count,
      tris: indexArr.length / 3
    };
  }

  /* --------------------------------------------------------------- env map
   * Procedural equirect gradient -> PMREM. Gives the metal a real reflection
   * response with zero external assets.
   */
  function buildEnvMap(renderer, theme) {
    var c = global.document.createElement('canvas');
    c.width = 512; c.height = 256;
    var g = c.getContext('2d');
    if (!g) return null;
    var grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.00, '#05060a');
    grad.addColorStop(0.34, '#22262f');
    grad.addColorStop(0.49, '#c9d2e2');
    grad.addColorStop(0.53, '#4a4238');
    grad.addColorStop(0.74, '#1a1310');
    grad.addColorStop(1.00, '#040508');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);

    /* Warm accent smear (brand) + a cool counter-smear. */
    function smear(x, y, r, color, a) {
      var rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, color);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = a;
      g.fillStyle = rg;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
    smear(360, 108, 150, theme.accent, 0.85);
    smear(120, 130, 130, '#8fb6ff', 0.35);

    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    if ('encoding' in tex && THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;

    var pmrem = new THREE.PMREMGenerator(renderer);
    if (pmrem.compileEquirectangularShader) pmrem.compileEquirectangularShader();
    var rt = pmrem.fromEquirectangular(tex);
    var out = rt ? rt.texture : null;
    pmrem.dispose();
    tex.dispose();
    return out;
  }

  /* ------------------------------------------------------------- fallback */

  function installFallback(canvasEl, opts, reason) {
    var parent = canvasEl.parentNode;
    var img = null;
    if (parent) {
      var existing = parent.querySelector('.jbe-logo3d-fallback');
      if (existing) {
        img = existing;
      } else {
        img = global.document.createElement('img');
        img.className = 'jbe-logo3d-fallback';
        img.src = opts.src;
        img.alt = opts.alt || '';
        img.decoding = 'async';
        img.setAttribute('style',
          'display:block;width:100%;height:auto;max-width:100%;margin:0 auto;');
        if (global.getComputedStyle && global.getComputedStyle(parent).position === 'static') {
          parent.style.position = 'relative';
        }
        parent.insertBefore(img, canvasEl.nextSibling);
      }
    }
    canvasEl.setAttribute('data-jbe3d-fallback', reason);
    canvasEl.style.display = 'none';
    return img;
  }

  /* ---------------------------------------------------------------- mount */

  /* Minimal handle for the degraded paths, so callers always get the same
   * shape back regardless of what the environment supports. */
  function fallbackHandle(canvasEl, opts, diag, reason, err) {
    diag.mode = 'fallback';
    diag.ready = false;
    diag.reason = reason;
    var img = installFallback(canvasEl, opts, reason);
    var h = {
      version: VERSION,
      get mode() { return diag.mode; },
      fallbackElement: img,
      replay: function () { },
      setReducedMotion: function (flag) { diag.reducedMotion = !!flag; },
      render: function () { },
      diagnostics: function () { return assign({}, diag); },
      destroy: function () {
        if (img && img.parentNode) img.parentNode.removeChild(img);
        canvasEl.style.display = '';
        canvasEl.removeAttribute('data-jbe3d-fallback');
        canvasEl.removeAttribute('data-jbe3d');
        if (canvasEl.__jbe3dHandle === h) canvasEl.__jbe3dHandle = null;
      }
    };
    canvasEl.__jbe3dHandle = h;
    canvasEl.setAttribute('data-jbe3d', 'fallback');
    if (opts.onError && err) { try { opts.onError(err); } catch (e) { /* noop */ } }
    return h;
  }

  function mount(canvasEl, options) {
    if (!canvasEl || !canvasEl.getContext) {
      throw new Error('JBELogo3D.mount(canvasEl): a <canvas> element is required');
    }
    if (canvasEl.__jbe3dHandle) {
      try { canvasEl.__jbe3dHandle.destroy(); } catch (e) { /* noop */ }
    }

    var opts = assign({}, DEFAULTS, options || {});
    var handle = null;

    /* ------ resolve motion preference up front (drives everything) */
    var reduced = opts.reducedMotion === null ? prefersReducedMotion() : !!opts.reducedMotion;

    var theme = readTheme(canvasEl, opts);

    var diag = {
      version: VERSION,
      threeVersion: (typeof THREE !== 'undefined' && THREE.REVISION) ? THREE.REVISION : null,
      mode: 'pending',
      reducedMotion: reduced,
      theme: theme,
      triangles: 0,
      vertices: 0,
      drawCalls: 0,
      frames: 0,
      ready: false,
      progress: 0,
      reason: null,
      gpu: null,
      softwareRenderer: false,
      mountMs: null,
      buildMs: null,
      envMs: null
    };
    var mountT0 = nowMs();

    /* Hard dependency checks -> graceful fallback (never a blank hero). */
    if (typeof THREE === 'undefined') {
      return fallbackHandle(canvasEl, opts, diag, 'three-missing',
        new Error('three.js not loaded before logo-3d.js'));
    }
    if (!webglAvailable()) {
      return fallbackHandle(canvasEl, opts, diag, 'no-webgl',
        new Error('WebGL unavailable'));
    }

    var renderer, scene, camera, group, mesh, material, uProgress, uStagger;
    var envMap = null;
    var raf = 0;
    var clock = null;
    var introStart = 0;
    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    var model = null;
    var ro = null;
    var disposed = false;
    var rimLight, sheenLight, baseDist = 4;
    var t0 = 0;

    function onResize() { safe(function () { resize(); }); }

    function safe(fn) {
      try { fn(); } catch (e) {
        diag.reason = 'runtime-error';
        if (opts.onError) opts.onError(e);
      }
    }

    /* ---- renderer --------------------------------------------------- */
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        antialias: true,
        alpha: true,
        premultipliedAlpha: false,
        powerPreference: 'high-performance'
      });
    } catch (e) {
      return fallbackHandle(canvasEl, opts, diag, 'renderer-failed', e);
    }

    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    var profile = rendererProfile(renderer);
    diag.gpu = profile.string;
    diag.softwareRenderer = profile.software;
    if (profile.software) renderer.setPixelRatio(1);
    if ('outputEncoding' in renderer && THREE.sRGBEncoding !== undefined) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    if (renderer.setClearAlpha) renderer.setClearAlpha(0);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(34, 1, 0.05, 100);
    camera.position.set(0, 0, 4);
    group = new THREE.Group();
    scene.add(group);

    /* ---- lights ------------------------------------------------------ */
    var keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(2.2, 2.6, 3.0);
    scene.add(keyLight);

    var fillLight = new THREE.DirectionalLight(0xa9bede, 0.40);
    fillLight.position.set(-3.0, -1.1, 2.2);
    scene.add(fillLight);

    var hemi = new THREE.HemisphereLight(0xdfe7f5, 0x120c08, 0.32);
    scene.add(hemi);

    rimLight = new THREE.PointLight(theme.accent, 3.0, 14, 2);
    rimLight.position.set(-2.2, 1.1, -2.4);
    scene.add(rimLight);

    sheenLight = new THREE.PointLight(theme.accent2, 1.4, 10, 2);
    sheenLight.position.set(2.0, -0.6, 1.6);
    scene.add(sheenLight);

    /* ---- animation loop --------------------------------------------- */
    clock = new THREE.Clock();

    function frame() {
      raf = 0;
      if (disposed) return;
      var dt = clock.getDelta();
      var now = clock.elapsedTime * 1000;

      if (introStart === 0) introStart = now;
      var raw = reduced ? 1 : clamp((now - introStart) / opts.introDuration, 0, 1);
      var p = easeOutCubic(raw);
      uProgress.value = p;
      diag.progress = Math.round(p * 1000) / 1000;

      /* pointer easing (interaction stays subtle on purpose) */
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3.4);
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3.4);

      /* idle: barely-there yaw + a slow vertical breath. Restraint is the
       * premium here — the mark drifts, it does not perform. */
      var t = clock.elapsedTime;
      var settle = smoothstep(0, 1, raw);
      group.rotation.y = settle * (Math.sin(t * 0.26) * opts.spin + pointer.x * 0.10);
      group.rotation.x = settle * (Math.sin(t * 0.19) * opts.spin * 0.45 + pointer.y * 0.055);
      group.position.y = settle * Math.sin(t * 0.42) * (model ? model.height * 0.006 : 0.006);

      /* dolly: start further out, settle exactly on the fitted distance */
      var dolly = 1.34 - 0.34 * p;
      camera.position.z = baseDist * dolly;
      camera.position.y = (1 - p) * 0.10;
      camera.lookAt(0, 0, 0);

      /* travelling rim + sheen = one specular sweep across the relief */
      rimLight.position.set(Math.sin(t * 0.45) * 2.7, 1.0 + Math.sin(t * 0.63) * 0.6, -2.2 - Math.cos(t * 0.45) * 0.7);
      rimLight.intensity = 2.4 + 0.8 * Math.sin(t * 0.9);
      sheenLight.position.set(-2.2 + Math.cos(t * 0.31) * 3.4, -0.7 + Math.sin(t * 0.5) * 0.4, 1.8);
      sheenLight.intensity = 0.9 + 0.55 * Math.sin(t * 0.72 + 1.2);

      renderer.render(scene, camera);
      diag.frames++;
      diag.drawCalls = renderer.info.render.calls;

      if (!reduced) schedule();
    }

    function schedule() {
      if (disposed || raf || reduced) return;
      raf = global.requestAnimationFrame(frame);
    }

    function renderOnce() {
      /* reduced-motion path: one settled frame, no loop. The mark is already
       * assembled (uProgress = 1, stagger off) and the camera is at its final
       * fitted distance, so content settles — it never disappears. */
      uProgress.value = 1;
      uStagger.value = 0;
      diag.progress = 1;
      group.rotation.set(0, 0, 0);
      group.position.y = 0;
      camera.position.set(0, 0, baseDist);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      diag.frames++;
      diag.drawCalls = renderer.info.render.calls;
    }

    function resize() {
      var w = canvasEl.clientWidth || canvasEl.parentNode && canvasEl.parentNode.clientWidth || 0;
      var h = canvasEl.clientHeight || 0;
      if (w && !h) {
        /* Unsized canvas safety net: a <canvas> has no intrinsic height, so a
         * page that forgets to size its hero would otherwise collapse the mark
         * to a 1px sliver. Give it one sensible height; the page can override
         * it with any CSS rule (inline style here, so CSS still wins later). */
        var guess = Math.round(w * 0.5);
        canvasEl.style.height = guess + 'px';
        h = canvasEl.clientHeight || guess;
      }
      if (!w) w = 1;
      if (!h) h = 1;
      /* Software rasterizers (SwiftShader/llvmpipe) fill pixels on the CPU, so
       * cap the drawing buffer and let CSS scale it: the hero stays smooth on
       * machines with no usable GPU instead of grinding at 1fps. */
      var scale = profile.software ? Math.min(1, 720 / w) : 1;
      renderer.setSize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)), false);
      camera.aspect = w / h;

      if (model) {
        /* Fit the mark inside the frustum on BOTH axes -> guaranteed no
         * horizontal overflow at any viewport width. */
        var fovV = camera.fov * Math.PI / 180;
        var tanV = Math.tan(fovV / 2);
        var halfH = model.height / 2 * opts.fitMargin;
        var halfW = model.width / 2 * opts.fitMargin;
        var dV = halfH / tanV;
        var dH = halfW / (tanV * camera.aspect);
        baseDist = Math.max(dV, dH) + model.depth;
      }
      camera.updateProjectionMatrix();
      if (reduced) renderOnce();
    }

    /* ---- pointer parallax -------------------------------------------- */
    function onPointerMove(e) {
      var r = canvasEl.getBoundingClientRect();
      if (!r.width || !r.height) return;
      pointer.tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
      pointer.ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
    }
    function onPointerLeave() { pointer.tx = 0; pointer.ty = 0; }

    function onVisibility() {
      if (reduced) return;
      if (global.document.hidden) {
        if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
      } else {
        clock.getDelta();   /* swallow the paused delta, then resume where we left off */
        schedule();
      }
    }

    /* ---- async load + build ----------------------------------------- */
    function onTextureLoaded(tex) {
      if (disposed) { tex.dispose(); return; }
      try {
        var small = (canvasEl.clientWidth || 999) < 560;
        var tBuild = nowMs();
        model = buildRelief(tex.image, {
          sample: (small || profile.software) ? Math.min(150, opts.sample) : opts.sample,
          alphaCutoff: opts.alphaCutoff,
          depth: opts.depth
        });
        diag.buildMs = Math.round(nowMs() - tBuild);
        diag.vertices = model.verts;
        diag.triangles = model.tris;

        /* Environment reflections: skipped on software rasterizers and when
         * the caller opts out. Lights alone still read as a solid mark. */
        if (opts.envMap !== false && !profile.software) {
          var tEnv = nowMs();
          try { envMap = buildEnvMap(renderer, theme); } catch (e) { envMap = null; }
          diag.envMs = Math.round(nowMs() - tEnv);
        } else {
          diag.envMs = 0;
        }

        uProgress = { value: reduced ? 1 : 0 };
        uStagger = { value: reduced ? 0 : clamp(opts.stagger, 0, 0.9) };

        material = new THREE.MeshStandardMaterial({
          map: tex,
          transparent: true,
          alphaTest: opts.alphaCutoff,
          depthWrite: true,
          side: THREE.DoubleSide,
          metalness: opts.metalness,
          roughness: opts.roughness,
          envMap: envMap,
          envMapIntensity: 1.05,
          emissive: new THREE.Color(theme.accent),
          emissiveIntensity: 0.045,
          color: 0xffffff
        });
        material.map.anisotropy = renderer.capabilities.getMaxAnisotropy ?
          Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;

        /* GPU vertex morph: assembly happens in the shader, one draw call. */
        material.onBeforeCompile = function (shader) {
          shader.uniforms.uProgress = uProgress;
          shader.uniforms.uStagger = uStagger;
          shader.vertexShader =
            'attribute vec3 aStart;\nattribute float aDelay;\nuniform float uProgress;\nuniform float uStagger;\n' +
            shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            [
              'vec3 transformed = vec3( position );',
              'float lp = clamp((uProgress - aDelay * uStagger) / max(0.0001, 1.0 - uStagger), 0.0, 1.0);',
              'lp = lp * lp * (3.0 - 2.0 * lp);',
              'transformed = mix(aStart, transformed, lp);'
            ].join('\n')
          );
        };

        mesh = new THREE.Mesh(model.geometry, material);
        mesh.frustumCulled = false;   /* vertices leave the box while assembling */
        group.add(mesh);

        resize();
        diag.mode = 'webgl';
        diag.ready = true;
        diag.mountMs = Math.round(nowMs() - mountT0);
        canvasEl.setAttribute('data-jbe3d', 'ready');
        canvasEl.setAttribute('data-jbe3d-reduced', reduced ? 'true' : 'false');

        if (reduced) {
          renderOnce();
        } else {
          introStart = 0;
          schedule();
        }

        if (opts.onReady) opts.onReady(handle);
        try {
          canvasEl.dispatchEvent(new global.CustomEvent('jbe3d:ready', { detail: diag }));
        } catch (ev) { /* older engines */ }
      } catch (err) {
        diag.reason = diag.reason || 'build-failed';
        fail(err);
      }
    }

    function fail(err) {
      if (disposed) return;
      dispose(true);
      installFallback(canvasEl, opts, diag.reason || 'load-failed');
      diag.mode = 'fallback';
      diag.ready = false;
      if (opts.onError) opts.onError(err);
    }

    var loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      opts.src,
      function (tex) {
        if ('encoding' in tex && THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        onTextureLoaded(tex);
      },
      undefined,
      function (err) { diag.reason = 'texture-failed'; fail(err || new Error('logo texture failed to load')); }
    );

    /* ---- lifecycle --------------------------------------------------- */
    if (global.ResizeObserver) {
      ro = new global.ResizeObserver(onResize);
      ro.observe(canvasEl.parentNode || canvasEl);
    } else {
      global.addEventListener('resize', onResize);
    }
    global.addEventListener('resize', onResize);
    if (opts.interactive && !reduced) {
      canvasEl.addEventListener('pointermove', onPointerMove);
      canvasEl.addEventListener('pointerleave', onPointerLeave);
    }
    global.document.addEventListener('visibilitychange', onVisibility);

    function dispose(keepDiag) {
      disposed = true;
      if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
      global.removeEventListener('resize', onResize);
      canvasEl.removeEventListener('pointermove', onPointerMove);
      canvasEl.removeEventListener('pointerleave', onPointerLeave);
      global.document.removeEventListener('visibilitychange', onVisibility);
      if (ro) { ro.disconnect(); ro = null; }
      if (mesh) {
        if (mesh.geometry) mesh.geometry.dispose();
        group.remove(mesh);
        mesh = null;
      }
      if (material) { material.dispose(); material = null; }
      if (envMap) { envMap.dispose(); envMap = null; }
      if (renderer) {
        renderer.dispose();
        renderer = null;
      }
      if (canvasEl.__jbe3dHandle === handle) canvasEl.__jbe3dHandle = null;
      if (!keepDiag) canvasEl.removeAttribute('data-jbe3d');
    }

    handle = {
      version: VERSION,
      get mode() { return diag.mode; },
      replay: function () {
        if (reduced || !renderer || !uProgress) { if (reduced && renderer) renderOnce(); return; }
        introStart = 0;
        uProgress.value = 0;
        diag.progress = 0;
        if (clock) clock.getDelta();
        schedule();
      },
      setReducedMotion: function (flag) {
        reduced = !!flag;
        diag.reducedMotion = reduced;
        canvasEl.setAttribute('data-jbe3d-reduced', reduced ? 'true' : 'false');
        if (!renderer || !uStagger || !uProgress) return;
        if (reduced) {
          if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
          uStagger.value = 0;
          renderOnce();
        } else {
          uStagger.value = clamp(opts.stagger, 0, 0.9);
          introStart = 0;
          uProgress.value = 0;
          schedule();
        }
      },
      render: function () { if (renderer) { resize(); renderer.render(scene, camera); } },
      diagnostics: function () { return assign({}, diag); },
      destroy: function () {
        dispose();
        var fb = canvasEl.parentNode && canvasEl.parentNode.querySelector('.jbe-logo3d-fallback');
        if (fb) fb.parentNode.removeChild(fb);
        canvasEl.style.display = '';
        canvasEl.removeAttribute('data-jbe3d-fallback');
      }
    };
    diag.mode = diag.mode === 'pending' ? 'loading' : diag.mode;
    canvasEl.__jbe3dHandle = handle;
    canvasEl.setAttribute('data-jbe3d', diag.mode);
    return handle;
  }

  var API = {
    version: VERSION,
    threeVersion: (typeof THREE !== 'undefined' && THREE.REVISION) ? THREE.REVISION : null,
    mount: mount,
    supportsWebGL: webglAvailable,
    prefersReducedMotion: prefersReducedMotion,
    themeVars: THEME_VARS
  };

  global.JBELogo3D = API;

  /* Node/CommonJS consumers (tests) — the component is normally a global. */
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
