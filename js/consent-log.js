(function () {
  var LOG_KEY = "consent_audit_log";
  var SERVER_LOG_URL = "/api/log-consent";

  var PATHS = {
    personal: "personal-data-consent.html",
    marketing: "marketing-consent.html",
    cookie: "cookie-policy.html",
    privacy: "privacy-policy.html",
  };

  function getLegalConfig() {
    return (
      window.KOZHEVNYA_LEGAL || {
        privacyPolicyVersion: "1.0",
        personalDataConsentVersion: "1.0",
        marketingConsentVersion: "1.0",
        cookiePolicyVersion: "1.0",
      }
    );
  }

  function readLog() {
    try {
      var raw = localStorage.getItem(LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      return [];
    }
  }

  function shouldSyncToServer(record) {
    var type = record && record.type;
    return type === "cookie" || type === "personal_data" || type === "marketing";
  }

  function syncConsentToServer(record) {
    if (!shouldSyncToServer(record)) return;

    fetch(SERVER_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      keepalive: true,
    }).catch(function () {
      /* ignore network errors */
    });
  }

  /** Журнал согласий для доказательства факта получения (152-ФЗ, ст. 9) */
  function logConsent(record) {
    var full = Object.assign(
      {
        at: new Date().toISOString(),
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
      },
      record,
    );

    try {
      var log = readLog();
      log.push(full);
      localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-200)));
      localStorage.setItem("consent_" + record.type + "_" + Date.now(), JSON.stringify(full));
    } catch (error) {
      /* ignore storage errors */
    }

    syncConsentToServer(full);

    return full;
  }

  function versions() {
    var legal = getLegalConfig();
    return {
      personal: legal.personalDataConsentVersion,
      marketing: legal.marketingConsentVersion,
      cookie: legal.cookiePolicyVersion,
      privacy: legal.privacyPolicyVersion,
    };
  }

  window.ConsentLog = {
    log: logConsent,
    versions: versions,
    paths: PATHS,
    readLocalLog: readLog,
  };
})();
