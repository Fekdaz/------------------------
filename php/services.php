<?php
declare(strict_types=1);

function kozhevnya_rate_limit(array $config, string $ip, int $limit, string $namespace, int $windowSeconds = 3600): bool
{
  if ($limit <= 0) {
    return true;
  }

  $bucketDir = $config['rate_limit_dir'] . '/' . $namespace;
  kozhevnya_ensure_dir($bucketDir);

  $file = $bucketDir . '/' . hash('sha256', $ip) . '.json';
  $now = (int) round(microtime(true) * 1000);
  $windowMs = max(1, $windowSeconds) * 1000;
  $windowStart = $now - $windowMs;
  $entries = [];

  if (is_file($file)) {
    $decoded = json_decode((string) file_get_contents($file), true);
    if (is_array($decoded)) {
      foreach ($decoded as $stamp) {
        if (is_int($stamp) && $stamp >= $windowStart) {
          $entries[] = $stamp;
        }
      }
    }
  }

  if (count($entries) >= $limit) {
    return false;
  }

  $entries[] = $now;
  file_put_contents($file, json_encode($entries), LOCK_EX);
  return true;
}

function kozhevnya_create_captcha(array $config): array
{
  $secret = trim((string) ($config['yandex_smart_captcha_secret'] ?? ''));
  if ($secret !== '') {
    return ['type' => 'smart'];
  }

  kozhevnya_ensure_dir($config['captcha_dir']);
  $id = bin2hex(random_bytes(16));
  $createdAt = (int) round(microtime(true) * 1000);
  $payload = [
    'type' => 'invisible',
    'createdAt' => $createdAt,
    'expires' => $createdAt + 600000,
  ];
  file_put_contents($config['captcha_dir'] . '/' . $id . '.json', json_encode($payload), LOCK_EX);
  return ['id' => $id, 'type' => 'invisible'];
}

function kozhevnya_validate_captcha(array $config, array $payload, string $ip): bool
{
  $secret = trim((string) ($config['yandex_smart_captcha_secret'] ?? ''));
  if ($secret !== '') {
    return kozhevnya_validate_smart_captcha($secret, (string) ($payload['captchaToken'] ?? ''), $ip);
  }

  $id = strtolower(preg_replace('/[^a-f0-9]/i', '', (string) ($payload['captchaId'] ?? '')) ?? '');
  if (strlen($id) !== 32) {
    return false;
  }

  $file = $config['captcha_dir'] . '/' . $id . '.json';
  if (!is_file($file)) {
    return false;
  }

  $decoded = json_decode((string) file_get_contents($file), true);
  @unlink($file);
  if (!is_array($decoded) || (int) ($decoded['expires'] ?? 0) < (int) round(microtime(true) * 1000)) {
    return false;
  }
  if (($decoded['type'] ?? '') !== 'invisible') {
    return false;
  }

  $minDelay = (int) ($config['captcha_invisible_min_ms'] ?? 2000);
  return ((int) round(microtime(true) * 1000) - (int) ($decoded['createdAt'] ?? 0)) >= $minDelay;
}

function kozhevnya_validate_smart_captcha(string $secret, string $token, string $ip): bool
{
  if ($secret === '' || $token === '') {
    return false;
  }

  $context = stream_context_create([
    'http' => [
      'method' => 'POST',
      'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
      'content' => http_build_query([
        'secret' => $secret,
        'token' => $token,
        'ip' => $ip,
      ]),
      'timeout' => 4,
    ],
  ]);

  $raw = @file_get_contents('https://smartcaptcha.cloud.yandex.ru/validate', false, $context);
  if ($raw === false) {
    return false;
  }
  $data = json_decode($raw, true);
  return is_array($data) && ($data['status'] ?? '') === 'ok';
}

