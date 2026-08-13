<?php
declare(strict_types=1);

function kozhevnya_dispatch(array $config): void
{
  $path = rtrim(kozhevnya_path(), '/') ?: '/';
  $method = kozhevnya_method();

  if (strpos($path, '/api') !== 0) {
    http_response_code(404);
    exit;
  }

  if ($method === 'OPTIONS') {
    if (!kozhevnya_apply_cors($config)) {
      kozhevnya_json(403, ['ok' => false]);
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
  }

  $ip = kozhevnya_client_ip($config);
  $globalLimit = (int) ($config['global_api_rate_per_minute'] ?? 120);
  if ($path !== '/api/consent-journal' && $globalLimit > 0) {
    if (!kozhevnya_rate_limit($config, $ip, $globalLimit, 'global-api', 60)) {
      if (!kozhevnya_apply_cors($config)) {
        kozhevnya_json(403, ['ok' => false]);
      }
      kozhevnya_json(429, ['ok' => false, 'error' => 'Слишком много запросов']);
    }
  }

  if ($path === '/api/captcha-challenge' && $method === 'GET') {
    kozhevnya_route_captcha($config, $ip);
  }
  if ($path === '/api/log-consent' && $method === 'POST') {
    kozhevnya_route_log_consent($config, $ip);
  }
  if ($path === '/api/send-lead' && $method === 'POST') {
    kozhevnya_route_send_lead($config, $ip);
  }
  if ($path === '/api/consent-journal') {
    kozhevnya_route_journal($config, $ip, $method);
  }

  http_response_code(404);
  exit;
}

function kozhevnya_route_captcha(array $config, string $ip): void
{
  if (!kozhevnya_apply_cors($config)) {
    kozhevnya_json(403, ['ok' => false]);
  }
  $limit = (int) ($config['captcha_rate_per_hour'] ?? 60);
  if (!kozhevnya_rate_limit($config, $ip, $limit, 'captcha')) {
    kozhevnya_json(429, ['ok' => false, 'error' => 'Слишком много запросов']);
  }
  try {
    $challenge = kozhevnya_create_captcha($config);
    if (($challenge['type'] ?? '') === 'smart') {
      kozhevnya_json(200, ['ok' => true, 'type' => 'smart']);
    }
    kozhevnya_json(200, ['ok' => true, 'id' => $challenge['id'], 'type' => 'invisible']);
  } catch (Throwable $e) {
    kozhevnya_json(503, ['ok' => false, 'error' => 'Не удалось создать капчу']);
  }
}

function kozhevnya_route_log_consent(array $config, string $ip): void
{
  if (!kozhevnya_apply_cors($config)) {
    kozhevnya_json(403, ['ok' => false]);
  }
  $limit = (int) ($config['consent_log_rate_per_hour'] ?? 120);
  if (!kozhevnya_rate_limit($config, $ip, $limit, 'consent-log')) {
    kozhevnya_json(429, ['ok' => false, 'error' => 'Слишком много запросов']);
  }

  $payload = kozhevnya_body();
  if (!$payload) {
    kozhevnya_json(400, ['ok' => false, 'error' => 'Некорректный JSON']);
  }

  $type = kozhevnya_sanitize($payload['type'] ?? '', 40);
  if (!in_array($type, ['cookie', 'personal_data', 'marketing'], true)) {
    kozhevnya_json(422, ['ok' => false, 'error' => 'Некорректный тип согласия']);
  }

  $entry = [
    'type' => $type,
    'loggedAt' => gmdate('c'),
    'at' => kozhevnya_sanitize($payload['at'] ?? '', 64),
    'ip' => $ip,
    'accepted' => !empty($payload['accepted']),
    'documentVersion' => kozhevnya_sanitize($payload['documentVersion'] ?? '', 32),
    'documentPath' => kozhevnya_sanitize($payload['documentPath'] ?? '', 120),
    'formId' => kozhevnya_sanitize($payload['formId'] ?? '', 64),
    'pageUrl' => kozhevnya_sanitize($payload['pageUrl'] ?? '', 500),
    'userAgent' => kozhevnya_sanitize($payload['userAgent'] ?? '', 300),
  ];

  if (isset($payload['cookieChoices']) && is_array($payload['cookieChoices'])) {
    $entry['cookieChoices'] = [
      'essential' => true,
      'analytics' => !empty($payload['cookieChoices']['analytics']),
      'marketing' => !empty($payload['cookieChoices']['marketing']),
    ];
  }

  kozhevnya_log_consent($config, $entry);
  kozhevnya_json(200, ['ok' => true]);
}

function kozhevnya_route_send_lead(array $config, string $ip): void
{
  if (!kozhevnya_apply_cors($config)) {
    kozhevnya_json(403, ['ok' => false]);
  }

  $payload = kozhevnya_body();
  if (!$payload) {
    kozhevnya_json(400, ['ok' => false, 'error' => 'Некорректный JSON']);
  }

  if (kozhevnya_sanitize($payload['website'] ?? '', 200) !== '') {
    kozhevnya_json(200, ['ok' => true]);
  }

  try {
    if (!kozhevnya_validate_captcha($config, $payload, $ip)) {
      kozhevnya_json(422, ['ok' => false, 'error' => 'Подтвердите, что вы не робот']);
    }
  } catch (Throwable $e) {
    kozhevnya_json(422, ['ok' => false, 'error' => 'Подтвердите, что вы не робот']);
  }

  $values = is_array($payload['values'] ?? null) ? $payload['values'] : [];
  $name = kozhevnya_sanitize($values['name'] ?? '', 120);
  $phone = kozhevnya_sanitize($values['phone'] ?? '', 40);
  $email = kozhevnya_sanitize($values['email'] ?? '', 200);
  $company = kozhevnya_sanitize($values['company'] ?? '', 200);
  $comment = kozhevnya_sanitize($values['comment'] ?? '', 2000);
  $page = kozhevnya_sanitize($payload['page'] ?? '', 500);
  $submittedAt = kozhevnya_sanitize($payload['submittedAt'] ?? '', 64);
  $marketingConsent = !empty($payload['marketingConsent']);

  if ($name === '' || $phone === '') {
    kozhevnya_json(422, ['ok' => false, 'error' => 'Укажите имя и телефон']);
  }
  if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    kozhevnya_json(422, ['ok' => false, 'error' => 'Укажите корректный email']);
  }

  $leadLimit = (int) ($config['rate_limit_per_hour'] ?? 10);
  if (!kozhevnya_rate_limit($config, $ip, $leadLimit, 'leads')) {
    kozhevnya_json(429, ['ok' => false, 'error' => 'Слишком много заявок. Попробуйте позже.']);
  }

  kozhevnya_log_consent($config, [
    'type' => 'lead_submission',
    'loggedAt' => gmdate('c'),
    'submittedAt' => $submittedAt,
    'ip' => $ip,
    'page' => $page,
    'formId' => kozhevnya_sanitize($payload['formId'] ?? '', 64),
    'name' => $name,
    'phone' => $phone,
    'email' => $email,
    'company' => $company,
    'marketingConsent' => $marketingConsent,
    'consent' => is_array($payload['consent'] ?? null) ? $payload['consent'] : [],
  ]);

  $text = kozhevnya_lead_email_body($payload, $company, $name, $phone, $email, $comment, $page, $marketingConsent);

  try {
    kozhevnya_send_mail($config, 'Заявка с сайта Kozhevnya — ' . $name, $text);
  } catch (Throwable $error) {
    kozhevnya_json(502, ['ok' => false, 'error' => kozhevnya_smtp_error_message($error)]);
  }

  kozhevnya_json(200, ['ok' => true]);
}

