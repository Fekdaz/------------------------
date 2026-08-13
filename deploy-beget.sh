#!/usr/bin/env bash
# =============================================================================
# Кожевня — деплой на Beget как обычный PHP/HTML-сайт (без Node/Passenger)
#
#   cd ~/tennerg.ru/kozhevnya
#   bash deploy-beget.sh
# =============================================================================

GIT_REPO_URL="${GIT_REPO_URL:-https://github.com/Fekdaz/------------------------.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"

SITE_SLUG="${SITE_SLUG:-tennerg.ru}"
APP_DIR_NAME="${APP_DIR_NAME:-kozhevnya}"
SITE_DOMAIN="${SITE_DOMAIN:-tennerg.ru}"

BEGET_USER="${BEGET_USER:-$(whoami)}"
HOME_DIR="${HOME:-/home/${BEGET_USER:0:1}/$BEGET_USER}"
SITE_ROOT="$HOME_DIR/$SITE_SLUG"
APP_ROOT="$SITE_ROOT/$APP_DIR_NAME"
PUBLIC_HTML="$SITE_ROOT/public_html"
NODE_BIN="$HOME_DIR/.local/bin/node"
DEPLOY_LOG="$HOME_DIR/deploy-beget-$SITE_SLUG.log"
BACKUP_DIR="$HOME_DIR/.kozhevnya-deploy-backups"

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$line"
  mkdir -p "$(dirname "$DEPLOY_LOG")" 2>/dev/null || true
  echo "$line" >>"$DEPLOY_LOG" 2>/dev/null || true
}

warn() { log "WARN: $*"; }
fail() { log "ERROR: $*"; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Команда '$1' не найдена."
}

backup_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  mkdir -p "$BACKUP_DIR"
  cp -f "$file" "$BACKUP_DIR/$(basename "$file").$(date +%Y%m%d-%H%M%S).bak"
}

write_htaccess() {
  mkdir -p "$PUBLIC_HTML"
  cat >"$PUBLIC_HTML/.htaccess" <<'EOF'
DirectoryIndex index.html

RewriteEngine On
RewriteBase /

RewriteRule ^php/ - [F,L]
RewriteRule ^api/?$ api.php [L,QSA]
RewriteRule ^api/(.+)$ api.php [L,QSA]
EOF
  log "Обновлён $PUBLIC_HTML/.htaccess"
}

ensure_php_config() {
  mkdir -p "$PUBLIC_HTML/php"
  if [ -f "$PUBLIC_HTML/php/config.local.php" ]; then
    log "Оставляю существующий php/config.local.php"
    return 0
  fi

  if [ -f "$APP_ROOT/server/config.local.js" ]; then
    local node_cmd=""
    if [ -x "$NODE_BIN" ]; then
      node_cmd="$NODE_BIN"
    elif command -v node >/dev/null 2>&1; then
      node_cmd="node"
    fi
    if [ -n "$node_cmd" ] && [ -f "$APP_ROOT/scripts/export-php-config.cjs" ]; then
      log "Создаю php/config.local.php из server/config.local.js"
      (cd "$APP_ROOT" && "$node_cmd" scripts/export-php-config.cjs) || true
      if [ -f "$APP_ROOT/php/config.local.php" ]; then
        cp -f "$APP_ROOT/php/config.local.php" "$PUBLIC_HTML/php/config.local.php"
        return 0
      fi
    fi
  fi

  cp -f "$APP_ROOT/php/config.example.php" "$PUBLIC_HTML/php/config.local.php"
  warn "Создан php/config.local.php из примера — заполните SMTP и пароль журнала!"
}

