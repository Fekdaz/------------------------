import fs from "node:fs";
import path from "node:path";
import example from "./config.example.js";
import { getAppRoot } from "./lib/app-root.js";

let cachedConfig = null;

function loadLocalConfig(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const src = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
  const body = src.replace(/export\s+default\s+/, "").replace(/;\s*$/, "").trim();

  try {
    return Function(`"use strict"; return (${body});`)();
  } catch (error) {
    console.error("config.local.js: не удалось прочитать:", error.message);
    return {};
  }
}

export function getConfig() {
  if (cachedConfig) return cachedConfig;

  const rootDir = getAppRoot();
  const local = loadLocalConfig(path.join(rootDir, "server", "config.local.js"));

  cachedConfig = {
    ...example,
    ...local,
    data_dir: path.join(rootDir, "server", "data"),
    consent_log_dir: path.join(rootDir, "server", "data", "consent-log"),
    captcha_dir: path.join(rootDir, "server", "data", "captcha"),
    rate_limit_dir: path.join(rootDir, "server", "data", "rate-limit"),
  };

  return cachedConfig;
}

export default getConfig;
