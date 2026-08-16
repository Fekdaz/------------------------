(function () {
  var initialized = false;

  /** Маркетинговые пиксели - загружаются только после согласия на маркетинговые cookie */
  function initMarketingTags() {
    if (initialized) return;
    if (typeof window.isMarketingCookiesAllowed === "function" && !window.isMarketingCookiesAllowed()) {
      return;
    }

    initialized = true;

    // Добавьте код инициализации рекламных пикселей здесь при подключении.
  }

  window.KozhevnyaMarketing = {
    init: initMarketingTags,
  };
})();
