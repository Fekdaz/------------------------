(function () {
  var STORAGE_KEY = "cookie_consent_v2";
  var LEGACY_KEY = "cookie_consent";
  var POLICY_VERSION = window.KOZHEVNYA_LEGAL
    ? window.KOZHEVNYA_LEGAL.cookiePolicyVersion
    : "1.0";
  var POLICY_PATH = window.ConsentLog
    ? window.ConsentLog.paths.cookie
    : "cookie-policy.html";

  function getPreferences() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function logConsent(record) {
    if (!window.ConsentLog) return null;

    return window.ConsentLog.log({
      type: "cookie",
      accepted: record.accepted,
      documentVersion: POLICY_VERSION,
      documentPath: POLICY_PATH,
      cookieChoices: {
        essential: true,
        analytics: record.analytics,
        marketing: record.marketing,
      },
    });
  }

  function savePreferences(analytics, marketing) {
    var prefs = {
      version: POLICY_VERSION,
      essential: true,
      analytics: analytics,
      marketing: marketing,
      at: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    localStorage.removeItem(LEGACY_KEY);
    return prefs;
  }

  function migrateLegacyConsent() {
    if (getPreferences()) return;

    var legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return;

    savePreferences(legacy === "all", legacy === "all");
  }

  function hasConsentChoice() {
    migrateLegacyConsent();
    return getPreferences() !== null;
  }

  var bannerEl = null;
  var showSettings = false;
  var analyticsEnabled = false;
  var marketingEnabled = false;

  function loadFormValues() {
    var prefs = getPreferences();
    if (prefs) {
      analyticsEnabled = !!prefs.analytics;
      marketingEnabled = !!prefs.marketing;
      return;
    }

    analyticsEnabled = false;
    marketingEnabled = false;
  }

  function hideBanner() {
    if (bannerEl) bannerEl.hidden = true;
  }

  function applyPreferences(analytics, marketing, accepted) {
    savePreferences(analytics, marketing);
    logConsent({
      accepted: accepted,
      analytics: analytics,
      marketing: marketing,
    });
    hideBanner();
    if (typeof window.syncThirdPartyScripts === "function") {
      window.syncThirdPartyScripts();
    }
  }

  function renderBanner() {
    if (!bannerEl) return;

    if (!showSettings) {
      bannerEl.innerHTML =
        '<div class="cookie-banner__inner cookie-banner__inner--compact">' +
        '<p class="cookie-banner__text">' +
        "Сайт использует cookie. Обязательные cookie нужны для работы сайта и сохранения вашего выбора. " +
        "Аналитические и маркетинговые cookie устанавливаются только после вашего отдельного согласия " +
        "(ст.&nbsp;9&nbsp;152-ФЗ). Отказ от необязательных cookie — в «Настроить». " +
        "Продолжение просмотра без выбора не означает согласие. " +
        '<a href="' +
        POLICY_PATH +
        '">Подробнее</a></p>' +
        '<div class="cookie-banner__actions">' +
        '<button type="button" class="cookie-banner__btn cookie-banner__btn--primary" data-action="accept-all">Принять все</button>' +
        '<button type="button" class="cookie-banner__btn cookie-banner__btn--secondary" data-action="open-settings">Настроить</button>' +
        "</div></div>";
      return;
    }

    bannerEl.innerHTML =
      '<div class="cookie-banner__inner cookie-banner__inner--settings">' +
      '<div class="cookie-banner__settings-head">' +
      '<p class="cookie-banner__settings-title">Настройки cookie</p>' +
      '<button type="button" class="cookie-banner__btn cookie-banner__btn--ghost" data-action="close-settings">Назад</button>' +
      "</div>" +
      '<p class="cookie-banner__note">' +
      "Обязательные cookie нельзя отключить: без них сайт не сможет сохранить ваш выбор. " +
      "Остальные категории включаются только по вашему решению." +
      "</p>" +
      '<div class="cookie-banner__settings-toolbar">' +
      '<div class="cookie-banner__settings">' +
      '<label class="cookie-banner__option"><span>Обязательные</span><input type="checkbox" checked disabled aria-label="Обязательные cookie всегда включены" /></label>' +
      '<label class="cookie-banner__option"><span>Аналитика</span><input type="checkbox" data-field="analytics"' +
      (analyticsEnabled ? " checked" : "") +
      " /></label>" +
      '<label class="cookie-banner__option"><span>Маркетинг</span><input type="checkbox" data-field="marketing"' +
      (marketingEnabled ? " checked" : "") +
      " /></label>" +
      "</div>" +
      '<div class="cookie-banner__actions">' +
      '<button type="button" class="cookie-banner__btn cookie-banner__btn--ghost" data-action="essential-only">Только необходимые</button>' +
      '<button type="button" class="cookie-banner__btn cookie-banner__btn--primary" data-action="save-settings">Сохранить выбор</button>' +
      "</div></div></div>";
  }

  function ensureBanner() {
    if (bannerEl) return bannerEl;

    bannerEl = document.createElement("div");
    bannerEl.className = "cookie-banner";
    bannerEl.setAttribute("role", "dialog");
    bannerEl.setAttribute("aria-label", "Согласие на использование cookie");
    bannerEl.setAttribute("aria-live", "polite");
    bannerEl.hidden = true;
    document.body.appendChild(bannerEl);

    bannerEl.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;

      var action = target.getAttribute("data-action");
      if (!action) return;

      if (action === "accept-all") {
        applyPreferences(true, true, true);
        return;
      }

      if (action === "essential-only") {
        applyPreferences(false, false, false);
        return;
      }

      if (action === "open-settings") {
        loadFormValues();
        showSettings = true;
        renderBanner();
        return;
      }

      if (action === "close-settings") {
        showSettings = false;
        renderBanner();
        return;
      }

      if (action === "save-settings") {
        var analyticsInput = bannerEl.querySelector('[data-field="analytics"]');
        var marketingInput = bannerEl.querySelector('[data-field="marketing"]');
        var analytics =
          analyticsInput instanceof HTMLInputElement ? analyticsInput.checked : false;
        var marketing =
          marketingInput instanceof HTMLInputElement ? marketingInput.checked : false;
        applyPreferences(analytics, marketing, analytics || marketing);
      }
    });

    return bannerEl;
  }

  function openCookieSettings() {
    loadFormValues();
    showSettings = true;
    ensureBanner();
    renderBanner();
    bannerEl.hidden = false;
  }

  function initCookieBanner() {
    ensureBanner();

    if (!hasConsentChoice()) {
      loadFormValues();
      showSettings = false;
      renderBanner();
      bannerEl.hidden = false;
    } else if (typeof window.syncThirdPartyScripts === "function") {
      window.syncThirdPartyScripts();
    }

    document.querySelectorAll(".js-open-cookie-settings").forEach(function (trigger) {
      trigger.addEventListener("click", function (event) {
        event.preventDefault();
        openCookieSettings();
      });
    });
  }

  window.openCookieSettings = openCookieSettings;
  window.getCookiePreferences = getPreferences;
  window.isAnalyticsCookiesAllowed = function () {
    migrateLegacyConsent();
    var prefs = getPreferences();
    return prefs ? !!prefs.analytics : false;
  };
  window.isMarketingCookiesAllowed = function () {
    migrateLegacyConsent();
    var prefs = getPreferences();
    return prefs ? !!prefs.marketing : false;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCookieBanner);
  } else {
    initCookieBanner();
  }
})();
