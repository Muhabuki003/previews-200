/* Johnny Bravo Entertainment — live content + news feed.
   Reads the pieces the client edits in the site admin and applies them here.
   Static-safe: if the API is unreachable the page is left exactly as authored. */
(function () {
  'use strict';
  var API = 'https://www.bsaiagents.com/jbe-admin';
  var page = (location.pathname.split('/').pop() || 'index.html').split('?')[0];
  if (!page || page === '') page = 'index.html';

  function apply(overrides) {
    Object.keys(overrides || {}).forEach(function (key) {
      var m = /^([a-z0-9]+)#(\d+)$/.exec(key);
      if (!m) return;
      var nodes = document.getElementsByTagName(m[1]);
      var el = nodes[parseInt(m[2], 10)];
      if (!el) return;
      var text = overrides[key];
      if (typeof text !== 'string' || !text.trim()) return;
      el.textContent = text;
    });
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderNews(items) {
    if (!items || !items.length || page !== 'news.html') return;
    if (document.getElementById('jbe-latest-news')) return;
    var press = document.querySelector('section[aria-labelledby="press-title"]');
    if (!press || !press.parentNode) return;
    var sec = document.createElement('section');
    sec.className = 'section section--dark';
    sec.id = 'jbe-latest-news';
    sec.setAttribute('aria-labelledby', 'jbe-latest-title');
    var cards = items.map(function (n) {
      var meta = [n.source, n.date].filter(Boolean).join(' · ');
      return '<article class="card card--press"><div class="card__inner">' +
        (meta ? '<p class="card__meta">' + esc(meta) + '</p>' : '') +
        '<h3 class="card__title"><a href="' + esc(n.url) + '" target="_blank" rel="noopener">' +
        esc(n.title) + '</a></h3>' +
        (n.summary ? '<p class="card__body">' + esc(n.summary) + '</p>' : '') +
        '</div></article>';
    }).join('');
    sec.innerHTML = '<div class="wrap"><div class="section__head">' +
      '<p class="eyebrow">Latest coverage</p>' +
      '<h2 id="jbe-latest-title">Recent mentions</h2>' +
      '<p class="lead">Fresh press and community coverage, updated from the admin desk.</p>' +
      '</div><div class="grid grid--3">' + cards + '</div></div>';
    press.parentNode.insertBefore(sec, press);
  }

  try {
    fetch(API + '/api/content?page=' + encodeURIComponent(page))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        apply(d.overrides);
        renderNews(d.news);
      })
      .catch(function () { /* offline or admin down: keep authored copy */ });
  } catch (e) { /* no fetch: keep authored copy */ }
})();
