/**
 * Точка входа для Apache Passenger (Beget).
 */
const fs = require("fs");
const path = require("path");

const logPath = path.join(__dirname, "tmp", "passenger-debug.log");

function debug(line) {
  const text = `[${new Date().toISOString()}] ${line}\n`;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, text);
  } catch (_) {
    /* ignore */
  }
  console.error(line);
}

debug("passenger.cjs start");
debug(`PhusionPassenger=${typeof globalThis.PhusionPassenger}`);
debug(`PASSENGER_APP_ENV=${process.env.PASSENGER_APP_ENV || ""}`);
debug(`node=${process.version}`);

import("./server/app.js")
  .then(({ buildApp, verifySmtpOnStart }) => {
    debug("import app.js OK");
    const app = buildApp();
    debug("buildApp OK");

    if (typeof globalThis.PhusionPassenger !== "undefined") {
      globalThis.PhusionPassenger.configure({ autoInstall: false });
      app.listen("passenger");
      debug("listen(passenger) OK");
      verifySmtpOnStart().catch((error) => {
        debug(`smtp verify failed: ${error?.message || error}`);
      });
      return;
    }

    debug("no PhusionPassenger, export app");
    module.exports = app;
  })
  .catch((error) => {
    debug(`FATAL: ${error?.stack || error}`);
    process.exit(1);
  });
