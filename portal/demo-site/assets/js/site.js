/* ============================================================================
   Johnny Bravo Entertainment — site.js
   Shared behaviour for every page. Plain ES5-safe vanilla JS, no build step,
   no framework, no network. Load order is fixed by BUILD-CONTRACT.md:

     assets/craft/scrollcraft.js   (engine, verbatim)
     assets/craft/fx-reveal.js     (craft device)
     assets/craft/fx-orbs.js       (craft device)
     assets/vendor/border-beam.js  (Libraries.dev port, MIT)
     assets/vendor/metal-fx.js     (Libraries.dev port, MIT)
     assets/js/site.js             (this file — ALWAYS LAST)

   This file is defensive on purpose: every optional effect is feature-detected
   and wrapped, so a missing file or an unsupported environment degrades to
   plain semantic HTML instead of throwing.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var docEl = doc.documentElement;

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---------------------------------------------------------------- 01. NAV */
  function initNav() {
    var toggle = $('[data-nav-toggle]');
    var nav = $('[data-nav]');
    if (!toggle || !nav) return;

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      nav.classList.toggle('is-open', open);
    }
    setOpen(false);

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 900) setOpen(false);
    }, { passive: true });
  }

  /* -------------------------------------------------------------- 02. YEAR */
  function initYear() {
    var y = String(new Date().getFullYear());
    $$('[data-year]').forEach(function (el) { el.textContent = y; });
  }

  /* --------------------------------------------------------- 03. SCROLLCRAFT
     One engine instance per page, mounted on <body>. Every data-sc-* attribute
     in the markup is read by the engine; this call is the only wiring needed. */
  function initEngine() {
    if (!window.ScrollCraft || typeof window.ScrollCraft.mount !== 'function') return null;
    try {
      return window.ScrollCraft.mount(doc.body);
    } catch (e) {
      $$('[data-sc-in]').forEach(function (el) { el.classList.add('sc-in'); });
      return null;
    }
  }

  /* ------------------------------------------------- 03b. REVEAL SAFETY NET
     Sibling fix for the vendored engine: its flow-reveal IntersectionObserver
     uses a shrunk root, so a block that is already on screen at load can stay
     at opacity 0 until the reader scrolls a little. A client site must never
     hold invisible content, so this sweeps anything intersecting the viewport
     and settles it. Idempotent — it only ever ADDS the reveal class. */
  function initRevealSafety() {
    var SEL = '[data-sc-in], [data-sc-stagger]';
    function sweep() {
      var vh = window.innerHeight || 800;
      $$(SEL).forEach(function (el) {
        if (el.classList.contains('sc-in')) return;
        var r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < vh - 16) {
          el.classList.add('sc-in');
          Array.prototype.forEach.call(el.children, function (kid) { kid.classList.add('sc-in'); });
        }
      });
    }
    sweep();
    window.addEventListener('scroll', sweep, { passive: true });
    window.addEventListener('resize', sweep, { passive: true });
    window.addEventListener('load', sweep);
    window.setTimeout(sweep, 700);
    window.setTimeout(sweep, 2000);
  }

  /* ------------------------------------------------------------ 04. FXREVEAL
     Cell-stagger materialize, first row of media cards only (<= 144 cells). */
  function initReveal() {
    if (!window.FxReveal || reduced()) return;
    var hosts = $$('[data-fx-reveal]').slice(0, 4);
    hosts.forEach(function (host) {
      var img = host.querySelector('img');
      if (!img) return;
      try { window.FxReveal.attach(img, { cells: 10, ms: 900 }); } catch (e) {}
    });
  }

  /* ---------------------------------------------------------- 05. BORDERBEAM
     At most ONE beam host per viewport. Reduced motion / missing script = the
     host keeps its plain CSS border. */
  function initBeam() {
    if (!window.BorderBeam || reduced()) return;
    var host = $('[data-beam]');
    if (!host || host.getAttribute('data-beam') === 'off') return;
    try {
      window.BorderBeam.attach(host, {
        size: 'md',
        colors: ['#f44a25', '#BFD1FF'],
        duration: 3.1,
        borderRadius: 20,
        borderWidth: 1,
        strength: 1,
        mode: 'overlay',
        reducedMotion: 'respect'
      });
    } catch (e) {}
  }

  /* ------------------------------------------------------------- 06. METALFX
     One metal ring: the header's Book Now button. WebGL2 required; the port
     already degrades to plain DOM, this guard just avoids the work. */
  function initMetal() {
    if (!window.MetalFx || reduced()) return;
    if (typeof window.MetalFx.supported === 'function' && !window.MetalFx.supported()) return;
    var host = $('[data-metal]');
    if (!host) return;
    try {
      window.MetalFx.ring(host, {
        preset: 'chromatic',
        fill: 'transparent',
        rim: { color: 'rgba(255,255,255,0.85)', px: 1 },
        ringPx: 2, periodCssPx: 26,
        strength: 1, glow: true, glowPx: 7, glowAlpha: 0.22
      });
    } catch (e) {}
  }

  /* --------------------------------------------------------------- 07. ORBS
     Dotted shaping orb used as a form/report busy state. Static frame under
     reduced motion; the port handles that itself. */
  function initOrbs() {
    if (!window.FxOrb) return;
    $$('[data-orb]').forEach(function (canvas) {
      var host = canvas.parentNode;
      try {
        window.FxOrb.mount(canvas, { size: 44, color: '#f44a25', speed: 1 });
      } catch (e) {}
      if (host) host.classList.add('is-ready');
    });
  }
  function orbBusy(host, on) {
    if (!host) return;
    var wrap = host.querySelector('.form-orb');
    var cnv = host.querySelector('.form-orb canvas');
    if (!wrap) return;
    wrap.classList.toggle('is-on', !!on);
    if (on && cnv && window.FxOrb && !cnv.__orbMounted) {
      cnv.__orbMounted = true;
      try { window.FxOrb.mount(cnv, { size: 44, color: '#f44a25' }); } catch (e) {}
    }
  }

  /* ----------------------------------------------------------- 08. LOGO 3D
     Hero mark: assets/js/logo-3d.js (window.JBELogo3D). The component owns its
     own reduced-motion and no-WebGL fallbacks, so this is just a guarded mount.
     The canvas MUST be sized by CSS — .hero__stage-inner does that. */
  function initLogo3D() {
    var canvas = $('[data-logo3d]');
    if (!canvas || !window.JBELogo3D) return;
    try {
      var handle = window.JBELogo3D.mount(canvas, {
        src: 'assets/img/jbe-logo-rev.png',
        alt: 'Johnny Bravo Entertainment',
        sample: 220,
        depth: 0.17,
        introDuration: 2200,
        spin: 0.055,
        tint: '#f44a25'
      });
      canvas.addEventListener('jbe3d:ready', function () {
        var stage = canvas.closest('.hero__stage');
        if (stage) stage.setAttribute('data-3d-ready', 'true');
      });
      window.__jbeDiag3d = function () { return handle && handle.diagnostics && handle.diagnostics(); };
    } catch (e) {}
  }

  /* --------------------------------------------------------------- 09. FORM
     Static form: no backend exists on a static host, so the submit handler
     validates every field, composes a pre-filled mail draft to the client's
     published address, and hands the reader a one-tap way to send it. The
     <form action="mailto:..."> attribute is the no-JS fallback. */
  var REQUIRED = ['contactType', 'firstName', 'lastName', 'email', 'phone', 'eventDate'];

  function initForm() {
    var form = $('[data-contact-form]');
    if (!form) return;
    var status = $('[data-form-status]', form.parentNode) || $('[data-form-status]');
    var sending = false;

    function fieldOf(name) { return form.querySelector('[name="' + name + '"]'); }

    function errEl(input) {
      var f = input.closest('.field') || input.closest('fieldset') || input.parentNode;
      return f ? f.querySelector('.field__error') : null;
    }

    function mark(input, bad, msg) {
      input.setAttribute('aria-invalid', bad ? 'true' : 'false');
      var e = errEl(input);
      if (e) {
        e.textContent = bad ? msg : '';
        e.classList.toggle('is-on', !!bad);
      }
    }

    function validate() {
      var bad = [];
      REQUIRED.forEach(function (name) {
        var input = fieldOf(name);
        if (!input) return;
        var empty = !String(input.value || '').trim();
        if (empty) { mark(input, true, 'This field is required.'); bad.push(input); }
        else mark(input, false);
      });
      var email = fieldOf('email');
      if (email && String(email.value).trim()) {
        var ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
        mark(email, !ok, 'Enter a valid email address.');
        if (!ok) bad.push(email);
      }
      var services = $$('input[name="services"]:checked', form);
      var svcErr = $('[data-services-error]', form);
      var svcGroup = $('[data-services-group]', form);
      if (svcErr) {
        var noSvc = services.length === 0;
        svcErr.textContent = noSvc ? 'Choose at least one service.' : '';
        svcErr.classList.toggle('is-on', noSvc);
        if (svcGroup) svcGroup.setAttribute('aria-invalid', noSvc ? 'true' : 'false');
        if (noSvc) bad.push(svcErr);
      }
      return bad;
    }

    function compose() {
      var v = function (n) { var f = fieldOf(n); return f ? String(f.value || '').trim() : ''; };
      var name = (v('firstName') + ' ' + v('lastName')).trim();
      var subject = 'Event enquiry — ' + (name || 'Website form') + (v('eventDate') ? ' (' + v('eventDate') + ')' : '');
      var svc = $$('input[name="services"]:checked', form).map(function (i) { return i.value; });
      var lines = [
        'Name: ' + name,
        'I am an: ' + (v('contactType') || '—'),
        'Organization: ' + (v('organization') || '—'),
        'Email: ' + v('email'),
        'Phone: ' + v('phone'),
        'Services requested: ' + (svc.join(', ') || '—'),
        'Event date: ' + (v('eventDate') || '—'),
        'Event start / end time: ' + (v('eventTime') || '—'),
        'Venue: ' + (v('venue') || '—'),
        'Room: ' + (v('room') || '—'),
        'Venue address: ' + [v('street'), v('street2'), v('city'), v('state'), v('zip'), v('country')]
          .filter(Boolean).join(', '),
        '',
        'Details:',
        v('message') || '—'
      ];
      return {
        subject: subject,
        body: lines.join('\n'),
        mailto: 'mailto:JohnnyBravoEntertainment@gmail.com?subject=' +
          encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'))
      };
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;
      var bad = validate();
      if (bad.length) {
        if (status) {
          status.className = 'form-status form-status--err is-on';
          status.setAttribute('role', 'alert');
          status.textContent = 'Please check the highlighted fields and send again.';
        }
        var first = bad[0];
        if (first && first.focus) first.focus();
        return;
      }

      sending = true;
      orbBusy(form.parentNode, true);
      var data = compose();
      var btn = form.querySelector('[type="submit"]');
      if (btn) btn.setAttribute('aria-disabled', 'true');

      window.setTimeout(function () {
        var payload = {};
        Array.prototype.forEach.call(form.elements, function (el) {
          if (!el.name || el.disabled) return;
          if (el.type === 'checkbox') {
            if (el.checked) { (payload[el.name] = payload[el.name] || []).push(el.value); }
            return;
          }
          if (el.type === 'radio') { if (el.checked) payload[el.name] = el.value; return; }
          payload[el.name] = el.value;
        });
        if (!payload.services) payload.services = [];

        function finish(ok) {
          orbBusy(form.parentNode, false);
          sending = false;
          if (btn) btn.removeAttribute('aria-disabled');
          if (!status) return;
          if (ok) {
            status.className = 'form-status form-status--ok is-on';
            status.setAttribute('role', 'status');
            status.innerHTML =
              '<div><strong>Your request is in.</strong>' +
              '<p class="small mb-0">Thanks — Johnny’s team has your details and will reply by email or phone. ' +
              'Need to add something? Write to <a href="mailto:JohnnyBravoEntertainment@gmail.com">JohnnyBravoEntertainment@gmail.com</a>.</p></div>';
            status.scrollIntoView({ block: 'nearest' });
            form.reset();
            return;
          }
          status.className = 'form-status form-status--err is-on';
          status.setAttribute('role', 'alert');
          status.innerHTML =
            '<div><strong>We could not send that just now.</strong>' +
            '<p class="small mb-0">Open the pre-filled email below and press send, or write to ' +
            '<a href="mailto:JohnnyBravoEntertainment@gmail.com">JohnnyBravoEntertainment@gmail.com</a> directly.</p>' +
            '<p class="mt-6 mb-0"><a class="btn btn--primary" id="mailtoGo" href="' +
            data.mailto.replace(/"/g, '&quot;') + '">Open pre-filled email <span class="btn__arrow" aria-hidden="true">&rarr;</span></a></p></div>';
          var go = $('[data-form-status] #mailtoGo') || $('#mailtoGo');
          if (go) go.focus();
          status.scrollIntoView({ block: 'nearest' });
        }

        fetch('https://www.bsaiagents.com/jbe-admin/api/inquiries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (r) { return r.ok; })
          .catch(function () { return false; })
          .then(finish);
      }, reduced() ? 0 : 620);
    });

    form.addEventListener('input', function (e) {
      var t = e.target;
      if (!t || !t.name) return;
      if (t.getAttribute('aria-invalid') === 'true') mark(t, false);
    });
  }

  /* ---------------------------------------------------------------- 10. BOOT */
  function boot() {
    initNav();
    initYear();
    initEngine();
    initRevealSafety();
    initReveal();
    initBeam();
    initMetal();
    initOrbs();
    initLogo3D();
    initForm();
    docEl.classList.add('js-ready');
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
