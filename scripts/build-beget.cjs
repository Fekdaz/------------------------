const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "dist");
const outFile = path.join(outDir, "beget.cjs");
const logFile = path.join(root, "tmp", "passenger-debug.log");

function log(message) {
  const line = `[${new Date().toISOString()}] [build:beget] ${message}\n`;
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, line);
  } catch {
    /* ignore */
  }
  console.log(`[build:beget] ${message}`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  try {
    await esbuild.build({
      entryPoints: [path.join(root, "server", "passenger-bootstrap.js")],
      outfile: outFile,
      platform: "node",
      format: "cjs",
      bundle: true,
      packages: "bundle",
      external: ["express", "nodemailer"],
      logLevel: "warning",
    });

    log(`created ${outFile}`);
  } catch (error) {
    log(`failed: ${error?.message || error}`);
    process.exit(1);
  }
}

main();
