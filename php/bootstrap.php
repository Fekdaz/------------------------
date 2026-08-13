<?php
declare(strict_types=1);

header_remove('X-Powered-By');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');

$phpRoot = __DIR__;
$configFile = $phpRoot . '/config.local.php';
$exampleFile = $phpRoot . '/config.example.php';
if (!is_file($configFile) || !is_readable($configFile)) {
  $configFile = $exampleFile;
}

try {
  $config = include $configFile;
} catch (Throwable $e) {
  try {
    $config = is_file($exampleFile) ? include $exampleFile : [];
  } catch (Throwable $e2) {
    $config = [];
  }
}
if (!is_array($config)) {
  $config = [];
}

$config['data_dir'] = $phpRoot . '/data';
$config['consent_log_dir'] = $config['data_dir'] . '/consent-log';
$config['captcha_dir'] = $config['data_dir'] . '/captcha';
$config['rate_limit_dir'] = $config['data_dir'] . '/rate-limit';

require $phpRoot . '/http.php';
require $phpRoot . '/services.php';
require $phpRoot . '/routes.php';
