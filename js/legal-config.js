/** Версии юридических документов - увеличивайте при изменении текста на сайте */
window.KOZHEVNYA_LEGAL = {
  privacyPolicyVersion: "1.2",
  personalDataConsentVersion: "1.1",
  marketingConsentVersion: "1.1",
  cookiePolicyVersion: "1.2",
  updatedAt: "13.08.2026",
};

/** Настройки интеграций (переопределяются в legal-config.local.js на сервере) */
window.KOZHEVNYA_CONFIG = {
  /** POST JSON на /api/send-lead */
  leadWebhookUrl: "/api/send-lead",
  /** ID счётчика Яндекс.Метрики - загружается только после согласия на аналитику */
  yandexMetrikaCounterId: 111570108,
  /** Цели в интерфейсе Метрики (Настройки → Цели) */
  yandexMetrikaGoals: {
    leadFormOpen: "lead_form_open",
    leadFormSubmit: "lead_form_submit",
  },
  /** Координаты производства: [широта, долгота] */
  locationCoords: [55.71232, 37.905896],
  locationAddress:
    "109383, г. Москва, 1-й Красковский проезд, 38А, стр. 40, м. «Лухмановская»",
  /** Ключ API Яндекс.Карт (developer.tech.yandex.ru). Без ключа - виджет iframe */
  yandexMapsApiKey: null,
  /**
   * Клиентский ключ Яндекс SmartCaptcha (console.yandex.cloud).
   * invisible: проверка при отправке, без галочки в форме.
   * Если null - серверная невидимая проверка (токен + антибот).
   */
  yandexSmartCaptchaClientKey: null,
};
