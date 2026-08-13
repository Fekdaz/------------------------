<?php
declare(strict_types=1);

function kozhevnya_journal_months(array $config): array
{
  $dir = $config['consent_log_dir'];
  if (!is_dir($dir)) {
    return [];
  }
  $months = [];
  foreach (scandir($dir) ?: [] as $name) {
    if (preg_match('/^(\d{4}-\d{2})\.jsonl$/', $name, $match)) {
      $months[] = $match[1];
    }
  }
  rsort($months);
  return $months;
}

function kozhevnya_journal_timestamp(array $entry): string
{
  foreach (['at', 'loggedAt', 'submittedAt'] as $key) {
    if (!empty($entry[$key]) && is_string($entry[$key])) {
      return $entry[$key];
    }
  }
  return '';
}

function kozhevnya_journal_entries(array $config, $month, int $limit = 500): array
{
  $dir = $config['consent_log_dir'];
  if (!is_dir($dir)) {
    return [];
  }

  $files = [];
  if ($month && preg_match('/^\d{4}-\d{2}$/', $month)) {
    $path = $dir . '/' . $month . '.jsonl';
    if (is_file($path)) {
      $files[] = $path;
    }
  } else {
    foreach (scandir($dir) ?: [] as $name) {
      if (substr($name, -6) === '.jsonl') {
        $files[] = $dir . '/' . $name;
      }
    }
    rsort($files);
  }

  $entries = [];
  foreach ($files as $file) {
    $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    foreach ($lines as $line) {
      $decoded = json_decode($line, true);
      if (is_array($decoded)) {
        $entries[] = $decoded;
      }
    }
  }

  usort($entries, static function ($a, $b) {
    return strcmp(kozhevnya_journal_timestamp($b), kozhevnya_journal_timestamp($a));
  });

  return $limit > 0 ? array_slice($entries, 0, $limit) : $entries;
}

function kozhevnya_journal_type_label(array $entry): string
{
  $labels = [
    'cookie' => 'Cookie',
    'personal_data' => 'Согласие на ПДн',
    'marketing' => 'Согласие на рекламу',
    'lead_submission' => 'Заявка с формы',
  ];
  $type = (string) ($entry['type'] ?? $entry['event'] ?? '');
  if ($type !== '' && isset($labels[$type])) {
    return $labels[$type];
  }
  if (!empty($entry['marketingConsent']) || !empty($entry['name']) || !empty($entry['phone'])) {
    return 'Заявка с формы';
  }
  return $type !== '' ? $type : '—';
}

function kozhevnya_journal_details(array $entry): string
{
  $parts = [];
  if (array_key_exists('accepted', $entry)) {
    $parts[] = 'Согласие: ' . ($entry['accepted'] ? 'да' : 'нет');
  }
  if (array_key_exists('marketingConsent', $entry)) {
    $parts[] = 'Реклама: ' . ($entry['marketingConsent'] ? 'да' : 'нет');
  }
  if (!empty($entry['name'])) {
    $parts[] = 'Имя: ' . $entry['name'];
  }
  if (!empty($entry['phone'])) {
    $parts[] = 'Телефон: ' . $entry['phone'];
  }
  if (!empty($entry['email'])) {
    $parts[] = 'Email: ' . $entry['email'];
  }
  if (!empty($entry['company'])) {
    $parts[] = 'Компания: ' . $entry['company'];
  }
  if (!empty($entry['formId'])) {
    $parts[] = 'Форма: ' . $entry['formId'];
  }
  if (!empty($entry['pageUrl'])) {
    $parts[] = 'URL: ' . $entry['pageUrl'];
  } elseif (!empty($entry['page'])) {
    $parts[] = 'URL: ' . $entry['page'];
  }
  return $parts ? implode('; ', $parts) : '—';
}

function kozhevnya_journal_authenticated(array $config): bool
{
  $password = (string) ($config['consent_journal_password'] ?? '');
  if ($password === '') {
    return false;
  }
  $cookie = (string) ($_COOKIE['kozhevnya_journal_auth'] ?? '');
  $expected = kozhevnya_hmac_cookie($password);
  return kozhevnya_safe_equal($cookie, $expected);
}

