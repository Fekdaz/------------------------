<?php
declare(strict_types=1);

function kozhevnya_rate_limit(array $config, string $ip, int $limit, string $namespace, int $windowSeconds = 3600): bool
{
  if ($limit <= 0) {
    return true;
  }

  try {
    $bucketDir = $config['rate_limit_dir'] . '/' . $namespace;
    if (!kozhevnya_ensure_dir($bucketDir)) {
      return true;
    }

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
    @file_put_contents($file, json_encode($entries), LOCK_EX);
    return true;
  } catch (Throwable $e) {
    return true;
  }
}

function kozhevnya_captcha_key(array $config): string
{
  return hash(
    'sha256',
    'kozhevnya-invisible-captcha|' .
      (string) ($config['consent_journal_password'] ?? '') .
      '|' .
      (string) ($config['smtp_user'] ?? '')
  );
}

function kozhevnya_create_captcha(array $config): array
{
  $secret = trim((string) ($config['yandex_smart_captcha_secret'] ?? ''));
  if ($secret !== '' && strpos($secret, 'YOUR_') !== 0) {
    return ['type' => 'smart'];
  }

  $createdAt = (int) round(microtime(true) * 1000);
  try {
    $nonce = bin2hex(random_bytes(8));
  } catch (Throwable $e) {
    $nonce = substr(hash('sha256', uniqid((string) mt_rand(), true)), 0, 16);
  }
  $body = $createdAt . '.' . $nonce;
  $mac = hash_hmac('sha256', $body, kozhevnya_captcha_key($config));
  return ['id' => $body . '.' . $mac, 'type' => 'invisible'];
}