sync_site() {
  log "Копирую сайт в $PUBLIC_HTML"
  mkdir -p "$PUBLIC_HTML/css" "$PUBLIC_HTML/js" "$PUBLIC_HTML/php/data"

  backup_file "$PUBLIC_HTML/php/config.local.php"
  backup_file "$PUBLIC_HTML/js/legal-config.local.js"

  cp -f "$APP_ROOT"/*.html "$PUBLIC_HTML/"
  cp -f "$APP_ROOT/api.php" "$PUBLIC_HTML/api.php"
  cp -a "$APP_ROOT/css/." "$PUBLIC_HTML/css/"
  cp -a "$APP_ROOT/js/." "$PUBLIC_HTML/js/"
  cp -a "$APP_ROOT/php/." "$PUBLIC_HTML/php/"

  local latest_php_config
  latest_php_config="$(ls -t "$BACKUP_DIR"/config.local.php.*.bak 2>/dev/null | head -1 || true)"
  if [ -n "$latest_php_config" ]; then
    cp -f "$latest_php_config" "$PUBLIC_HTML/php/config.local.php"
    log "Восстановлен php/config.local.php"
  fi

  local latest_legal
  latest_legal="$(ls -t "$BACKUP_DIR"/legal-config.local.js.*.bak 2>/dev/null | head -1 || true)"
  if [ -n "$latest_legal" ]; then
    mkdir -p "$PUBLIC_HTML/js"
    cp -f "$latest_legal" "$PUBLIC_HTML/js/legal-config.local.js"
    log "Восстановлен js/legal-config.local.js"
  elif [ ! -f "$PUBLIC_HTML/js/legal-config.local.js" ] && [ -f "$APP_ROOT/js/legal-config.local.example.js" ]; then
    cp -f "$APP_ROOT/js/legal-config.local.example.js" "$PUBLIC_HTML/js/legal-config.local.js"
  fi

  ensure_php_config
  mkdir -p "$PUBLIC_HTML/php/data/consent-log" "$PUBLIC_HTML/php/data/captcha" "$PUBLIC_HTML/php/data/rate-limit"
  printf '%s\n' 'Require all denied' >"$PUBLIC_HTML/php/.htaccess"
  printf '%s\n' 'Require all denied' >"$PUBLIC_HTML/php/data/.htaccess"
}

fix_permissions() {
  log "Исправляю права доступа..."
  chmod -R u+rwX,go+rX "$PUBLIC_HTML" 2>/dev/null || true
  find "$PUBLIC_HTML/php/data" -type d -exec chmod 700 {} \; 2>/dev/null || true
  find "$PUBLIC_HTML/php/data" -type f -exec chmod 600 {} \; 2>/dev/null || true
  chmod 600 "$PUBLIC_HTML/php/config.local.php" 2>/dev/null || true
}

clone_or_update_repo() {
  mkdir -p "$APP_ROOT" "$PUBLIC_HTML" "$BACKUP_DIR"
  backup_file "$APP_ROOT/server/config.local.js"
  backup_file "$APP_ROOT/js/legal-config.local.js"

  if [ -d "$APP_ROOT/.git" ]; then
    log "Обновляю репозиторий..."
    git -C "$APP_ROOT" remote set-url origin "$GIT_REPO_URL" 2>/dev/null || true
    git -C "$APP_ROOT" fetch origin "$GIT_BRANCH"
    git -C "$APP_ROOT" reset --hard "origin/$GIT_BRANCH"
  else
    log "Клонирую репозиторий..."
    if [ -d "$APP_ROOT" ] && [ "$(ls -A "$APP_ROOT" 2>/dev/null)" ]; then
      mv "$APP_ROOT" "${APP_ROOT}.bak.$(date +%Y%m%d-%H%M%S)"
    fi
    git clone --branch "$GIT_BRANCH" --depth 1 "$GIT_REPO_URL" "$APP_ROOT"
  fi

  local latest_js_config
  latest_js_config="$(ls -t "$BACKUP_DIR"/config.local.js.*.bak 2>/dev/null | head -1 || true)"
  if [ -n "$latest_js_config" ] && [ ! -f "$APP_ROOT/server/config.local.js" ]; then
    mkdir -p "$APP_ROOT/server"
    cp -f "$latest_js_config" "$APP_ROOT/server/config.local.js"
    log "Восстановлен server/config.local.js"
  fi
}

http_status() {
  curl -sI "http://$SITE_DOMAIN" 2>/dev/null | head -n 1 | tr -d '\r'
}

show_diagnostics() {
  log "=== Диагностика ==="
  log "HTTP: $(http_status || echo 'недоступен')"
  log "--- .htaccess ---"
  [ -f "$PUBLIC_HTML/.htaccess" ] && cat "$PUBLIC_HTML/.htaccess"
  log "--- php ---"
  ls -la "$PUBLIC_HTML/api.php" "$PUBLIC_HTML/index.html" "$PUBLIC_HTML/php/config.local.php" 2>/dev/null || true
  if [ -f "$SITE_ROOT/${SITE_DOMAIN}.error.log" ]; then
    tail -20 "$SITE_ROOT/${SITE_DOMAIN}.error.log"
  fi
  log "Лог деплоя: $DEPLOY_LOG"
}

main() {
  log "===== Деплой Кожевня (PHP/HTML) на Beget ====="
  log "Пользователь: $BEGET_USER"
  log "Репозиторий: $GIT_REPO_URL ($GIT_BRANCH)"
  log "Сайт: $PUBLIC_HTML"

  if [[ "$GIT_REPO_URL" == *"YOUR_USER"* ]]; then
    fail "GIT_REPO_URL содержит YOUR_USER"
  fi

  need_cmd git
  need_cmd curl
  clone_or_update_repo
  write_htaccess
  sync_site
  fix_permissions

  local status
  status="$(http_status || true)"
  log "Проверка HTTP: ${status:-нет ответа}"

  if echo "$status" | grep -q "200"; then
    log "===== УСПЕХ: сайт отвечает 200 OK ====="
    log "Откройте: http://$SITE_DOMAIN"
    log "Журнал согласий: http://$SITE_DOMAIN/api/consent-journal"
    log "HTTPS: включите SSL (Let's Encrypt) в панели Beget"
    exit 0
  fi

  show_diagnostics
  fail "Сайт не ответил 200. Смотрите логи выше."
}

main "$@"
