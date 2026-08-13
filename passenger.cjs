/**
 * Точка входа Passenger (Beget).
 * Сам собирает dist/beget.cjs при необходимости и запускает его.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = __dirname;
const bundle = path.join(root, "dist", "beget.cjs");
const buildScript = path.join(root, "scripts", "build-beget.cjs");
const logFile = path.join(root, "tmp", "passenger-debug.log");

function log(message) {
  const line = `[${new Date().toISOString()}] [passenger.cjs] ${message}\n`;
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, line);
  } catch {
    /* ignore */
  }
  console.error(`[passenger.cjs] ${message}`);
}

function ensureBundle() {
  if (fs.existsSync(bundle)) return;

  log("bundle missing, building...");
  if (!fs.existsSync(buildScript)) {
    log(`build script not found: ${buildScript}`);
    process.exit(1);
  }

  try {
    execFileSync(process.execPath, [buildScript], {
      cwd: root,
      stdio: "inherit",
      env: process.env,
    });
  } catch (error) {
    log(`build failed: ${error?.message || error}`);
    process.exit(1);
  }

  if (!fs.existsSync(bundle)) {
    log("build finished but bundle not found");
    process.exit(1);
  }
}

try {
  log("start");
  ensureBundle();
  require(bundle);
  log("bundle loaded");
} catch (error) {
  log(`FATAL: ${error?.stack || error}`);
  process.exit(1);
}
