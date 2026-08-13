import fs from "node:fs";
import path from "node:path";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export function logConsentAudit(config, entry) {
  const dir = config.consent_log_dir;
  ensureDir(dir);
  const file = path.join(dir, new Date().toISOString().slice(0, 7) + ".jsonl");
  fs.appendFileSync(file, JSON.stringify(entry) + "\n", { mode: 0o600 });
}

export function getConsentEntryTimestamp(entry) {
  for (const key of ["at", "loggedAt", "submittedAt"]) {
    const value = entry[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

export function readConsentJournal(config, month = null, limit = 500) {
  const dir = config.consent_log_dir;
  if (!fs.existsSync(dir)) return [];

  let files = [];
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const filePath = path.join(dir, month + ".jsonl");
    if (fs.existsSync(filePath)) files = [filePath];
  } else {
    files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".jsonl"))
      .sort()
      .reverse()
      .map((name) => path.join(dir, name));
  }

  const entries = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const decoded = JSON.parse(line);
        if (decoded && typeof decoded === "object") entries.push(decoded);
      } catch {
        /* skip bad line */
      }
    }
  }

  entries.sort((a, b) => getConsentEntryTimestamp(b).localeCompare(getConsentEntryTimestamp(a)));
  return limit > 0 ? entries.slice(0, limit) : entries;
}

export function listConsentJournalMonths(config) {
  const dir = config.consent_log_dir;
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .map((name) => name.replace(/\.jsonl$/, ""))
    .filter((name) => /^\d{4}-\d{2}$/.test(name))
    .sort()
    .reverse();
}

export function formatConsentTimestamp(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

const TYPE_LABELS = {
  cookie: "Cookie",
  personal_data: "Согласие на ПДн",
  marketing: "Согласие на рекламу",
  lead_submission: "Заявка с формы",
};

export function formatConsentTypeLabel(entry) {
  const type = String(entry.type || entry.event || "");
  if (type && TYPE_LABELS[type]) return TYPE_LABELS[type];
  if (entry.marketingConsent || entry.name || entry.phone) return "Заявка с формы";
  return type || "—";
}

export function formatConsentDetails(entry) {
  const parts = [];

  if (entry.accepted !== undefined) parts.push("Согласие: " + (entry.accepted ? "да" : "нет"));
  if (entry.marketingConsent !== undefined) {
    parts.push("Реклама: " + (entry.marketingConsent ? "да" : "нет"));
  }
  if (entry.cookieChoices) {
    parts.push("Аналитика: " + (entry.cookieChoices.analytics ? "да" : "нет"));
    parts.push("Маркетинг cookie: " + (entry.cookieChoices.marketing ? "да" : "нет"));
  }
  if (entry.analytics !== undefined) parts.push("Аналитика: " + (entry.analytics ? "да" : "нет"));
  if (entry.marketing !== undefined && entry.marketingConsent === undefined) {
    parts.push("Маркетинг cookie: " + (entry.marketing ? "да" : "нет"));
  }
  if (entry.name) parts.push("Имя: " + entry.name);
  if (entry.phone) parts.push("Телефон: " + entry.phone);
  if (entry.email) parts.push("Email: " + entry.email);
  if (entry.company) parts.push("Компания: " + entry.company);
  if (entry.formId) parts.push("Форма: " + entry.formId);
  if (entry.documentVersion) parts.push("Версия: " + entry.documentVersion);
  if (entry.documentPath) parts.push("Документ: " + entry.documentPath);
  if (entry.pageUrl) parts.push("URL: " + entry.pageUrl);
  else if (entry.page) parts.push("URL: " + entry.page);

  return parts.length ? parts.join("; ") : "—";
}
