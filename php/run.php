<?php
declare(strict_types=1);

try {
  kozhevnya_dispatch($config);
} catch (Throwable $error) {
  kozhevnya_fatal_json($error);
}
