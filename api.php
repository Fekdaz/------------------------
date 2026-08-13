<?php
/**
 * Точка входа API. Этот файл должен разбираться даже на PHP 5.6,
 * чтобы отдать понятную ошибку, если в панели Beget не включён PHP 8.
 */
if (!defined('PHP_VERSION_ID') || PHP_VERSION_ID < 70400) {
  header('Content-Type: application/json; charset=utf-8');
  header('X-Content-Type-Options: nosniff');
  http_response_code(503);
  echo '{"ok":false,"error":"На хостинге PHP ' . PHP_VERSION . '. В панели Beget для tennerg.ru включите PHP 8.2."}';
  exit;
}

require __DIR__ . '/php/bootstrap.php';
require __DIR__ . '/php/run.php';
