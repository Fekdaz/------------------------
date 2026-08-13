<?php
declare(strict_types=1);

function kozhevnya_sanitize($value, int $maxLength): string
{
  $text = trim((string) $value);
  $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $text) ?? '';
  $len = function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
  if ($len <= $maxLength) {
    return $text;
  }
  return function_exists('mb_substr') ? mb_substr($text, 0, $maxLength, 'UTF-8') : substr($text, 0, $maxLength);
}

function kozhevnya_client_ip(array $config): string
{
  $trustProxy = !empty($config['trust_proxy']);
  $candidates = $trustProxy
    ? [
      $_SERVER['HTTP_CF_CONNECTING_IP'] ?? '',
      $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '',
      $_SERVER['REMOTE_ADDR'] ?? '',
    ]
    : [$_SERVER['REMOTE_ADDR'] ?? ''];

  foreach ($candidates as $value) {
    if ($value === '') {
      continue;
    }
    $ip = trim(explode(',', (string) $value)[0]);
    if (filter_var($ip, FILTER_VALIDATE_IP)) {
      return $ip;
    }
  }

  return '0.0.0.0';
}

function kozhevnya_origin_allowed(string $origin, array $config): bool
{
  if ($origin === '') {
    return true;
  }

  $normalized = strtolower($origin);
  foreach ($config['allowed_origins'] ?? [] as $allowed) {
    if (strtolower((string) $allowed) === $normalized) {
      return true;
    }
  }

  if (empty($config['allow_localhost_any_port'])) {
    return false;
  }

  $host = parse_url($origin, PHP_URL_HOST);
  return $host === 'localhost' || $host === '127.0.0.1';
}

function kozhevnya_apply_cors(array $config): bool
{
  $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
  if ($origin !== '' && !kozhevnya_origin_allowed($origin, $config)) {
    return false;
  }
  if ($origin !== '') {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
  }
  return true;
}

function kozhevnya_json(int $status, array $payload): void
{
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function kozhevnya_body(): array
{
  $contentType = (string) ($_SERVER['CONTENT_TYPE'] ?? '');
  if (stripos($contentType, 'application/json') !== false) {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '', true);
    return is_array($data) ? $data : [];
  }
  return $_POST;
}

function kozhevnya_path(): string
{
  $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
  $uri = is_string($uri) && $uri !== '' ? $uri : '/';
  if (preg_match('#/api\.php(?:/(.*))?$#', $uri, $match)) {
    $rest = $match[1] ?? '';
    return '/api' . ($rest !== '' ? '/' . $rest : '');
  }
  return $uri;
}

function kozhevnya_method(): string
{
  return strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
}

function kozhevnya_ensure_dir(string $dir): void
{
  if (!is_dir($dir)) {
    mkdir($dir, 0700, true);
  }
}

function kozhevnya_is_https(): bool
{
  if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    return true;
  }
  $forwarded = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
  return $forwarded === 'https';
}

function kozhevnya_same_origin(): bool
{
  $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
  if ($host === '') {
    return false;
  }

  foreach (['HTTP_ORIGIN' => true, 'HTTP_REFERER' => true] as $header => $_) {
    $value = (string) ($_SERVER[$header] ?? '');
    if ($value === '') {
      continue;
    }
    $originHost = parse_url($value, PHP_URL_HOST);
    $originPort = parse_url($value, PHP_URL_PORT);
    if (!is_string($originHost) || $originHost === '') {
      continue;
    }
    $check = $originPort ? $originHost . ':' . $originPort : $originHost;
    if (strcasecmp($check, $host) === 0) {
      return true;
    }
  }

  return false;
}

function kozhevnya_hmac_cookie(string $password): string
{
  return hash_hmac('sha256', 'kozhevnya-journal-v1', $password);
}

function kozhevnya_safe_equal(string $a, string $b): bool
{
  if (strlen($a) !== strlen($b)) {
    return false;
  }
  return hash_equals($a, $b);
}
