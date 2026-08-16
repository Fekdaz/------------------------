import {
  applyCors,
  getClientIp,
  json,
  sanitizeText,
} from "../lib/utils.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { createCaptchaChallenge, validateCaptcha } from "../lib/captcha.js";
import { logConsentAudit } from "../lib/consent-audit.js";
import { buildLeadEmailBody, sendLeadEmail } from "../lib/lead-email.js";
import { formatSmtpError } from "../lib/smtp-transport.js";

function registerCorsPost(app, path, allowedOrigins, corsOptions) {
  app.options(path, (req, res) => {
    if (!applyCors(req, res, allowedOrigins, corsOptions)) return json(res, 403, { ok: false });
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
  });
}

export function registerApiRoutes(app, config) {
  const allowedOrigins = config.allowed_origins || [];
  const corsOptions = { allowLocalhostAnyPort: Boolean(config.allow_localhost_any_port) };
  const trustProxy = Boolean(config.trust_proxy);

  registerCorsPost(app, "/api/send-lead", allowedOrigins, corsOptions);
  registerCorsPost(app, "/api/log-consent", allowedOrigins, corsOptions);

  app.get("/api/captcha-challenge", (req, res) => {
    if (!applyCors(req, res, allowedOrigins, corsOptions)) return json(res, 403, { ok: false });

    const ip = getClientIp(req, trustProxy);
    if (
      !checkRateLimit(
        config.rate_limit_dir,
        ip,
        Number(config.captcha_rate_per_hour) || 60,
        "captcha",
      )
    ) {
      return json(res, 429, { ok: false, error: "Слишком много запросов" });
    }

    try {
      const challenge = createCaptchaChallenge(config);
      if (challenge.type === "smart") {
        json(res, 200, { ok: true, type: "smart" });
        return;
      }
      json(res, 200, { ok: true, id: challenge.id, type: "invisible" });
    } catch {
      json(res, 503, { ok: false, error: "Не удалось создать капчу" });
    }
  });

  app.post("/api/log-consent", (req, res) => {
    if (!applyCors(req, res, allowedOrigins, corsOptions)) return json(res, 403, { ok: false });

    const ip = getClientIp(req, trustProxy);
    if (
      !checkRateLimit(config.rate_limit_dir, ip, config.consent_log_rate_per_hour, "consent-log")
    ) {
      return json(res, 429, { ok: false, error: "Слишком много запросов" });
    }

    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      return json(res, 400, { ok: false, error: "Некорректный JSON" });
    }

    const allowedTypes = ["cookie", "personal_data", "marketing"];
    const type = sanitizeText(payload.type, 40);
    if (!allowedTypes.includes(type)) {
      return json(res, 422, { ok: false, error: "Некорректный тип согласия" });
    }

    const entry = {
      type,
      loggedAt: new Date().toISOString(),
      at: sanitizeText(payload.at, 64),
      ip,
      accepted: Boolean(payload.accepted),
      documentVersion: sanitizeText(payload.documentVersion, 32),
      documentPath: sanitizeText(payload.documentPath, 120),
      formId: sanitizeText(payload.formId, 64),
      pageUrl: sanitizeText(payload.pageUrl, 500),
      userAgent: sanitizeText(payload.userAgent, 300),
    };

    if (payload.cookieChoices && typeof payload.cookieChoices === "object") {
      entry.cookieChoices = {
        essential: true,
        analytics: Boolean(payload.cookieChoices.analytics),
        marketing: Boolean(payload.cookieChoices.marketing),
      };
    }

    if (payload.analytics !== undefined) entry.analytics = Boolean(payload.analytics);
    if (payload.marketing !== undefined && type === "cookie") {
      entry.marketing = Boolean(payload.marketing);
    }

    logConsentAudit(config, entry);
    json(res, 200, { ok: true });
  });

  app.post("/api/send-lead", async (req, res) => {
    if (!applyCors(req, res, allowedOrigins, corsOptions)) return json(res, 403, { ok: false });

    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      return json(res, 400, { ok: false, error: "Некорректный JSON" });
    }

    const honeypot = sanitizeText(payload.website, 200);
    if (honeypot) return json(res, 200, { ok: true });

    const ip = getClientIp(req, trustProxy);

    try {
      const captchaOk = await validateCaptcha(config, payload, ip);
      if (!captchaOk) {
        return json(res, 422, { ok: false, error: "Подтвердите, что вы не робот" });
      }
    } catch {
      return json(res, 422, { ok: false, error: "Подтвердите, что вы не робот" });
    }

    const values = payload.values || {};
    const name = sanitizeText(values.name, 120);
    const phone = sanitizeText(values.phone, 40);
    const email = sanitizeText(values.email, 200);
    const company = sanitizeText(values.company, 200);
    const comment = sanitizeText(values.comment, 2000);
    const page = sanitizeText(payload.page, 500);
    const submittedAt = sanitizeText(payload.submittedAt, 64);
    const marketingConsent = Boolean(payload.marketingConsent);
    const consent = payload.consent || {};

    if (!name || !phone) {
      return json(res, 422, { ok: false, error: "Укажите имя и телефон" });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 422, { ok: false, error: "Укажите корректный email" });
    }

    if (!checkRateLimit(config.rate_limit_dir, ip, config.rate_limit_per_hour, "leads")) {
      return json(res, 429, { ok: false, error: "Слишком много заявок. Попробуйте позже." });
    }

    const text = buildLeadEmailBody(
      company,
      name,
      phone,
      email,
      comment,
      page,
      payload,
      marketingConsent,
    );

    logConsentAudit(config, {
      type: "lead_submission",
      loggedAt: new Date().toISOString(),
      submittedAt,
      ip,
      page,
      formId: sanitizeText(payload.formId, 64),
      name,
      phone,
      email,
      company,
      marketingConsent,
      consent,
    });

    const subject = "Заявка с сайта Kozhevnya - " + name;

    try {
      const sent = await sendLeadEmail(config, subject, text);
      if (!sent) {
        return json(res, 502, {
          ok: false,
          error: "Не удалось отправить письмо. Проверьте SMTP-настройки.",
        });
      }
    } catch (error) {
      console.error("[send-lead]", error);
      return json(res, 502, {
        ok: false,
        error: formatSmtpError(error),
      });
    }

    json(res, 200, { ok: true });
  });
}