function kozhevnya_log_consent(array $config, array $entry): void
{
  kozhevnya_ensure_dir($config['consent_log_dir']);
  $file = $config['consent_log_dir'] . '/' . gmdate('Y-m') . '.jsonl';
  file_put_contents($file, json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
}

function kozhevnya_smtp_presets(): array
{
  return [
    'brevo' => [
      'smtp_host' => 'smtp-relay.brevo.com',
      'smtp_port' => 587,
      'smtp_secure' => false,
      'smtp_require_tls' => true,
    ],
    'gmail' => [
      'smtp_host' => 'smtp.gmail.com',
      'smtp_port' => 465,
      'smtp_secure' => true,
    ],
    'mailru' => [
      'smtp_host' => 'smtp.mail.ru',
      'smtp_port' => 465,
      'smtp_secure' => true,
    ],
    'sendgrid' => [
      'smtp_host' => 'smtp.sendgrid.net',
      'smtp_port' => 587,
      'smtp_secure' => false,
      'smtp_require_tls' => true,
      'smtp_auth_user' => 'apikey',
    ],
    'yandex' => [
      'smtp_host' => 'smtp.yandex.ru',
      'smtp_port' => 465,
      'smtp_secure' => true,
      'smtp_connect_host' => '77.88.21.158',
      'smtp_tls_servername' => 'smtp.yandex.ru',
    ],
  ];
}

function kozhevnya_smtp_settings(array $config): array
{
  $provider = strtolower(trim((string) ($config['smtp_provider'] ?? '')));
  $preset = kozhevnya_smtp_presets()[$provider] ?? [];
  return array_merge($config, $preset);
}

function kozhevnya_smtp_expect($fp, string $code): string
{
  $line = '';
  while (($chunk = fgets($fp, 2048)) !== false) {
    $line .= $chunk;
    if (isset($chunk[3]) && $chunk[3] === ' ') {
      break;
    }
  }
  if (strpos($line, $code) !== 0) {
    throw new RuntimeException('SMTP: ' . trim($line));
  }
  return $line;
}

function kozhevnya_smtp_cmd($fp, string $command, string $expect): string
{
  fwrite($fp, $command . "\r\n");
  return kozhevnya_smtp_expect($fp, $expect);
}

function kozhevnya_send_mail(array $config, string $subject, string $body): void
{
  $smtp = kozhevnya_smtp_settings($config);
  $toList = array_values(array_filter(array_map('trim', explode(',', (string) ($smtp['to_email'] ?? '')))));
  if (!$toList) {
    throw new RuntimeException('Не указан to_email');
  }

  $fromEmail = (string) ($smtp['from_email'] ?? '');
  $fromName = (string) ($smtp['from_name'] ?? 'Kozhevnya');
  $user = (string) ($smtp['smtp_auth_user'] ?? $smtp['smtp_user'] ?? '');
  $pass = (string) ($smtp['smtp_pass'] ?? '');
  $host = (string) ($smtp['smtp_host'] ?? '');
  $connectHost = trim((string) ($smtp['smtp_connect_host'] ?? '')) ?: $host;
  $port = (int) ($smtp['smtp_port'] ?? 465);
  $secure = !empty($smtp['smtp_secure']);
  $startTls = !empty($smtp['smtp_require_tls']);
  $timeout = max(5, (int) (($smtp['smtp_connection_timeout_ms'] ?? 15000) / 1000));
  $serverName = (string) ($smtp['smtp_tls_servername'] ?? $host);

  $scheme = $secure ? 'ssl' : 'tcp';
  $context = stream_context_create([
    'ssl' => [
      'peer_name' => $serverName,
      'SNI_enabled' => true,
    ],
  ]);

  $fp = @stream_socket_client(
    $scheme . '://' . $connectHost . ':' . $port,
    $errno,
    $errstr,
    $timeout,
    STREAM_CLIENT_CONNECT,
    $context
  );
  if ($fp === false) {
    throw new RuntimeException('Не удалось подключиться к SMTP: ' . $errstr);
  }
  stream_set_timeout($fp, $timeout);
  kozhevnya_smtp_expect($fp, '220');
  kozhevnya_smtp_cmd($fp, 'EHLO kozhevnya.ru', '250');

  if (!$secure && $startTls) {
    kozhevnya_smtp_cmd($fp, 'STARTTLS', '220');
    if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
      throw new RuntimeException('Не удалось включить TLS');
    }
    kozhevnya_smtp_cmd($fp, 'EHLO kozhevnya.ru', '250');
  }

  kozhevnya_smtp_cmd($fp, 'AUTH LOGIN', '334');
  kozhevnya_smtp_cmd($fp, base64_encode($user), '334');
  kozhevnya_smtp_cmd($fp, base64_encode($pass), '235');

  $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
  $encodedFrom = '=?UTF-8?B?' . base64_encode($fromName) . '?= <' . $fromEmail . '>';

  foreach ($toList as $to) {
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
      throw new RuntimeException('Некорректный to_email');
    }
    kozhevnya_smtp_cmd($fp, 'MAIL FROM:<' . $fromEmail . '>', '250');
    kozhevnya_smtp_cmd($fp, 'RCPT TO:<' . $to . '>', '250');
    kozhevnya_smtp_cmd($fp, 'DATA', '354');
    $message = implode("\r\n", [
      'From: ' . $encodedFrom,
      'To: ' . $to,
      'Subject: ' . $encodedSubject,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      str_replace("\n", "\r\n", str_replace("\r\n", "\n", $body)),
      '.',
    ]);
    fwrite($fp, $message . "\r\n");
    kozhevnya_smtp_expect($fp, '250');
  }

  fwrite($fp, "QUIT\r\n");
  fclose($fp);
}

