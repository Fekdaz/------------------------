import nodemailer from "nodemailer";
import { getSmtpSettings } from "./smtp-providers.js";

const YANDEX_SMTP_IP = "77.88.21.158";
const YANDEX_SMTP_HOSTS = new Set(["smtp.yandex.ru", "smtp.yandex.com"]);

export function createSmtpTransport(config) {
  const smtp = getSmtpSettings(config);
  const declaredHost = String(smtp.smtp_host || "").trim().toLowerCase();
  const port = Number(smtp.smtp_port) || 465;
  const secure = Boolean(smtp.smtp_secure);
  const requireTls = Boolean(smtp.smtp_require_tls);

  const explicitConnectHost = String(smtp.smtp_connect_host || "").trim();
  const connectHost =
    explicitConnectHost ||
    (YANDEX_SMTP_HOSTS.has(declaredHost) ? YANDEX_SMTP_IP : declaredHost);

  const tlsServername =
    String(smtp.smtp_tls_servername || "").trim() ||
    (connectHost !== declaredHost ? declaredHost : "");

  const authUser = String(smtp.smtp_auth_user || smtp.smtp_user || "").trim();

  const options = {
    host: connectHost,
    port,
    secure,
    requireTLS: requireTls,
    connectionTimeout: Number(smtp.smtp_connection_timeout_ms) || 15000,
    greetingTimeout: Number(smtp.smtp_greeting_timeout_ms) || 15000,
    auth: {
      user: authUser,
      pass: String(smtp.smtp_pass || ""),
    },
  };

  if (tlsServername) {
    options.tls = { servername: tlsServername };
  }

  return nodemailer.createTransport(options);
}

export function formatSmtpError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");

  if (code === "EAUTH" || message.includes("authentication failed")) {
    return "Не удалось авторизоваться на SMTP. Проверьте smtp_user и smtp_pass (для Brevo/Gmail - пароль приложения или SMTP-ключ, не основной пароль).";
  }

  if (
    code === "EDNS" ||
    code === "ETIMEOUT" ||
    message.includes("ETIMEOUT") ||
    message.includes("queryA")
  ) {
    return "Не удалось подключиться к SMTP (таймаут). Проверьте интернет, firewall и smtp_host в config.local.js.";
  }

  return "Не удалось отправить письмо. Проверьте SMTP-настройки в server/config.local.js.";
}

export async function verifySmtpConnection(config) {
  const transporter = createSmtpTransport(config);
  await transporter.verify();
}
