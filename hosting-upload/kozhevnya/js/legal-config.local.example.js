/**
 * Локальные настройки для продакшена (не коммитить).
 * 1. Скопируйте в legal-config.local.js
 * 2. Подставьте ID счётчика Яндекс.Метрики
 */
window.KOZHEVNYA_CONFIG = Object.assign({}, window.KOZHEVNYA_CONFIG || {}, {
  leadWebhookUrl: "/api/send-lead",
  yandexMetrikaCounterId: 00000000,
  yandexMapsApiKey: "YOUR_YANDEX_MAPS_API_KEY",
  yandexSmartCaptchaClientKey: null,
});
