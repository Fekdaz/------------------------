/**
 * Точка входа Passenger (Beget).
 * Слушает синхронно: Passenger не ждёт async/await до app.listen('passenger').
 */
import { buildApp, verifySmtpOnStart } from "./app.js";
import fs from "node:fs";
import path from "node:path";
import { getAppRoot } from "./lib/app-root.js";

const logPath = path.join(getAppRoot(), "tmp", "passenger-debug.log");

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${line}\n`);
  } catch {
    /* ignore */
  }
  console.error(line);
}

try {
  log("bootstrap start");
  log(`cwd=${process.cwd()}`);
  log(`root=${getAppRoot()}`);
  log(`node=${process.version}`);
  log(`PhusionPassenger=${typeof globalThis.PhusionPassenger}`);

  const passenger = globalThis.PhusionPassenger;
  if (typeof passenger !== "undefined") {
    passenger.configure({ autoInstall: false });
  }

  const app = buildApp();
  log("app ready");

  const listenTarget =
    typeof passenger !== "undefined"
      ? "passenger"
      : Number(process.env.PORT) || 8080;

  app.listen(listenTarget);
  log(`listen called: ${String(listenTarget)}`);

  verifySmtpOnStart().catch((error) => {
    log(`smtp verify: ${error?.message || error}`);
  });
} catch (error) {
  log(`FATAL: ${error?.stack || error}`);
  process.exit(1);
}
