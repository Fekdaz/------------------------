/**
 * Mobile header: expandable navigation menu.
 */
(function () {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".site-header__toggle");
  const nav = document.getElementById("site-header-nav");

  if (!header || !toggle || !nav) return;

  const mobileQuery = window.matchMedia("(max-width: 900px)");

  function isMobileNav() {
    return mobileQuery.matches;
  }

  function setMenuState(isOpen) {
    header.classList.toggle("is-menu-open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Закрыть меню" : "Открыть меню");
    document.body.classList.toggle("is-nav-open", isOpen && isMobileNav());
  }

  function closeMenu() {
    setMenuState(false);
  }

  function openMenu() {
    if (!isMobileNav()) return;
    setMenuState(true);
  }

  function toggleMenu() {
    if (!isMobileNav()) return;
    setMenuState(!header.classList.contains("is-menu-open"));
  }

  toggle.addEventListener("click", toggleMenu);

  nav.querySelectorAll(".site-header__link").forEach((link) => {
    link.addEventListener("click", () => {
      if (isMobileNav()) closeMenu();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  mobileQuery.addEventListener("change", (event) => {
    if (!event.matches) closeMenu();
  });

  window.addEventListener("resize", () => {
    if (!isMobileNav()) closeMenu();
  });
})();
