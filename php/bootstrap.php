<?php
declare(strict_types=1);

header_remove('X-Powered-By');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');

$phpRoot = __DIR__;
$exampleFile = $phpRoot . '/config.example.php';
$localFile = $phpRoot . '/config.local.php';

$example = [];
if (is_file($exampleFile)) {
  try {
    $loaded = include $exampleFile;
    if (is_array($loaded)) {
      $example = $loaded;
    }
  } catch (Throwable $e) {
    $example = [];
  }
}

$local = [];
if (is_file($localFile)) {
  @chmod($localFile, 0644);
  try {
    $loaded = include $localFile;
    if (is_array($loaded)) {
      $local = $loaded;
    }
  } catch (Throwable $e) {
    $local = [];
  }
}

$config = array_merge($example, $local);

$config['data_dir'] = $phpRoot . '/data';
$config['consent_log_dir'] = $config['data_dir'] . '/consent-log';
$config['captcha_dir'] = $config['data_dir'] . '/captcha';
$config['rate_limit_dir'] = $config['data_dir'] . '/rate-limit';

require $phpRoot . '/http.php';
require $phpRoot . '/services.php';
require $phpRoot . '/routes.php';
