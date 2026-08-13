import crypto from "node:crypto";
import { checkRateLimit } from "./rate-limit.js";
import { getClientIp } from "./utils.js";

const BLOCKED_PATH_RE =
  /(?:^|\/)(?:server|node_modules|\.git)(?:\/|$)|config\.local|\.env|package-lock\.json/i;

/** Подпись cookie журнала (без хранения сессий на сервере). */
export function createJournalCookieValue(password) {
  if (!password) return "";
  return crypto.createHmac("sha256", password).update("kozhevnya-journal-v1").digest("hex");
}

export function isJournalCookieValid(cookieValue, password) {
  const expected = createJournalCookieValue(password);
  if (!expected || !cookieValue || typeof cookieValue !== "string") return false;
  if (cookieValue.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cookieValue), Buffer.from(expected));
}

export function safeStringEqual(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function registerSecurityMiddleware(app, config) {
  app.disable("x-powered-by");
  app.set("trust proxy", config.trust_proxy ? 1 : false);

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );
    if (config.force_https) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  app.use((req, res, next) => {
    const raw = req.path || req.url || "";
    if (BLOCKED_PATH_RE.test(raw)) {
      return res.status(404).end();
    }
    next();
  });

  const globalLimit = Number(config.global_api_rate_per_minute) || 120;
  if (globalLimit > 0) {
    app.use("/api", (req, res, next) => {
      const ip = getClientIp(req, Boolean(config.trust_proxy));
      if (!checkRateLimit(config.rate_limit_dir, ip, globalLimit, "global-api", 60)) {
        return res.status(429).json({ ok: false, error: "Слишком много запросов" });
      }
      next();
    });
  }

  const timeoutMs = Number(config.request_timeout_ms) || 30000;
  app.use((req, res, next) => {
    req.setTimeout(timeoutMs);
    res.setTimeout(timeoutMs);
    next();
  });
}

export function isSameOriginRequest(req) {
  const host = req.headers.host;
  if (!host) return false;

  const origin = req.headers.origin;
  if (origin) {
    try {
      const o = new URL(origin);
      return o.host === host;
    } catch {
      return false;
    }
  }

  const referer = req.headers.referer;
  if (referer) {
    try {
      const r = new URL(referer);
      return r.host === host;
    } catch {
      return false;
    }
  }

  return false;
}
