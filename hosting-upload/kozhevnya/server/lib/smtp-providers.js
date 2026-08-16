/**
 * Пресеты бесплатных SMTP-провайдеров.
 * В config.local.js: smtp_provider: "brevo" + smtp_user / smtp_pass.
 */
export const SMTP_PROVIDERS = {
  /** 300 писем/день бесплатно - https://www.brevo.com */
  brevo: {
    smtp_host: "smtp-relay.brevo.com",
    smtp_port: 587,
    smtp_secure: false,
    smtp_require_tls: true,
    smtp_tls_servername: "smtp-relay.brevo.com",
    smtp_connect_host: "",
  },

  /** ~500 писем/день - нужен пароль приложения Google */
  gmail: {
    smtp_host: "smtp.gmail.com",
    smtp_port: 465,
    smtp_secure: true,
    smtp_tls_servername: "smtp.gmail.com",
    smtp_connect_host: "",
  },

  /** Бесплатно для ящиков @mail.ru */
  mailru: {
    smtp_host: "smtp.mail.ru",
    smtp_port: 465,
    smtp_secure: true,
    smtp_tls_servername: "smtp.mail.ru",
    smtp_connect_host: "",
  },

  /** 100 писем/день бесплатно - https://sendgrid.com */
  sendgrid: {
    smtp_host: "smtp.sendgrid.net",
    smtp_port: 587,
    smtp_secure: false,
    smtp_require_tls: true,
    smtp_tls_servername: "smtp.sendgrid.net",
    smtp_connect_host: "",
    smtp_auth_user: "apikey",
  },

  yandex: {
    smtp_host: "smtp.yandex.ru",
    smtp_port: 465,
    smtp_secure: true,
    smtp_connect_host: "77.88.21.158",
    smtp_tls_servername: "smtp.yandex.ru",
  },
};

export function getSmtpSettings(config) {
  const provider = String(config.smtp_provider || "").trim().toLowerCase();
  const preset = SMTP_PROVIDERS[provider] || {};

  return {
    ...config,
    ...preset,
    smtp_user: config.smtp_user ?? preset.smtp_user,
    smtp_pass: config.smtp_pass ?? preset.smtp_pass,
    smtp_auth_user: config.smtp_auth_user ?? preset.smtp_auth_user,
    from_email: config.from_email,
    from_name: config.from_name,
    to_email: config.to_email,
  };
}
