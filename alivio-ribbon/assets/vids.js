/* GECOMO PDP video tiles: scroll-play + fullscreen player with controls. */
(function () {
  var vids = document.querySelectorAll('.vids .vvid');
  if (!vids.length) return;
  var box = null, big = null;

  function safePlay(v) {
    try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }
  function mark(v, on) {
    var b = v.closest ? v.closest('.vthumb') : null;
    if (b) b.classList.toggle('playing', !!on);
  }
  function close() {
    if (!box) return;
    try { big.pause(); } catch (e) {}
    big.removeAttribute('src'); big.load();
    box.classList.remove('on');
    document.documentElement.classList.remove('vlock');
  }
  function ensure() {
    if (box) return;
    box = document.createElement('div');
    box.className = 'vfull';
    box.innerHTML = '<button class="vfull-x" aria-label="Close video">&times;</button><video class="vfull-v" controls playsinline></video>';
    document.body.appendChild(box);
    big = box.querySelector('.vfull-v');
    box.addEventListener('click', function (e) {
      if (e.target === box || e.target.classList.contains('vfull-x')) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }
  function open(src) {
    ensure();
    big.src = src;
    big.muted = true;
    box.classList.add('on');
    document.documentElement.classList.add('vlock');
    var p = null;
    try { p = big.play(); } catch (e) {}
    if (p && p.catch) p.catch(function () {
      try { big.muted = true; big.play(); } catch (e) {}
    });
  }

  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (en) {
      if (en.isIntersecting) safePlay(en.target);
      else { try { en.target.pause(); } catch (e) {} }
    });
  }, { threshold: 0.15, rootMargin: '150px 0px' }) : null;

  Array.prototype.forEach.call(vids, function (v) {
    v.muted = true; v.loop = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.addEventListener('play', function () { mark(v, true); });
    v.addEventListener('pause', function () { mark(v, false); });
    if (io) io.observe(v);
  });

  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.vthumb') : null;
    if (!b) return;
    var v = b.querySelector('video.vvid');
    if (!v) return;
    e.preventDefault(); e.stopPropagation();
    open(v.currentSrc || v.getAttribute('src'));
  }, true);
})();
