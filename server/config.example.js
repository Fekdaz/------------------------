/** Скопируйте в config.local.js и заполните значения. Сервер: npm start (Node.js). */
export default {
  port: 8080,
  port_max_attempts: 20,

  /**
   * Бесплатная отправка заявок по почте (без Telegram):
   * — brevo   : 300 писем/день, https://www.brevo.com (рекомендуется)
   * — gmail   : ~500 писем/день, пароль приложения Google
   * — mailru  : ящик @mail.ru + пароль для внешних приложений
   * — sendgrid: 100 писем/день
   * — yandex  : только если SMTP включён в тарифе
   */
  smtp_provider: "brevo",

  /** Brevo: smtp_user = email регистрации, smtp_pass = SMTP-ключ из SMTP & API → SMTP */
  smtp_user: "ВАШ_EMAIL@example.com",
  smtp_pass: "ВАШ_SMTP_КЛЮЧ",

  from_email: "noreply@kozhevnya.ru",
  from_name: "Сайт Kozhevnya",
  to_email: "info@kozhevnya.ru",

  smtp_connection_timeout_ms: 15000,
  smtp_verify_on_start: true,

  yandex_smart_captcha_secret: "",

  allowed_origins: [
    "https://tennerg.ru",
    "https://www.tennerg.ru",
    "https://kozhevnya.ru",
    "https://www.kozhevnya.ru",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost",
    "http://127.0.0.1",
  ],

  allow_localhost_any_port: true,

  trust_proxy: false,
  force_https: false,

  rate_limit_per_hour: 10,
  consent_log_rate_per_hour: 120,
  captcha_rate_per_hour: 60,
  captcha_invisible_min_ms: 2000,
  global_api_rate_per_minute: 120,
  journal_login_rate_per_hour: 20,
  request_timeout_ms: 30000,

  consent_journal_password: "ЗАДАЙТЕ_ПАРОЛЬ",
};
