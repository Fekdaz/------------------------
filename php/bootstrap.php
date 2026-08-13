<?php
declare(strict_types=1);

header_remove('X-Powered-By');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');

$phpRoot = __DIR__;
$configFile = $phpRoot . '/config.local.php';
if (!is_file($configFile)) {
  $configFile = $phpRoot . '/config.example.php';
}

$config = require $configFile;
if (!is_array($config)) {
  $config = [];
}

$config['data_dir'] = $phpRoot . '/data';
$config['consent_log_dir'] = $config['data_dir'] . '/consent-log';
$config['captcha_dir'] = $config['data_dir'] . '/captcha';
$config['rate_limit_dir'] = $config['data_dir'] . '/rate-limit';

require $phpRoot . '/http.php';
require $phpRoot . '/services.php';
require $phpRoot . '/journal.php';
require $phpRoot . '/routes.php';
