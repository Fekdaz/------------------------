import dns from "node:dns";
import nodemailer from "nodemailer";
import { getConfig } from "../config.js";
import { createSmtpTransport } from "../lib/smtp-transport.js";

dns.setServers(["1.1.1.1", "8.8.8.8"]);
dns.setDefaultResultOrder("ipv4first");

const config = await getConfig();
const transporter = createSmtpTransport(config);
try {
  await transporter.verify();
  console.log("verify: OK");

  const info = await transporter.sendMail({
    from: `"${config.from_name}" <${config.from_email}>`,
    to: config.to_email,
    subject: "Тест SMTP (dev)",
    text: "Проверка отправки из npm run test:smtp",
  });

  console.log("send: OK", info.messageId);
} catch (error) {
  console.error("FAIL", error.code || "", error.message);
  process.exit(1);
}
