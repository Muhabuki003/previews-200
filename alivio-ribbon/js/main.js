/* AlivioVital — page behaviour: mobile nav, quantity stepper, PDP gallery. */
(function () {
  "use strict";

  /* ---- mobile navigation ---- */
  var burger = document.getElementById("burger");
  var nav = document.getElementById("mainNav");
  if (burger && nav) {
    burger.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = nav.classList.toggle("open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("click", function (e) {
      if (!nav.contains(e.target) && !burger.contains(e.target)) {
        nav.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        nav.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
        burger.focus();
      }
    });
  }

  /* ---- quantity stepper ---- */
  document.querySelectorAll(".qty").forEach(function (q) {
    var input = q.querySelector("input");
    var minus = q.querySelector(".q-minus");
    var plus = q.querySelector(".q-plus");
    if (!input) return;
    var clamp = function (v) { return Math.min(10, Math.max(1, v || 1)); };
    if (minus) minus.addEventListener("click", function () { input.value = clamp(parseInt(input.value, 10) - 1); });
    if (plus) plus.addEventListener("click", function () { input.value = clamp(parseInt(input.value, 10) + 1); });
    input.addEventListener("change", function () { input.value = clamp(parseInt(input.value, 10)); });
  });

  /* ---- PDP gallery: swap the single <img> so layout never jumps ---- */
  var thumbs = document.getElementById("thumbs");
  var main = document.getElementById("mainImg");
  if (thumbs && main) {
    thumbs.querySelectorAll(".thumb").forEach(function (t) {
      t.addEventListener("click", function () {
        var jpg = t.getAttribute("data-src");
        var webp = t.getAttribute("data-srcset");
        if (!jpg) return;
        var pic = main.parentElement;
        var src = pic && pic.querySelector("source");
        if (src && webp) { src.srcset = webp; } else if (src) { src.removeAttribute("srcset"); }
        main.src = jpg;
        main.removeAttribute("srcset");
        thumbs.querySelectorAll(".thumb").forEach(function (x) {
          x.classList.remove("on");
          x.setAttribute("aria-pressed", "false");
        });
        t.classList.add("on");
        t.setAttribute("aria-pressed", "true");
      });
    });
  }
})();
