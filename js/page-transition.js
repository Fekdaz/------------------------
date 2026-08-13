(function () {
  var STORAGE_KEY = "kozhevnya-page-transition";
  var DURATION = 420;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var leaving = false;

  function consumeIncoming() {
    var direction = null;
    try {
      direction = sessionStorage.getItem(STORAGE_KEY);
      if (direction) sessionStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      direction = null;
    }
    return direction;
  }

  function playEnter() {
    var root = document.documentElement;
    var direction =
      root.classList.contains("page-transition-enter--from-catalog")
        ? "from-catalog"
        : root.classList.contains("page-transition-enter--from-home")
          ? "from-home"
          : consumeIncoming();

    if (!direction || reduced) {
      root.classList.remove(
        "page-transition-enter",
        "page-transition-enter-active",
        "page-transition-enter--from-home",
        "page-transition-enter--from-catalog"
      );
      return;
    }

    root.classList.add("page-transition-enter", "page-transition-enter--" + direction);
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        root.classList.add("page-transition-enter-active");
      });
    });

    window.setTimeout(function () {
      root.classList.remove(
        "page-transition-enter",
        "page-transition-enter-active",
        "page-transition-enter--from-home",
        "page-transition-enter--from-catalog"
      );
    }, DURATION + 80);
  }

  function navigate(href, leaveDirection, enterDirection) {
    if (leaving) return;
    if (reduced) {
      window.location.href = href;
      return;
    }

    leaving = true;
    try {
      sessionStorage.setItem(STORAGE_KEY, enterDirection);
    } catch (error) {}

    document.documentElement.classList.add(
      "page-transition-leave",
      "page-transition-leave--" + leaveDirection
    );

    window.setTimeout(function () {
      window.location.href = href;
    }, DURATION);
  }

  function isModifiedClick(event) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest("a[href]");
    if (!link || isModifiedClick(event) || link.target === "_blank") return;

    var href = link.getAttribute("href");
    if (href === "nashi-raboty.html" || href === "katalog-kozhi.html") {
      event.preventDefault();
      navigate(href, "to-catalog", "from-home");
      return;
    }

    if (link.classList.contains("gallery-back")) {
      event.preventDefault();
      navigate(href, "to-home", "from-catalog");
    }
  });

  playEnter();
})();
