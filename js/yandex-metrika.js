(function () {
  var initialized = false;
  var counterIdCache = null;

  function getConfig() {
    return window.KOZHEVNYA_CONFIG || {};
  }

  function getCounterId() {
    if (counterIdCache !== null) return counterIdCache;

    var raw = getConfig().yandexMetrikaCounterId;
    if (raw === null || raw === undefined || raw === "") {
      counterIdCache = null;
      return null;
    }

    var id = Number(raw);
    counterIdCache = Number.isFinite(id) && id > 0 ? id : null;
    return counterIdCache;
  }

  function getGoals() {
    var goals = getConfig().yandexMetrikaGoals;
    return goals && typeof goals === "object" ? goals : {};
  }

  function injectNoScriptPixel(id) {
    if (document.getElementById("yandex-metrika-noscript")) return;

    var noscript = document.createElement("noscript");
    noscript.id = "yandex-metrika-noscript";
    noscript.innerHTML =
      '<div><img src="https://mc.yandex.ru/watch/' +
      id +
      '" style="position:absolute; left:-9999px;" alt="" /></div>';
    document.body.appendChild(noscript);
  }

  function loadMetrikaScript() {
    if (window.ym) return;

    window.ym = function () {
      (window.ym.a = window.ym.a || []).push(arguments);
    };
    window.ym.a = [];
    window.ym.l = Date.now();

    for (var i = 0; i < document.scripts.length; i++) {
      if (document.scripts[i].src === "https://mc.yandex.ru/metrika/tag.js") return;
    }

    var script = document.createElement("script");
    script.async = true;
    script.src = "https://mc.yandex.ru/metrika/tag.js";
    var first = document.getElementsByTagName("script")[0];
    if (first && first.parentNode) {
      first.parentNode.insertBefore(script, first);
    } else {
      document.head.appendChild(script);
    }
  }

  /** Подключить Яндекс.Метрику (только после согласия на аналитику) */
  function initYandexMetrika() {
    if (initialized) return;

    var counterId = getCounterId();
    if (!counterId) return;

    loadMetrikaScript();
    window.ym(counterId, "init", {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
    });

    injectNoScriptPixel(counterId);
    initialized = true;
  }

  /** Отправить цель (только если есть согласие на аналитику) */
  function reachGoal(goalName, params) {
    if (!goalName || typeof goalName !== "string") return;
    if (typeof window.isAnalyticsCookiesAllowed === "function" && !window.isAnalyticsCookiesAllowed()) {
      return;
    }

    if (!initialized) {
      initYandexMetrika();
    }

    var counterId = getCounterId();
    if (!counterId || typeof window.ym !== "function") return;

    if (params && typeof params === "object") {
      window.ym(counterId, "reachGoal", goalName, params);
    } else {
      window.ym(counterId, "reachGoal", goalName);
    }
  }

  function trackLeadFormOpen() {
    reachGoal(getGoals().leadFormOpen);
  }

  function trackLeadFormSubmit(values) {
    var params =
      values && typeof values === "object"
        ? {
            company: values.company || "",
            has_comment: values.comment ? "yes" : "no",
          }
        : undefined;
    reachGoal(getGoals().leadFormSubmit, params);
  }

  window.KozhevnyaMetrika = {
    init: initYandexMetrika,
    getCounterId: getCounterId,
    reachGoal: reachGoal,
    trackLeadFormOpen: trackLeadFormOpen,
    trackLeadFormSubmit: trackLeadFormSubmit,
  };
})();
