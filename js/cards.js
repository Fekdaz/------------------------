/**
 * Card stack: desktop — stacked deck, click to bring forward.
 * Mobile — compact stack with swipe, dots, dynamic height.
 */
(function () {
  const stack = document.getElementById("cards-stack");
  if (!stack) return;

  const cards = Array.from(stack.querySelectorAll(".case-card"));
  const zIndex = { front: 3, mid: 2, back: 1 };

  const mobileQuery = window.matchMedia("(max-width: 1024px)");

  let order = { front: "1", mid: "2", back: "3" };
  let locked = false;
  let nav = null;
  let dots = [];
  let touchStartX = 0;
  let touchStartY = 0;

  function isMobile() {
    return mobileQuery.matches;
  }

  function getStackSteps() {
    const styles = getComputedStyle(stack);

    if (isMobile()) {
      const stepX = parseFloat(styles.getPropertyValue("--mobile-card-step-x"));
      const stepY = parseFloat(styles.getPropertyValue("--mobile-card-step-y"));

      return {
        x: Number.isFinite(stepX) && stepX > 0 ? stepX : 40,
        y: Number.isFinite(stepY) && stepY > 0 ? stepY : 28,
      };
    }

    const stepX = parseFloat(styles.paddingRight) / 2;
    const stepY = parseFloat(styles.paddingBottom) / 2;

    return {
      x: Number.isFinite(stepX) && stepX > 0 ? stepX : 120,
      y: Number.isFinite(stepY) && stepY > 0 ? stepY : 36,
    };
  }

  function getSlot(id) {
    if (id === order.front) return "front";
    if (id === order.mid) return "mid";
    return "back";
  }

  function applyOrder() {
    const { x, y } = getStackSteps();
    const mobile = isMobile();

    const offsets = mobile
      ? {
          front: { x: 0, y: 0, scale: 1, opacity: 1 },
          mid: { x: x, y: y, scale: 1, opacity: 1 },
          back: { x: x * 2, y: y * 2, scale: 1, opacity: 1 },
        }
      : {
          front: { x: 0, y: 0, scale: 1, opacity: 1 },
          mid: { x, y, scale: 1, opacity: 1 },
          back: { x: x * 2, y: y * 2, scale: 1, opacity: 1 },
        };

    cards.forEach((card) => {
      const id = card.dataset.card;
      const slot = getSlot(id);
      const { x: offsetX, y: offsetY, scale, opacity } = offsets[slot];

      card.style.transform =
        scale === 1
          ? `translate(${offsetX}px, ${offsetY}px)`
          : `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
      card.style.zIndex = String(zIndex[slot]);
      card.style.opacity = String(opacity);
      card.classList.toggle("is-front", slot === "front");
      card.classList.toggle("is-behind", slot !== "front");
    });

    updateDots();
    updateStackHeight();
  }

  function updateStackHeight() {
    if (!isMobile()) {
      stack.style.height = "";
      stack.style.minHeight = "";
      return;
    }

    const frontCard = cards.find((card) => card.dataset.card === order.front);
    if (!frontCard) return;

    const { y } = getStackSteps();
    const totalHeight = frontCard.offsetHeight + y * 2;

    stack.style.height = `${totalHeight}px`;
    stack.style.minHeight = `${totalHeight}px`;
  }

  function updateDots() {
    if (!nav) return;

    dots.forEach((dot) => {
      const active = dot.dataset.card === order.front;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-current", active ? "true" : "false");
    });
  }

  function bringToFront(cardId) {
    if (locked || cardId === order.front) return;

    const oldFront = order.front;
    const allIds = cards.map((card) => card.dataset.card);

    order = {
      front: cardId,
      back: oldFront,
      mid: allIds.find((id) => id !== cardId && id !== oldFront),
    };

    applyOrder();

    locked = true;
    window.setTimeout(() => {
      locked = false;
    }, 400);
  }

  function cycleNext() {
    const ids = cards.map((card) => card.dataset.card);
    const currentIndex = ids.indexOf(order.front);
    const nextId = ids[(currentIndex + 1) % ids.length];
    bringToFront(nextId);
  }

  function cyclePrev() {
    const ids = cards.map((card) => card.dataset.card);
    const currentIndex = ids.indexOf(order.front);
    const prevId = ids[(currentIndex - 1 + ids.length) % ids.length];
    bringToFront(prevId);
  }

  function buildNav() {
    nav = document.createElement("div");
    nav.className = "cards-stack-nav";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "Навигация по кейсам");

    cards.forEach((card) => {
      const id = card.dataset.card;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cards-stack-dot";
      btn.dataset.card = id;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-label", `Кейс ${id}`);
      btn.setAttribute("aria-current", id === order.front ? "true" : "false");

      btn.addEventListener("click", () => {
        bringToFront(id);
      });

      nav.appendChild(btn);
      dots.push(btn);
    });

    stack.before(nav);
  }

  function bindCards() {
    cards.forEach((card) => {
      card.addEventListener("click", () => {
        if (card.dataset.card !== order.front) {
          bringToFront(card.dataset.card);
        }
      });
    });
  }

  function bindSwipe() {
    stack.addEventListener(
      "touchstart",
      (event) => {
        if (!isMobile()) return;
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
      },
      { passive: true }
    );

    stack.addEventListener(
      "touchend",
      (event) => {
        if (!isMobile()) return;

        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;

        if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY)) return;

        if (deltaX < 0) cycleNext();
        else cyclePrev();
      },
      { passive: true }
    );
  }

  function bindResize() {
    window.addEventListener("resize", () => {
      applyOrder();
    });

    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", applyOrder);
    } else if (typeof mobileQuery.addListener === "function") {
      mobileQuery.addListener(applyOrder);
    }
  }

  buildNav();
  bindCards();
  bindSwipe();
  bindResize();
  applyOrder();

  window.requestAnimationFrame(() => {
    updateStackHeight();
  });

  if (typeof window.ResizeObserver === "function") {
    const resizeObserver = new window.ResizeObserver(() => {
      if (isMobile()) updateStackHeight();
    });

    cards.forEach((card) => resizeObserver.observe(card));
  }
})();
