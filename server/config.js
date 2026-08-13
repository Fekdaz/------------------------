import path from "node:path";
import { pathToFileURL } from "node:url";
import example from "./config.example.js";

const rootDir = process.cwd();
const localConfigPath = path.join(rootDir, "server", "config.local.js");

let cachedConfig = null;

export async function getConfig() {
  if (cachedConfig) return cachedConfig;

  let local = {};
  try {
    const mod = await import(pathToFileURL(localConfigPath).href);
    local = mod.default || {};
  } catch {
    /* config.local.js optional until first setup */
  }

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
