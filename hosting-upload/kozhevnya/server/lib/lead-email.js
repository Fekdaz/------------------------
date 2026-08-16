import nodemailer from "nodemailer";
import { formatSubmittedAt, sanitizeText } from "./utils.js";
import { createSmtpTransport } from "./smtp-transport.js";

function consentLogField(record, key) {
  const value = record?.[key];
  return typeof value === "string" && value ? value : "-";
}

export function buildConsentSection(payload, marketingConsent) {
  const consent = payload.consent || {};
  const submittedAt = sanitizeText(payload.submittedAt, 64);
  const privacyVersion = sanitizeText(consent.privacyPolicyVersion, 32);
  const personal = consent.personal || {};
  const marketing = consent.marketing || {};

  const lines = [
    "--- Согласия ---",
    "Время отправки: " + formatSubmittedAt(submittedAt),
    "",
    "Согласие на обработку персональных данных: да (обязательное)",
    "Версия документа: " + consentLogField(personal, "documentVersion"),
    "Документ: " + consentLogField(personal, "documentPath"),
    "Версия политики ПДн: " + (privacyVersion || "-"),
  ];

  if (marketingConsent) {
    lines.push("", "Согласие на рекламу: да");
    lines.push("Версия документа: " + consentLogField(marketing, "documentVersion"));
    lines.push("Документ: " + consentLogField(marketing, "documentPath"));
    lines.push("Текст: согласие на получение информационных и рекламных сообщений");
    lines.push("(marketing-consent.html)");
  } else {
    lines.push("", "Согласие на рекламу: нет");
  }

  return lines.join("\n");
}

export function buildLeadEmailBody(company, name, phone, email, comment, page, payload, marketingConsent) {
  return [
    "Новая заявка с сайта kozhevnya.ru",
    "",
    "Компания: " + (company || "-"),
    "Имя: " + name,
    "Телефон: " + phone,
    "Email: " + (email || "-"),
    "Комментарий: " + (comment || "-"),
    "Страница: " + (page || "-"),
    "",
    buildConsentSection(payload, marketingConsent),
  ].join("\n");
}

export async function sendLeadEmail(config, subject, body) {
  const toList = String(config.to_email || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!toList.length) return false;

  const transporter = createSmtpTransport(config);

  for (const to of toList) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;
  }

  for (const to of toList) {
    await transporter.sendMail({
      from: `"${config.from_name}" <${config.from_email}>`,
      to,
      subject,
      text: body,
    });
  }

  return true;
}