function kozhevnya_format_submitted_at(string $iso): string
{
  if ($iso === '') {
    return '—';
  }
  try {
    $dt = new DateTime($iso);
    $dt->setTimezone(new DateTimeZone('Europe/Moscow'));
    return $dt->format('d.m.Y, H:i:s');
  } catch (Exception $e) {
    return $iso;
  }
}

function kozhevnya_lead_email_body(array $payload, string $company, string $name, string $phone, string $email, string $comment, string $page, bool $marketingConsent): string
{
  $consent = is_array($payload['consent'] ?? null) ? $payload['consent'] : [];
  $personal = is_array($consent['personal'] ?? null) ? $consent['personal'] : [];
  $marketing = is_array($consent['marketing'] ?? null) ? $consent['marketing'] : [];
  $submittedAt = kozhevnya_sanitize($payload['submittedAt'] ?? '', 64);

  $lines = [
    'Новая заявка с сайта tennerg.ru',
    '',
    'Компания: ' . ($company !== '' ? $company : '—'),
    'Имя: ' . $name,
    'Телефон: ' . $phone,
    'Email: ' . ($email !== '' ? $email : '—'),
    'Комментарий: ' . ($comment !== '' ? $comment : '—'),
    'Страница: ' . ($page !== '' ? $page : '—'),
    '',
    '--- Согласия ---',
    'Время отправки: ' . kozhevnya_format_submitted_at($submittedAt),
    '',
    'Согласие на обработку персональных данных: да (обязательное)',
    'Версия документа: ' . kozhevnya_sanitize($personal['documentVersion'] ?? '', 32),
    'Документ: ' . kozhevnya_sanitize($personal['documentPath'] ?? '', 120),
    'Версия политики ПДн: ' . kozhevnya_sanitize($consent['privacyPolicyVersion'] ?? '', 32),
  ];

  if ($marketingConsent) {
    $lines[] = '';
    $lines[] = 'Согласие на рекламу: да';
    $lines[] = 'Версия документа: ' . kozhevnya_sanitize($marketing['documentVersion'] ?? '', 32);
    $lines[] = 'Документ: ' . kozhevnya_sanitize($marketing['documentPath'] ?? '', 120);
  } else {
    $lines[] = '';
    $lines[] = 'Согласие на рекламу: нет';
  }

  return implode("\n", $lines);
}

function kozhevnya_smtp_error_message(Throwable $error): string
{
  $message = $error->getMessage();
  if (stripos($message, '535') !== false || stripos($message, 'auth') !== false) {
    return 'Не удалось авторизоваться на SMTP. Проверьте smtp_user и smtp_pass в php/config.local.php.';
  }
  if (stripos($message, 'подключиться') !== false || stripos($message, 'timeout') !== false) {
    return 'Не удалось подключиться к SMTP. Проверьте интернет и smtp-настройки.';
  }
  return 'Не удалось отправить письмо. Проверьте SMTP-настройки в php/config.local.php.';
}