function kozhevnya_validate_captcha(array $config, array $payload, string $ip): bool
{
  $secret = trim((string) ($config['yandex_smart_captcha_secret'] ?? ''));
  if ($secret !== '' && strpos($secret, 'YOUR_') !== 0) {
    return kozhevnya_validate_smart_captcha($secret, (string) ($payload['captchaToken'] ?? ''), $ip);
  }

  $id = (string) ($payload['captchaId'] ?? '');
  if (preg_match('/^(\d+)\.([a-f0-9]{16})\.([a-f0-9]{64})$/', $id, $match)) {
    $body = $match[1] . '.' . $match[2];
    $expected = hash_hmac('sha256', $body, kozhevnya_captcha_key($config));
    if (!hash_equals($expected, $match[3])) {
      return false;
    }
    $createdAt = (int) $match[1];
    $now = (int) round(microtime(true) * 1000);
    if ($now < $createdAt || ($now - $createdAt) > 600000) {
      return false;
    }
    $minDelay = (int) ($config['captcha_invisible_min_ms'] ?? 2000);
    return ($now - $createdAt) >= $minDelay;
  }

  $legacyId = strtolower(preg_replace('/[^a-f0-9]/i', '', $id) ?? '');
  if (strlen($legacyId) !== 32) {
    return false;
  }

  $file = $config['captcha_dir'] . '/' . $legacyId . '.json';
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
  try {
    if (!kozhevnya_ensure_dir($config['consent_log_dir'])) {
      return;
    }
    $file = $config['consent_log_dir'] . '/' . gmdate('Y-m') . '.jsonl';
    @file_put_contents($file, json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
  } catch (Throwable $e) {
    return;
  }
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
  if ($line === '') {
    throw new RuntimeException('SMTP: пустой ответ сервера');
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

function kozhevnya_smtp_ipv4_list(string $host): array
{
  if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
    return [$host];
  }
  $ips = [];
  $list = @gethostbynamel($host);
  if (is_array($list)) {
    foreach ($list as $ip) {
      if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $ips[] = $ip;
      }
    }
  }
  return array_values(array_unique($ips));
}

function kozhevnya_smtp_targets(array $smtp): array
{
  $host = trim((string) ($smtp['smtp_host'] ?? ''));
  $serverName = trim((string) ($smtp['smtp_tls_servername'] ?? '')) ?: $host;
  $configuredIp = trim((string) ($smtp['smtp_connect_host'] ?? ''));
  $port = (int) ($smtp['smtp_port'] ?? 465);
  $secure = !empty($smtp['smtp_secure']);
  $startTls = !empty($smtp['smtp_require_tls']);
  $targets = [];
  $seen = [];

  $add = function (string $connect, int $usePort, bool $useSecure, bool $useStartTls) use (&$targets, &$seen, $serverName) {
    if ($connect === '') {
      return;
    }
    $key = $connect . ':' . $usePort . ':' . ($useSecure ? '1' : '0');
    if (isset($seen[$key])) {
      return;
    }
    $seen[$key] = true;
    $targets[] = [
      'connect' => $connect,
      'port' => $usePort,
      'secure' => $useSecure,
      'starttls' => $useStartTls,
      'servername' => $serverName !== '' ? $serverName : $connect,
    ];
  };

  if ($configuredIp !== '') {
    $add($configuredIp, $port, $secure, $startTls);
  }
  $add($host, $port, $secure, $startTls);
  if ($port === 465 || $secure) {
    $add($host, 587, false, true);
  }
  foreach (kozhevnya_smtp_ipv4_list($host) as $ip) {
    $add($ip, 465, true, false);
  }

  return $targets;
}

function kozhevnya_smtp_open(array $target, int $timeout)
{
  $scheme = !empty($target['secure']) ? 'ssl' : 'tcp';
  $context = stream_context_create([
    'ssl' => [
      'peer_name' => $target['servername'],
      'SNI_enabled' => true,
      'verify_peer' => true,
      'verify_peer_name' => true,
    ],
  ]);
  $fp = @stream_socket_client(
    $scheme . '://' . $target['connect'] . ':' . $target['port'],
    $errno,
    $errstr,
    $timeout,
    STREAM_CLIENT_CONNECT,
    $context
  );
  if ($fp === false) {
    throw new RuntimeException('Не удалось подключиться к SMTP: ' . ($errstr !== '' ? $errstr : 'errno ' . $errno));
  }
  stream_set_timeout($fp, $timeout);
  return $fp;
}

function kozhevnya_send_mail(array $config, string $subject, string $body): void
{
  $smtp = kozhevnya_smtp_settings($config);
  $toList = array_values(array_filter(array_map('trim', explode(',', (string) ($smtp['to_email'] ?? '')))));
  if (!$toList) {
    throw new RuntimeException('Не указан to_email');
  }

  $user = trim((string) ($smtp['smtp_auth_user'] ?? $smtp['smtp_user'] ?? ''));
  $pass = (string) ($smtp['smtp_pass'] ?? '');
  $fromName = trim((string) ($smtp['from_name'] ?? 'Kozhevnya'));
  if ($fromName === '') {
    $fromName = 'Kozhevnya';
  }
  $fromEmail = $user !== '' ? $user : trim((string) ($smtp['from_email'] ?? ''));
  if ($fromEmail === '' || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
    throw new RuntimeException('Не указан smtp_user / from_email');
  }

  $timeout = max(5, (int) (($smtp['smtp_connection_timeout_ms'] ?? 15000) / 1000));
  $lastError = null;

  foreach (kozhevnya_smtp_targets($smtp) as $target) {
    $fp = null;
    try {
      $fp = kozhevnya_smtp_open($target, $timeout);
      kozhevnya_smtp_expect($fp, '220');
      kozhevnya_smtp_cmd($fp, 'EHLO kozhevnya.ru', '250');

      if (empty($target['secure']) && !empty($target['starttls'])) {
        kozhevnya_smtp_cmd($fp, 'STARTTLS', '220');
        $crypto = defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')
          ? STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT
          : STREAM_CRYPTO_METHOD_TLS_CLIENT;
        if (!stream_socket_enable_crypto($fp, true, $crypto)) {
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
        $replyTo = trim(explode(',', (string) ($smtp['to_email'] ?? ''))[0]);
        $headers = [
          'From: ' . $encodedFrom,
          'To: ' . $to,
          'Subject: ' . $encodedSubject,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=UTF-8',
          'Content-Transfer-Encoding: 8bit',
        ];
        if ($replyTo !== '' && strcasecmp($replyTo, $fromEmail) !== 0 && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
          $headers[] = 'Reply-To: ' . $replyTo;
        }
        $message = implode("\r\n", $headers) . "\r\n\r\n"
          . str_replace("\n", "\r\n", str_replace("\r\n", "\n", $body))
          . "\r\n.";
        fwrite($fp, $message . "\r\n");
        kozhevnya_smtp_expect($fp, '250');
      }

      fwrite($fp, "QUIT\r\n");
      fclose($fp);
      return;
    } catch (Throwable $error) {
      $lastError = $error;
      if ($fp) {
        fclose($fp);
      }
    }
  }

  throw $lastError instanceof Throwable ? $lastError : new RuntimeException('Не удалось отправить письмо');
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
  if (stripos($message, '535') !== false || stripos($message, 'authentication failed') !== false) {
    return 'Яндекс не принял логин или пароль SMTP. Нужен пароль приложения почты, не обычный пароль.';
  }
  if (stripos($message, '553') !== false || stripos($message, 'sender address') !== false) {
    return 'Яндекс отклонил адрес отправителя. Отправка идёт от ящика SMTP, не от noreply@, пока этот адрес не добавлен в ящик.';
  }
  if (stripos($message, 'подключиться') !== false || stripos($message, 'timeout') !== false || stripos($message, 'timed out') !== false) {
    return 'Не удалось подключиться к SMTP Яндекса с сервера. Проверьте, что в php/config.local.php указаны smtp_provider=yandex, smtp_user и пароль приложения.';
  }
  if (preg_match('/SMTP:\s*(.+)$/u', $message, $match)) {
    return 'Почта не отправлена: ' . $match[1];
  }
  return 'Не удалось отправить письмо. Проверьте SMTP-настройки в php/config.local.php.';
}