function kozhevnya_route_journal(array $config, string $ip, string $method): void
{
  require_once __DIR__ . '/journal.php';
  $password = (string) ($config['consent_journal_password'] ?? '');
  $journalPath = '/api/consent-journal';

  if ($password === '' || $password === 'ЗАДАЙТЕ_ПАРОЛЬ') {
    http_response_code(503);
    echo 'Журнал не настроен: задайте consent_journal_password в php/config.local.php';
    exit;
  }

  if ($method === 'POST') {
    if (!kozhevnya_same_origin()) {
      http_response_code(403);
      echo 'Запрос отклонён';
      exit;
    }

    $body = kozhevnya_body();
    if (!empty($body['logout'])) {
      kozhevnya_journal_set_cookie('', 0);
      header('Location: ' . $journalPath);
      exit;
    }

    $loginLimit = (int) ($config['journal_login_rate_per_hour'] ?? 20);
    if (!kozhevnya_rate_limit($config, $ip, $loginLimit, 'journal-login')) {
      header('Location: ' . $journalPath . '?error=1');
      exit;
    }

    $submitted = (string) ($body['password'] ?? '');
    if ($submitted !== '' && kozhevnya_safe_equal($submitted, $password)) {
      kozhevnya_journal_set_cookie(kozhevnya_hmac_cookie($password), 86400);
      header('Location: ' . $journalPath);
      exit;
    }

    header('Location: ' . $journalPath . '?error=1');
    exit;
  }

  if ($method !== 'GET') {
    http_response_code(405);
    exit;
  }

  $selectedMonth = (string) ($_GET['month'] ?? '');
  if ($selectedMonth !== '' && !preg_match('/^\d{4}-\d{2}$/', $selectedMonth)) {
    $selectedMonth = '';
  }
  $loginError = (($_GET['error'] ?? '') === '1') ? 'Неверный пароль' : '';
  kozhevnya_render_journal($config, kozhevnya_journal_authenticated($config), $selectedMonth, $loginError);
  exit;
}
