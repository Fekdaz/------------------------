import net from "node:net";

/**
 * Запускает Express на порту; при EADDRINUSE пробует следующие.
 */
export function listenWithPortFallback(app, startPort, maxAttempts = 20) {
  const base = Number(startPort) || 8080;
  const attempts = Math.max(1, Number(maxAttempts) || 20);

  return new Promise((resolve, reject) => {
    let index = 0;

    const tryPort = (port) => {
      const server = app.listen(port);

      server.once("listening", () => {
        resolve({ server, port });
      });

      server.once("error", (error) => {
        if (error.code === "EADDRINUSE" && index < attempts - 1) {
          if (index === 0) {
            console.warn(`Порт ${port} занят, ищу свободный…`);
          }
          server.close(() => {
            index += 1;
            tryPort(base + index);
          });
          return;
        }
        reject(error);
      });
    };

    tryPort(base);
  });
}
