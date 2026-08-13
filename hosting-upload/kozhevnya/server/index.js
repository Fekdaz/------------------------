import config from "./config.js";
import { buildApp, verifySmtpOnStart } from "./app.js";
import { listenWithPortFallback } from "./lib/listen.js";

const startPort = Number(process.env.PORT || config.port || 8080);
const maxAttempts = Number(config.port_max_attempts) || 20;

const app = buildApp();
let activeServer = null;

function logStartup(port) {
  console.log(`Кожевня: http://localhost:${port}`);
  console.log(`Журнал согласий: http://localhost:${port}/api/consent-journal`);
}

listenWithPortFallback(app, startPort, maxAttempts)
  .then(async ({ server, port }) => {
    activeServer = server;
    logStartup(port);
    if (port !== startPort) {
      console.log(`(порт ${startPort} был занят, используется ${port})`);
    }
    await verifySmtpOnStart();
  })
  .catch((error) => {
    console.error("Не удалось запустить сервер:", error.message || error);
    process.exit(1);
  });

function shutdown(signal) {
  if (!activeServer) {
    process.exit(0);
    return;
  }
  console.log(`${signal}: остановка сервера…`);
  activeServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