function kozhevnya_journal_set_cookie(string $value, int $maxAge): void
{
  $opts = [
    'expires' => $maxAge > 0 ? time() + $maxAge : time() - 3600,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Strict',
    'secure' => kozhevnya_is_https(),
  ];
  setcookie('kozhevnya_journal_auth', $value, $opts);
}

function kozhevnya_h(string $value): string
{
  return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function kozhevnya_render_journal(array $config, bool $isAuthenticated, string $selectedMonth, string $loginError): void
{
  $months = kozhevnya_journal_months($config);
  $entries = $isAuthenticated ? kozhevnya_journal_entries($config, $selectedMonth !== '' ? $selectedMonth : null) : [];

  $monthOptions = '';
  foreach ($months as $month) {
    $selected = $selectedMonth === $month ? ' selected' : '';
    $monthOptions .= '<option value="' . kozhevnya_h($month) . '"' . $selected . '>' . kozhevnya_h($month) . '</option>';
  }

  $rows = '';
  foreach ($entries as $entry) {
    $rows .= '<tr>'
      . '<td>' . kozhevnya_h(kozhevnya_format_submitted_at(kozhevnya_journal_timestamp($entry))) . '</td>'
      . '<td>' . kozhevnya_h(kozhevnya_journal_type_label($entry)) . '</td>'
      . '<td>' . kozhevnya_h((string) ($entry['documentVersion'] ?? '—')) . '</td>'
      . '<td>' . kozhevnya_h((string) ($entry['ip'] ?? '—')) . '</td>'
      . '<td class="details">' . kozhevnya_h(kozhevnya_journal_details($entry)) . '</td>'
      . '</tr>';
  }

  if ($isAuthenticated) {
    $authBlock = '<div class="panel toolbar">
        <form method="get">
          <label for="month">Месяц</label>
          <select id="month" name="month" onchange="this.form.submit()">
            <option value="">Все месяцы</option>
            ' . $monthOptions . '
          </select>
        </form>
        <form method="post">
          <input type="hidden" name="logout" value="1" />
          <button type="submit" class="secondary">Выйти</button>
        </form>
      </div>
      <div class="panel">'
      . ($entries
        ? '<table><thead><tr><th>Время (МСК)</th><th>Тип</th><th>Версия</th><th>IP</th><th>Детали</th></tr></thead><tbody>' . $rows . '</tbody></table>'
        : '<p class="empty">Записей нет. Согласия появятся после действий на сайте.</p>')
      . '</div>';
  } else {
    $errorHtml = $loginError !== '' ? '<p class="error">' . kozhevnya_h($loginError) . '</p>' : '';
    $authBlock = '<div class="panel">
        <form method="post">
          <label for="password">Пароль для входа</label>
          <input id="password" name="password" type="password" required autocomplete="current-password" />
          ' . $errorHtml . '
          <button type="submit">Войти</button>
        </form>
      </div>';
  }

  header('Content-Type: text/html; charset=utf-8');
  echo '<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Журнал согласий | Кожевня</title>
  <style>
    :root { color-scheme: light; font-family: Manrope, system-ui, sans-serif; background: #f6f1ea; color: #2a1f18; }
    body { margin: 0; padding: 24px; }
    .wrap { max-width: 1100px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .meta { margin: 0 0 20px; color: #6a5648; font-size: 14px; }
    .panel { background: #fff; border: 1px solid #ddd2c6; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; font-size: 14px; }
    input[type="password"], select { width: 100%; max-width: 320px; padding: 10px 12px; border: 1px solid #ccc2b8; border-radius: 8px; font: inherit; }
    button { display: inline-block; margin-top: 12px; padding: 10px 16px; border: 0; border-radius: 8px; background: #7aad68; color: #fff; font: inherit; cursor: pointer; }
    button.secondary { background: #8a7565; }
    .error { color: #b42318; margin-top: 8px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #eadfce; padding: 10px 8px; vertical-align: top; text-align: left; }
    th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #6a5648; }
    .details { max-width: 420px; word-break: break-word; }
    .empty { padding: 24px; text-align: center; color: #6a5648; }
    .toolbar { display: flex; gap: 12px; align-items: end; flex-wrap: wrap; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Журнал согласий</h1>
    <p class="meta">Серверный аудит согласий (152-ФЗ, ст. 9). Файлы: php/data/consent-log/</p>
    ' . $authBlock . '
  </div>
</body>
</html>';
}
