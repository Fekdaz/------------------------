(function () {
  var stageTablet = document.getElementById("nearby-tablet");
  var expandedTablet = document.getElementById("nearby-tablet-expanded");
  var expandBtn = document.getElementById("nearby-tablet-fullscreen-expand");
  var collapseBtn = document.getElementById("nearby-tablet-fullscreen-collapse");
  if (!stageTablet || !expandedTablet || !expandBtn || !collapseBtn) return;

  var ANIMATION_MS = 450;
  var MOBILE_MAX = 1024;
  var expanded = false;
  var animating = false;
  var animatingTablet = null;
  var backdrop = null;
  var scrollLockY = 0;
  var scrollLockNodes = [];
  var flipTimer = null;
  var pendingFlipTarget = null;
  var stageAnchor = null;
  var stageOriginalParent = null;

  function isMobileViewport() {
    return window.innerWidth <= MOBILE_MAX;
  }

  function ensureBackdrop() {
    if (backdrop) return backdrop;

    backdrop = document.createElement("div");
    backdrop.className = "nearby__tablet-backdrop";
    backdrop.id = "nearby-tablet-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.addEventListener("click", collapse);
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function setTabletVisible(tablet, visible) {
    tablet.classList.toggle("is-dormant", !visible);
    tablet.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function isInsideActiveTablet(target) {
    if (!(target instanceof Node)) return false;
    if (animating && animatingTablet) return animatingTablet.contains(target);
    if (expanded) return expandedTablet.contains(target);
    return stageTablet.contains(target);
  }

  function isScrollLocked() {
    return document.documentElement.classList.contains("nearby-tablet-expanded");
  }

  function preventScrollOutsideTablet(event) {
    if (!isScrollLocked() || isInsideActiveTablet(event.target)) return;
    event.preventDefault();
  }

  function onOutsideClick(event) {
    if (!isScrollLocked() || animating || isInsideActiveTablet(event.target)) return;
    collapse();
  }

  function getScrollbarWidth() {
    return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  }

  function applyScrollbarCompensation() {
    var scrollbarWidth = getScrollbarWidth();
    if (scrollbarWidth <= 0) return;

    scrollLockNodes = [document.body];
    document.body.style.paddingRight = scrollbarWidth + "px";

    var header = document.querySelector(".site-header");
    if (header) {
      scrollLockNodes.push(header);
      header.style.paddingRight = scrollbarWidth + "px";
    }
  }

  function clearScrollbarCompensation() {
    scrollLockNodes.forEach(function (node) {
      node.style.paddingRight = "";
    });
    scrollLockNodes = [];
  }

  function lockScroll() {
    scrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
    document.documentElement.classList.add("nearby-tablet-expanded");
    document.body.classList.add("nearby-tablet-expanded");
    applyScrollbarCompensation();

    if (isMobileViewport()) {
      document.body.style.position = "fixed";
      document.body.style.top = "-" + scrollLockY + "px";
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
    }

    document.addEventListener("touchmove", preventScrollOutsideTablet, { passive: false });
    document.addEventListener("wheel", preventScrollOutsideTablet, { passive: false });
    document.addEventListener("click", onOutsideClick, true);
  }

  function unlockScroll() {
    var y = scrollLockY;
    var html = document.documentElement;
    var previousScrollBehavior = html.style.scrollBehavior;

    html.style.scrollBehavior = "auto";

    document.documentElement.classList.remove("nearby-tablet-expanded");
    document.body.classList.remove("nearby-tablet-expanded");

    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    clearScrollbarCompensation();

    html.scrollTop = y;
    document.body.scrollTop = y;
    window.scrollTo(0, y);

    html.style.scrollBehavior = previousScrollBehavior;

    document.removeEventListener("touchmove", preventScrollOutsideTablet, { passive: false });
    document.removeEventListener("wheel", preventScrollOutsideTablet, { passive: false });
    document.removeEventListener("click", onOutsideClick, true);
  }

  function ensureStageAnchor() {
    if (stageAnchor) return;

    stageOriginalParent = stageTablet.parentNode;
    stageAnchor = document.createComment("nearby-tablet-stage-anchor");
    stageOriginalParent.insertBefore(stageAnchor, stageTablet);
  }

  function liftTabletToBody(tablet) {
    if (tablet === stageTablet) {
      ensureStageAnchor();
    }

    document.body.appendChild(tablet);
  }

  function restoreStageTablet() {
    if (stageAnchor && stageAnchor.parentNode) {
      stageAnchor.parentNode.insertBefore(stageTablet, stageAnchor);
      stageAnchor.remove();
      stageAnchor = null;
    } else if (stageOriginalParent) {
      stageOriginalParent.appendChild(stageTablet);
    }

    stageOriginalParent = null;
  }

  function setToggleState(isExpanded) {
    expandBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    collapseBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  }

  function readCollapsedRotate() {
    var block = document.querySelector(".block--nearby");
    if (!block) return "-11deg";
    return getComputedStyle(block).getPropertyValue("--nearby-tablet-rotate").trim() || "-11deg";
  }

  function center(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function notifyMapResize() {
    window.dispatchEvent(new Event("nearby-tablet-resize"));
  }

  function pinTabletAtRect(tablet, rect, rotate) {
    var rectCenter = center(rect);

    tablet.style.position = "fixed";
    tablet.style.left = rectCenter.x + "px";
    tablet.style.top = rectCenter.y + "px";
    tablet.style.width = rect.width + "px";
    tablet.style.maxWidth = rect.width + "px";
    tablet.style.margin = "0";
    tablet.style.transform = "translate(-50%, -50%) rotate(" + rotate + ")";
    notifyMapResize();
  }

  function clearFlipStyles(tablet) {
    tablet.style.transition = "";
    tablet.style.position = "";
    tablet.style.left = "";
    tablet.style.top = "";
    tablet.style.width = "";
    tablet.style.maxWidth = "";
    tablet.style.margin = "";
    tablet.style.transform = "";
    tablet.classList.remove("is-flipping", "is-at-stage", "is-at-expanded");
  }

  function getStageRect() {
    return stageTablet.getBoundingClientRect();
  }

  function getExpandedRect() {
    return expandedTablet.getBoundingClientRect();
  }

  function clearFlipTimer() {
    if (flipTimer) {
      window.clearTimeout(flipTimer);
      flipTimer = null;
    }
  }

  function finishFlip(toExpanded) {
    if (!animating) return;

    clearFlipTimer();
    animating = false;
    pendingFlipTarget = null;

    clearFlipStyles(stageTablet);
    clearFlipStyles(expandedTablet);
    animatingTablet = null;

    if (toExpanded) {
      expanded = true;
      restoreStageTablet();
      setTabletVisible(stageTablet, false);
      setTabletVisible(expandedTablet, true);
      notifyMapResize();
      return;
    }

    expanded = false;
    setTabletVisible(expandedTablet, false);
    setTabletVisible(stageTablet, true);
    backdrop.classList.remove("is-visible");
    backdrop.setAttribute("aria-hidden", "true");
    setToggleState(false);
    unlockScroll();
    notifyMapResize();
  }

  function scheduleFlipFinish(toExpanded) {
    clearFlipTimer();
    flipTimer = window.setTimeout(function () {
      finishFlip(toExpanded);
    }, ANIMATION_MS + 80);
  }

  function setFlipInset(tablet, mode) {
    tablet.classList.remove("is-at-stage", "is-at-expanded");
    tablet.classList.add(mode === "stage" ? "is-at-stage" : "is-at-expanded");
  }

  function beginFlip(tablet, fromRect, fromRotate, fromInset) {
    liftTabletToBody(tablet);
    tablet.classList.add("is-flipping");
    setFlipInset(tablet, fromInset);
    tablet.style.transition = "none";
    pinTabletAtRect(tablet, fromRect, fromRotate);
    void tablet.offsetWidth;
  }

  function playFlip(tablet, toRect, toRotate, toInset, toExpanded) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        setFlipInset(tablet, toInset);
        tablet.style.transition = "";
        pinTabletAtRect(tablet, toRect, toRotate);
        scheduleFlipFinish(toExpanded);
      });
    });
  }

  function runExpandAnimation(stageRect, expandedRect, collapsedRotate) {
    animating = true;
    pendingFlipTarget = true;
    animatingTablet = stageTablet;

    setTabletVisible(expandedTablet, false);
    setTabletVisible(stageTablet, true);

    ensureBackdrop();
    setToggleState(true);
    backdrop.classList.add("is-visible");
    backdrop.setAttribute("aria-hidden", "false");

    beginFlip(stageTablet, stageRect, collapsedRotate, "stage");
    lockScroll();
    playFlip(stageTablet, expandedRect, "0deg", "expanded", true);
  }

  function runCollapseAnimation(expandedRect, stageRect, collapsedRotate) {
    animating = true;
    pendingFlipTarget = false;
    animatingTablet = expandedTablet;

    setTabletVisible(stageTablet, false);
    setTabletVisible(expandedTablet, true);

    beginFlip(expandedTablet, expandedRect, "0deg", "expanded");
    playFlip(expandedTablet, stageRect, collapsedRotate, "stage", false);
  }

  function expand() {
    if (expanded || animating) return;

    var stageRect = stageTablet.getBoundingClientRect();
    var expandedRect = getExpandedRect();
    var collapsedRotate = readCollapsedRotate();

    runExpandAnimation(stageRect, expandedRect, collapsedRotate);
  }

  function collapse() {
    if (!expanded || animating) return;

    var stageRect = getStageRect();
    var expandedRect = getExpandedRect();
    var collapsedRotate = readCollapsedRotate();

    runCollapseAnimation(expandedRect, stageRect, collapsedRotate);
  }

  function onTransitionEnd(event) {
    if (!animating || event.target !== animatingTablet) return;
    if (
      event.propertyName !== "transform" &&
      event.propertyName !== "left" &&
      event.propertyName !== "top" &&
      event.propertyName !== "width"
    ) {
      return;
    }

    finishFlip(pendingFlipTarget);
  }

  expandBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    expand();
  });

  collapseBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    collapse();
  });

  stageTablet.addEventListener("transitionend", onTransitionEnd);
  expandedTablet.addEventListener("transitionend", onTransitionEnd);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && expanded && !animating) {
      event.preventDefault();
      collapse();
    }
  });

  window.addEventListener("resize", notifyMapResize);
})();
