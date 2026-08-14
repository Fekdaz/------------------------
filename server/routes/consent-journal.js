import {
  formatConsentDetails,
  formatConsentMonthLabel,
  formatConsentTimestamp,
  formatConsentTypeLabel,
  getConsentEntryTimestamp,
  listConsentJournalMonths,
  readConsentJournal,
} from "../lib/consent-audit.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import {
  createJournalCookieValue,
  isJournalCookieValid,
  isSameOriginRequest,
  safeStringEqual,
} from "../lib/security.js";
import { getClientIp } from "../lib/utils.js";

const AUTH_COOKIE = "kozhevnya_journal_auth";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildAuthCookie(value, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${AUTH_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Strict${secure}`;
}

function isAuthenticated(req, config) {
  const password = String(config.consent_journal_password || "");
  if (!password) return false;
  return isJournalCookieValid(req.cookies?.[AUTH_COOKIE], password);
}

export function registerConsentJournalRoutes(app, config) {
  const journalPath = "/api/consent-journal";

  app.get(journalPath, (req, res) => {
    const password = String(config.consent_journal_password || "");
    if (!password) {
      res.status(503).send("Журнал не настроен: задайте consent_journal_password в server/config.local.js");
      return;
    }

    const selectedMonth =
      req.query.month && /^\d{4}-\d{2}$/.test(String(req.query.month))
        ? String(req.query.month)
        : null;

    const months = listConsentJournalMonths(config);
    const entries = isAuthenticated(req, config)
      ? readConsentJournal(config, selectedMonth, 500)
      : [];

    const loginError = req.query.error === "1" ? "Неверный пароль" : "";

    res.type("html").send(renderJournalPage({
      months,
      entries,
      selectedMonth,
      isAuthenticated: isAuthenticated(req, config),
      loginError,
    }));
  });

  app.post(journalPath, (req, res) => {
    const password = String(config.consent_journal_password || "");
    if (!password) {
      res.status(503).send("Журнал не настроен");
      return;
    }

    if (!isSameOriginRequest(req)) {
      res.status(403).send("Запрос отклонён");
      return;
    }

    if (req.body?.logout) {
      res.setHeader("Set-Cookie", buildAuthCookie("", 0));
      res.redirect(journalPath);
      return;
    }

    const ip = getClientIp(req, Boolean(config.trust_proxy));
    const loginLimit = Number(config.journal_login_rate_per_hour) || 20;
    if (!checkRateLimit(config.rate_limit_dir, ip, loginLimit, "journal-login")) {
      res.redirect(journalPath + "?error=1");
      return;
    }

    const submitted = String(req.body?.password || "");
    if (submitted && safeStringEqual(submitted, password)) {
      const token = createJournalCookieValue(password);
      res.setHeader("Set-Cookie", buildAuthCookie(token, 86400));
      res.redirect(journalPath);
      return;
    }

    res.redirect(journalPath + "?error=1");
  });
}

function renderJournalPage({ months, entries, selectedMonth, isAuthenticated, loginError }) {
  const monthOptions = months
    .map((month) => {
      const selected = selectedMonth === month ? " selected" : "";
      return `<option value="${escapeHtml(month)}"${selected}>${escapeHtml(formatConsentMonthLabel(month))}</option>`;
    })
    .join("");

  const rows = entries
    .map((entry) => {
      return `<tr>
        <td>${escapeHtml(formatConsentTimestamp(getConsentEntryTimestamp(entry)))}</td>
        <td>${escapeHtml(formatConsentTypeLabel(entry))}</td>
        <td>${escapeHtml(String(entry.documentVersion || "—"))}</td>
        <td>${escapeHtml(String(entry.ip || "—"))}</td>
        <td class="details">${escapeHtml(formatConsentDetails(entry))}</td>
      </tr>`;
    })
    .join("");

  const authBlock = isAuthenticated
    ? `<div class="panel toolbar">
        <form method="get">
          <label for="month">Месяц</label>
          <select id="month" name="month" onchange="this.form.submit()">
            <option value="">Все месяцы</option>
            ${monthOptions}
          </select>
        </form>
        <form method="post">
          <input type="hidden" name="logout" value="1" />
          <button type="submit" class="secondary">Выйти</button>
        </form>
      </div>
      <div class="panel">
        ${entries.length ? `<table>
          <thead>
            <tr>
              <th>Время (МСК)</th>
              <th>Тип</th>
              <th>Версия</th>
              <th>IP</th>
              <th>Детали</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>` : `<p class="empty">Записей нет. Согласия появятся после действий на сайте.</p>`}
      </div>`
    : `<div class="panel">
        <form method="post">
          <label for="password">Пароль для входа</label>
          <input id="password" name="password" type="password" required autocomplete="current-password" />
          ${loginError ? `<p class="error">${escapeHtml(loginError)}</p>` : ""}
          <button type="submit">Войти</button>
        </form>
      </div>`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Журнал согласий | Кожевня</title>
  <link rel="icon" href="/assets/32.png" type="image/png" sizes="32x32" />
  <link rel="icon" href="/assets/16.png" type="image/png" sizes="16x16" />
  <link rel="icon" href="/assets/48.png" type="image/png" sizes="48x48" />
  <link rel="icon" href="/assets/64.png" type="image/png" sizes="64x64" />
  <link rel="icon" href="/assets/192.png" type="image/png" sizes="192x192" />
  <link rel="icon" href="/assets/512.png" type="image/png" sizes="512x512" />
  <link rel="apple-touch-icon" href="/assets/192.png" sizes="192x192" />
  <link rel="manifest" href="/site.webmanifest" />
  <style>
    :root { color-scheme: light; font-family: Manrope, system-ui, sans-serif; background: #f6f1ea; color: #2a1f18; }
    body { margin: 0; padding: 24px; }
    .wrap { max-width: 1100px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .meta { margin: 0 0 20px; color: #6a5648; font-size: 14px; }
    .panel { background: #fff; border: 1px solid #ddd2c6; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; font-size: 14px; }
    input[type="password"], select { width: 100%; max-width: 320px; padding: 10px 12px; border: 1px solid #ccc2b8; border-radius: 8px; font: inherit; }
    button, .btn { display: inline-block; margin-top: 12px; padding: 10px 16px; border: 0; border-radius: 8px; background: #7aad68; color: #fff; font: inherit; cursor: pointer; }
    button.secondary { background: #8a7565; }
    .error { color: #b42318; margin-top: 8px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #eadfce; padding: 10px 8px; vertical-align: top; text-align: left; }
    th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #6a5648; }
    .details { max-width: 420px; word-break: break-word; }
    .empty { padding: 24px; text-align: center; color: #6a5648; }
    .toolbar { display: flex; gap: 12px; align-items: end; flex-wrap: wrap; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Журнал согласий</h1>
    <p class="meta">Серверный аудит согласий (152-ФЗ, ст. 9). Файлы: server/data/consent-log/</p>
    ${authBlock}
  </div>
</body>
</html>`;
}