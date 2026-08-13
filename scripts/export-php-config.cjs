const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const root = path.join(__dirname, "..");
const jsPath = path.join(root, "server", "config.local.js");
const outPath = path.join(root, "php", "config.local.php");

function phpEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function toPhp(value, indent) {
  const pad = "  ".repeat(indent);
  const inner = "  ".repeat(indent + 1);

  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return `'${phpEscape(value)}'`;

  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return "[\n" + value.map((item) => `${inner}${toPhp(item, indent + 1)},\n`).join("") + `${pad}]`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (!keys.length) return "[]";
    return "[\n" + keys.map((key) => `${inner}'${phpEscape(key)}' => ${toPhp(value[key], indent + 1)},\n`).join("") + `${pad}]`;
  }

  return "null";
}

async function main() {
  if (!fs.existsSync(jsPath)) {
    console.log("server/config.local.js не найден — php/config.local.php не создан");
    process.exit(0);
  }

  const mod = await import(pathToFileURL(jsPath).href);
  const source = mod.default || {};
  const keep = [
    "smtp_provider",
    "smtp_user",
    "smtp_pass",
    "smtp_host",
    "smtp_port",
    "smtp_secure",
    "from_email",
    "from_name",
    "to_email",
    "smtp_connection_timeout_ms",
    "yandex_smart_captcha_secret",
    "allowed_origins",
    "allow_localhost_any_port",
    "trust_proxy",
    "rate_limit_per_hour",
    "consent_log_rate_per_hour",
    "captcha_rate_per_hour",
    "captcha_invisible_min_ms",
    "global_api_rate_per_minute",
    "journal_login_rate_per_hour",
    "consent_journal_password",
  ];

  const config = {};
  for (const key of keep) {
    if (source[key] !== undefined) config[key] = source[key];
  }

  const php = `<?php\nreturn ${toPhp(config, 0)};\n`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, php);
  console.log("created php/config.local.php");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
