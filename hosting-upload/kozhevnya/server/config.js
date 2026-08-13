import path from "node:path";
import { fileURLToPath } from "node:url";
import example from "./config.example.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

let local = {};
try {
  const mod = await import("./config.local.js");
  local = mod.default || {};
} catch {
  /* config.local.js optional until first setup */
}

const config = {
  ...example,
  ...local,
  data_dir: path.join(rootDir, "server", "data"),
  consent_log_dir: path.join(rootDir, "server", "data", "consent-log"),
  captcha_dir: path.join(rootDir, "server", "data", "captcha"),
  rate_limit_dir: path.join(rootDir, "server", "data", "rate-limit"),
};

export default config;
