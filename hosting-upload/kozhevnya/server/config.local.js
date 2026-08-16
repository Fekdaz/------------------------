/** Локальная конфигурация (не коммитится в git). */
export default {
  port: 8080,

  /** Яндекс.Почта - пароль приложения (Почта → Безопасность) */
  smtp_provider: "yandex",
  smtp_user: "kozhevnya.ru@yandex.ru",
  smtp_pass: "dhozwfdahmleblfi",

  from_email: "kozhevnya.ru@yandex.ru",
  from_name: "Сайт Кожевня",
  to_email: "info@kozhevnya.ru",

  smtp_connection_timeout_ms: 15000,
  smtp_verify_on_start: true,

  yandex_smart_captcha_secret: "",

  allowed_origins: [
    "https://kozhevnya.ru",
    "https://www.kozhevnya.ru",
    "https://tennerg.ru",
    "https://www.tennrg.ru",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost",
    "http://127.0.0.1",
  ],

  trust_proxy: true,
  force_https: true,

  rate_limit_per_hour: 10,
  consent_log_rate_per_hour: 120,
  consent_journal_password: "kozhevnya2026",
};
