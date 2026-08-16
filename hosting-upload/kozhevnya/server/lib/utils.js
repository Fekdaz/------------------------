export function sanitizeText(value, maxLength) {
  const text = String(value ?? "")
    .trim()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

export function getClientIp(req, trustProxy = false) {
  const candidates = trustProxy
    ? [req.headers["cf-connecting-ip"], req.headers["x-forwarded-for"], req.socket?.remoteAddress]
    : [req.socket?.remoteAddress];

  for (const value of candidates) {
    if (!value) continue;
    const ip = String(value).split(",")[0].trim();
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.includes(":")) {
      return ip;
    }
  }

  return "0.0.0.0";
}

export function isOriginAllowed(origin, allowedOrigins, options = {}) {
  if (!origin) return true;
  const normalized = origin.toLowerCase();

  if (allowedOrigins.some((allowed) => String(allowed).toLowerCase() === normalized)) {
    return true;
  }

  if (!options.allowLocalhostAnyPort) return false;

  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function applyCors(req, res, allowedOrigins, corsOptions = {}) {
  const origin = req.headers.origin || "";
  if (origin && !isOriginAllowed(origin, allowedOrigins, corsOptions)) {
    return false;
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  return true;
}

export function json(res, status, payload) {
  res.status(status).json(payload);
}

export function formatSubmittedAt(iso) {
  if (!iso) return "-";
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
