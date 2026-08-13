<?php
declare(strict_types=1);

function kozhevnya_fatal_json(Throwable $error): void
{
  if (!headers_sent()) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
  }
  $logDir = __DIR__ . '/php/data';
  if (is_dir($logDir) && is_writable($logDir)) {
    @file_put_contents(
      $logDir . '/php-error.log',
      date('c') . ' ' . $error->getMessage() . ' @ ' . $error->getFile() . ':' . $error->getLine() . "\n",
      FILE_APPEND | LOCK_EX
    );
  }
  echo json_encode([
    'ok' => false,
    'error' => 'Сервис временно недоступен',
    'debug' => get_class($error) . ' ' . basename($error->getFile()) . ':' . $error->getLine(),
  ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

try {
  require __DIR__ . '/php/bootstrap.php';
  kozhevnya_dispatch($config);
} catch (Throwable $error) {
  kozhevnya_fatal_json($error);
}
