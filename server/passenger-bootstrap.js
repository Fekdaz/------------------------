import fs from "node:fs";
import path from "node:path";
import { buildApp, verifySmtpOnStart } from "./app.js";

const logPath = path.join(process.cwd(), "tmp", "passenger-debug.log");

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

async function start() {
  log("bootstrap start");

  const app = await buildApp();
  log("app ready");

  const passenger = globalThis.PhusionPassenger;
  const listenTarget =
    typeof passenger !== "undefined"
      ? (passenger.configure({ autoInstall: false }), "passenger")
      : Number(process.env.PORT) || 8080;

  app.listen(listenTarget, () => {
    log(`listening on ${String(listenTarget)}`);
  });

  verifySmtpOnStart().catch((error) => {
    log(`smtp verify: ${error?.message || error}`);
  });
}

start().catch((error) => {
  log(`FATAL: ${error?.stack || error}`);
  process.exit(1);
});
