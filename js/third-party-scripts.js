(function () {
  function syncThirdPartyScripts() {
    if (typeof window.isAnalyticsCookiesAllowed === "function" && window.isAnalyticsCookiesAllowed()) {
      if (window.KozhevnyaMetrika) window.KozhevnyaMetrika.init();
    }

    if (typeof window.isMarketingCookiesAllowed === "function" && window.isMarketingCookiesAllowed()) {
      if (window.KozhevnyaMarketing) window.KozhevnyaMarketing.init();
    }
  }

  window.syncThirdPartyScripts = syncThirdPartyScripts;
})();
