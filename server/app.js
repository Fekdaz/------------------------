import express from "express";
import dns from "node:dns";
import { getConfig } from "./config.js";
import { getAppRoot } from "./lib/app-root.js";
import { registerSecurityMiddleware } from "./lib/security.js";
import { registerApiRoutes } from "./routes/api.js";
import { registerConsentJournalRoutes } from "./routes/consent-journal.js";
import { verifySmtpConnection } from "./lib/smtp-transport.js";

try {
  dns.setServers(["1.1.1.1", "8.8.8.8"]);
  dns.setDefaultResultOrder("ipv4first");
} catch {
  /* Passenger/Beget may forbid overriding DNS */
}

export function buildApp() {
  const config = getConfig();
  const rootDir = getAppRoot();
  const app = express();

  registerSecurityMiddleware(app, config);

  app.use(express.json({
    limit: "64kb",
    strict: true,
    type: (req) => {
      if (!req.method || req.method === "GET" || req.method === "HEAD") return false;
      const ct = String(req.headers["content-type"] || "");
      return ct.includes("application/json") || ct.includes("application/x-www-form-urlencoded");
    },
  }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));

  app.use((req, res, next) => {
    const raw = req.headers.cookie || "";
    req.cookies = Object.fromEntries(
      raw
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const idx = part.indexOf("=");
          if (idx === -1) return [part, ""];
          return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
        }),
    );
    next();
  });

  registerApiRoutes(app, config);
  registerConsentJournalRoutes(app, config);

  app.use(express.static(rootDir, { index: "index.html", dotfiles: "ignore" }));

  app.use((req, res) => {
    res.status(404).end();
  });

  app.use((err, req, res, next) => {
    if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
      return res.status(400).json({ ok: false, error: "Некорректный запрос" });
    }
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ ok: false, error: "Запрос слишком большой" });
    }
    console.error("[server]", err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: "Внутренняя ошибка сервера" });
    } else {
      next(err);
    }
  });

  return app;
}

export async function verifySmtpOnStart() {
  const config = getConfig();
  if (!config.smtp_verify_on_start) return;
  try {
    await verifySmtpConnection(config);
    console.log("SMTP: подключение и авторизация успешны");
  } catch (error) {
    console.error("SMTP: ошибка —", error?.message || error);
  }
}
