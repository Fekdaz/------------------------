/**
 * Adaptive split-block layout (desktop only).
 * Keeps text/visual overlap at or below 10% by compacting text first,
 * then scaling text and photos in parallel.
 */
(function () {
  const MOBILE_MAX = 1024;
  const OVERLAP_LIMIT = 0.1;
  const MIN_SCALE = 0.52;
  const BINARY_STEPS = 14;
  const INTRO_TEXT_GAP_BUFFER = 20;
  const INTRO_TEXT_GAP_MAX = 720;

  const BLOCKS = [
    {
      root: ".intro",
      texts: [".block--hero .block__content", ".block--proof .block__content"],
      visual: ".intro__photo",
    },
    {
      root: ".block--competition",
      texts: [".competition__content"],
      visual: ".competition__visual",
    },
    {
      root: ".block--leather",
      texts: [".leather__content"],
      visual: ".leather__visual",
    },
    {
      root: ".block--products",
      texts: [".products__content"],
      visual: ".products__visual",
    },
    {
      root: ".block--nearby",
      texts: [".nearby__content"],
      visual: ".nearby__visual",
    },
    {
      root: ".block--process",
      texts: [".process__title", ".process__cards"],
      visual: ".process__visual",
    },
  ];

  let frameId = 0;
  let running = false;

  function debounce(fn, wait) {
    let timer;
    return function debounced() {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  function getRectUnion(elements) {
    const rects = elements
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);

    if (!rects.length) return null;

    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  }

  function overlapArea(a, b) {
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return width * height;
  }

  function measureOverlapRatio(textRect, visualRect) {
    if (!textRect || !visualRect) return 0;

    const textArea = textRect.width * textRect.height;
    if (textArea <= 0) return 0;

    return overlapArea(textRect, visualRect) / textArea;
  }

  function flushLayout(node) {
    void node.offsetHeight;
  }

  function getBlockElements(config) {
    const root = document.querySelector(config.root);
    if (!root) return null;

    const textNodes = config.texts
      .flatMap((selector) => Array.from(root.querySelectorAll(selector)))
      .filter(Boolean);

    const visual = root.querySelector(config.visual);
    if (!textNodes.length || !visual) return null;

    return { root, textNodes, visual };
  }

  function readOverlap(config, root) {
    const elements = getBlockElements(config);
    if (!elements) return 0;

    flushLayout(root);

    const textRect = getRectUnion(elements.textNodes);
    const visualRect = elements.visual.getBoundingClientRect();
    return measureOverlapRatio(textRect, visualRect);
  }

  function applyScale(root, scale) {
    root.style.setProperty("--block-scale", String(scale));
  }

  function resetBlock(root) {
    root.style.removeProperty("--block-scale");
    root.style.removeProperty("--intro-text-gap");
    root.classList.remove("layout-compact");
  }

  function measureVerticalTextOverlap(bottomEl, topEl) {
    const bottomRect = bottomEl.getBoundingClientRect();
    const topRect = topEl.getBoundingClientRect();
    const horizontalOverlap =
      Math.min(bottomRect.right, topRect.right) - Math.max(bottomRect.left, topRect.left);

    if (horizontalOverlap <= 0) return 0;

    return Math.max(0, bottomRect.bottom - topRect.top);
  }

  function fitIntroTextGap() {
    const intro = document.querySelector(".intro");
    const heroContent = document.querySelector(".block--hero .block__content");
    const proofContent = document.querySelector(".block--proof .block__content");

    if (!intro || !heroContent || !proofContent) return;

    intro.style.setProperty("--intro-text-gap", "0px");
    flushLayout(intro);

    let gap = 0;

    for (let step = 0; step < 4; step += 1) {
      const overlap = measureVerticalTextOverlap(heroContent, proofContent);
      if (overlap <= 0) break;

      gap = Math.min(gap + overlap + INTRO_TEXT_GAP_BUFFER, INTRO_TEXT_GAP_MAX);
      intro.style.setProperty("--intro-text-gap", `${gap}px`);
      flushLayout(intro);
    }

    if (gap <= 0) {
      intro.style.removeProperty("--intro-text-gap");
    }
  }

  function fitBlock(config) {
    const elements = getBlockElements(config);
    if (!elements) return;

    const { root } = elements;

    applyScale(root, 1);
    root.classList.remove("layout-compact");
    flushLayout(root);

    let ratio = readOverlap(config, root);

    if (ratio > OVERLAP_LIMIT) {
      root.classList.add("layout-compact");
      flushLayout(root);
      ratio = readOverlap(config, root);
    }

    if (ratio <= OVERLAP_LIMIT) {
      if (!root.classList.contains("layout-compact")) applyScale(root, 1);
      return;
    }

    let low = MIN_SCALE;
    let high = 1;
    let best = MIN_SCALE;

    for (let step = 0; step < BINARY_STEPS; step += 1) {
      const mid = (low + high) / 2;
      applyScale(root, mid);
      flushLayout(root);

      const nextRatio = readOverlap(config, root);
      if (nextRatio > OVERLAP_LIMIT) {
        high = mid;
      } else {
        best = mid;
        low = mid;
      }
    }

    applyScale(root, best);
    root.classList.add("layout-compact");
  }

  function resetAll() {
    BLOCKS.forEach((config) => {
      const root = document.querySelector(config.root);
      if (root) resetBlock(root);
    });
  }

  function updateAll() {
    if (window.innerWidth <= MOBILE_MAX) {
      resetAll();
      running = false;
      return;
    }

    BLOCKS.forEach((config) => fitBlock(config));
    fitIntroTextGap();
    running = false;
  }

  function scheduleUpdate() {
    if (document.documentElement.classList.contains("nearby-tablet-expanded")) return;
    if (running) return;
    running = true;
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(updateAll);
  }

  function init() {
    BLOCKS.forEach((config) => {
      const root = document.querySelector(config.root);
      if (root) root.setAttribute("data-adaptive-block", "");
    });

    scheduleUpdate();
    window.addEventListener("resize", debounce(scheduleUpdate, 120), { passive: true });
    window.addEventListener("orientationchange", debounce(scheduleUpdate, 160), {
      passive: true,
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(scheduleUpdate).catch(() => {});
    }

    const observer = new ResizeObserver(debounce(scheduleUpdate, 120));
    observer.observe(document.documentElement);

    BLOCKS.forEach((config) => {
      const root = document.querySelector(config.root);
      if (root) observer.observe(root);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
