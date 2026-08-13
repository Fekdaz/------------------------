import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export function checkRateLimit(dir, ip, limit, namespace, windowSeconds = 3600) {
  if (limit <= 0) return true;

  const bucketDir = path.join(dir, namespace);
  ensureDir(bucketDir);

  const file = path.join(bucketDir, crypto.createHash("sha256").update(ip).digest("hex") + ".json");
  const now = Date.now();
  const windowMs = Math.max(1, Number(windowSeconds) || 3600) * 1000;
  const windowStart = now - windowMs;
  let entries = [];

  if (fs.existsSync(file)) {
    try {
      const decoded = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(decoded)) {
        entries = decoded.filter((t) => Number.isInteger(t) && t >= windowStart);
      }
    } catch {
      entries = [];
    }
  }

  if (entries.length >= limit) return false;

  entries.push(now);
  fs.writeFileSync(file, JSON.stringify(entries), { mode: 0o600 });
  return true;
}
