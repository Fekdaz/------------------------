/**
 * Минимальный тест Passenger на Beget.
 * В .htaccess временно: PassengerStartupFile test-passenger.cjs
 */
const fs = require("fs");
const path = require("path");

const log = path.join(__dirname, "tmp", "passenger-debug.log");

function write(msg) {
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.appendFileSync(log, `[${new Date().toISOString()}] ${msg}\n`);
  console.error(msg);
}

write("test-passenger.cjs loaded");
write(`PhusionPassenger=${typeof globalThis.PhusionPassenger}`);
write(`node=${process.version}`);

const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Passenger test OK");
});

if (typeof globalThis.PhusionPassenger !== "undefined") {
  globalThis.PhusionPassenger.configure({ autoInstall: false });
  app.listen("passenger");
  write("listen(passenger) called");
} else {
  write("NO PhusionPassenger - export app");
  module.exports = app;
}
