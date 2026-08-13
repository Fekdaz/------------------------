import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export function createInvisibleChallenge(config) {
  const dir = config.captcha_dir;
  ensureDir(dir);

  const id = crypto.randomBytes(16).toString("hex");
  const createdAt = Date.now();
  const expiresAt = createdAt + 600 * 1000;

  fs.writeFileSync(
    path.join(dir, id + ".json"),
    JSON.stringify({ type: "invisible", createdAt, expires: expiresAt }),
    { mode: 0o600 },
  );

  return { id, type: "invisible" };
}

export function createCheckboxChallenge(config) {
  const dir = config.captcha_dir;
  ensureDir(dir);

  const id = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + 600 * 1000;

  fs.writeFileSync(
    path.join(dir, id + ".json"),
    JSON.stringify({ type: "checkbox", expires: expiresAt }),
    { mode: 0o600 },
  );

  return { id, type: "checkbox" };
}

export function createMathChallenge(config) {
  const dir = config.captcha_dir;
  ensureDir(dir);

  const a = crypto.randomInt(2, 10);
  const b = crypto.randomInt(2, 10);
  const id = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + 600 * 1000;

  fs.writeFileSync(
    path.join(dir, id + ".json"),
    JSON.stringify({ answer: a + b, expires: expiresAt }),
    { mode: 0o600 },
  );

  return { id, question: `${a} + ${b}` };
}

export function validateInvisibleCaptcha(config, id) {
  const cleanId = String(id || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
  if (cleanId.length !== 32) return false;

  const file = path.join(config.captcha_dir, cleanId + ".json");
  if (!fs.existsSync(file)) return false;

  let decoded;
  try {
    decoded = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return false;
  }

  try {
    fs.unlinkSync(file);
  } catch {
    /* ignore */
  }

  if (!decoded || decoded.expires < Date.now()) return false;
  if (decoded.type !== "invisible") return false;

  const createdAt = Number(decoded.createdAt) || 0;
  const minDelayMs = Number(config.captcha_invisible_min_ms) || 2000;
  return Date.now() - createdAt >= minDelayMs;
}

export function validateCheckboxCaptcha(config, id, confirmed) {
  if (!confirmed) return false;

  const cleanId = String(id || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
  if (cleanId.length !== 32) return false;

  const file = path.join(config.captcha_dir, cleanId + ".json");
  if (!fs.existsSync(file)) return false;

  let decoded;
  try {
    decoded = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return false;
  }

  try {
    fs.unlinkSync(file);
  } catch {
    /* ignore */
  }

  if (!decoded || decoded.expires < Date.now()) return false;
  return decoded.type === "checkbox";
}

export function validateMathCaptcha(config, id, answer) {
  const cleanId = String(id || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
  if (cleanId.length !== 32) return false;

  const numericAnswer = String(answer || "").trim();
  if (!numericAnswer || !/^\d+$/.test(numericAnswer)) return false;

  const file = path.join(config.captcha_dir, cleanId + ".json");
  if (!fs.existsSync(file)) return false;

  let decoded;
  try {
    decoded = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return false;
  }

  try {
    fs.unlinkSync(file);
  } catch {
    /* ignore */
  }

  if (!decoded || decoded.expires < Date.now()) return false;
  return Number(numericAnswer) === Number(decoded.answer);
}

export async function validateSmartCaptcha(config, token, ip) {
  const secret = String(config.yandex_smart_captcha_secret || "").trim();
  if (!secret || !token) return false;

  const body = new URLSearchParams({
    secret,
    token: String(token),
    ip: String(ip),
  });

  const response = await fetch("https://smartcaptcha.cloud.yandex.ru/validate", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(4000),
  });

  if (!response.ok) return false;
  const data = await response.json();
  return data?.status === "ok";
}

export function createCaptchaChallenge(config) {
  const secret = String(config.yandex_smart_captcha_secret || "").trim();
  if (secret) {
    return { type: "smart" };
  }
  return createInvisibleChallenge(config);
}

export async function validateCaptcha(config, payload, ip) {
  const secret = String(config.yandex_smart_captcha_secret || "").trim();
  if (secret) {
    return validateSmartCaptcha(config, payload.captchaToken, ip);
  }

  return validateInvisibleCaptcha(config, payload.captchaId);
}
