(function () {
  var el = document.getElementById("mnav");
  if (!el) return;
  var html = document.documentElement;
  function lock() {
    // html carries overflow-x:hidden in cart.css, so locking body alone does not
    // stop the page scrolling — both the root and body need to be pinned.
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }
  function unlock() {
    html.style.overflow = "";
    document.body.style.overflow = "";
  }
  function close() { el.classList.remove("on"); unlock(); }
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".burger");
    if (b) {
      e.preventDefault();
      el.classList.add("on");
      lock();
      if (b.setAttribute) b.setAttribute("aria-expanded", "true");
      return;
    }
    if (e.target.closest("[data-mnav-close]") || e.target.closest(".mnav a")) {
      var bg = document.getElementById("burger");
      if (bg) bg.setAttribute("aria-expanded", "false");
      close();
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
})();

/* hide the sticky add-to-cart bar when the footer or the real ATC is on screen */
document.addEventListener("DOMContentLoaded", function () {
  var bar = document.querySelector(".sbar");
  var foot = document.querySelector("footer");
  if (!bar || !foot) return;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      bar.classList.toggle("hide-sbar", es[0].isIntersecting);
    }, { rootMargin: "0px 0px -40px 0px" }).observe(foot);
  }
});
