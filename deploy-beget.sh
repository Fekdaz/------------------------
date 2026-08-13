#!/usr/bin/env bash
# =============================================================================
# Кожевня — автодеплой на Beget (tennerg.ru)
#
# Использование:
#   1) Загрузите этот файл на сервер, например в ~/tennerg.ru/
#   2) Запустите:  bash deploy-beget.sh
#
# Для приватного репозитория:
#   export GITHUB_TOKEN="ghp_..."
#   export GIT_REPO_URL="https://${GITHUB_TOKEN}@github.com/Fekdaz/------------------------.git"
#   bash deploy-beget.sh
# =============================================================================

# --- НАСТРОЙКИ ---------------------------------------------------------------

GIT_REPO_URL="${GIT_REPO_URL:-https://github.com/Fekdaz/------------------------.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"

SITE_SLUG="${SITE_SLUG:-tennerg.ru}"        # папка сайта на Beget
APP_DIR_NAME="${APP_DIR_NAME:-kozhevnya}"   # папка приложения внутри сайта
SITE_DOMAIN="${SITE_DOMAIN:-tennerg.ru}"    # домен для проверки

MAX_FIX_ATTEMPTS="${MAX_FIX_ATTEMPTS:-4}"

# --- служебные пути (обычно менять не нужно) ---------------------------------

BEGET_USER="${BEGET_USER:-$(whoami)}"
HOME_DIR="${HOME:-/home/${BEGET_USER:0:1}/$BEGET_USER}"
SITE_ROOT="$HOME_DIR/$SITE_SLUG"
APP_ROOT="$SITE_ROOT/$APP_DIR_NAME"
PUBLIC_HTML="$SITE_ROOT/public_html"
NODE_BIN="$HOME_DIR/.local/bin/node"
NPM_BIN="$HOME_DIR/.local/bin/npm"
DEPLOY_LOG="$HOME_DIR/deploy-beget-$SITE_SLUG.log"
BACKUP_DIR="$HOME_DIR/.kozhevnya-deploy-backups"

# =============================================================================

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$line"
  mkdir -p "$(dirname "$DEPLOY_LOG")" 2>/dev/null || true
  echo "$line" >>"$DEPLOY_LOG" 2>/dev/null || true
}

warn() {
  log "WARN: $*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Команда '$1' не найдена. Установите её и повторите."
}

backup_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  mkdir -p "$BACKUP_DIR"
  cp -f "$file" "$BACKUP_DIR/$(basename "$file").$(date +%Y%m%d-%H%M%S).bak"
}

write_htaccess() {
  mkdir -p "$PUBLIC_HTML"
  # Только директивы из инструкции Beget. Лишние (PassengerLogLevel,
  # PassengerFriendlyErrorPages) дают Apache 500: "not allowed here".
  cat >"$PUBLIC_HTML/.htaccess" <<EOF
PassengerNodejs $NODE_BIN
PassengerAppRoot $APP_ROOT
PassengerAppType node
PassengerStartupFile passenger.cjs
EOF
  log "Обновлён $PUBLIC_HTML/.htaccess"
}

ensure_dirs() {
  mkdir -p "$APP_ROOT/tmp" "$PUBLIC_HTML" "$BACKUP_DIR"
}

fix_permissions() {
  log "Исправляю права доступа..."
  chmod -R u+rwX,go+rX "$APP_ROOT" 2>/dev/null || true
  chmod -R u+rwX,go+rX "$PUBLIC_HTML" 2>/dev/null || true
  if [ -d "$HOME_DIR/.local" ]; then
    chmod -R u+rwX,go+rX "$HOME_DIR/.local" 2>/dev/null || true
  fi
}

check_node() {
  if [ -x "$NODE_BIN" ]; then
    log "Node: $("$NODE_BIN" -v)"
    return 0
  fi
  warn "Node не найден: $NODE_BIN"
  warn "Установите Node в ~/.local (см. https://beget.com/ru/kb/how-to/web-apps/node-js)"
  warn "И откройте общий доступ к ~/.local в файловом менеджере Beget."
  return 1
}

check_repo_url() {
  if [[ "$GIT_REPO_URL" == *"YOUR_USER"* ]]; then
    fail "Укажите GIT_REPO_URL в начале deploy-beget.sh или через: export GIT_REPO_URL='https://github.com/...'"
  fi
}

clone_or_update_repo() {
  ensure_dirs
  backup_file "$APP_ROOT/server/config.local.js"
  backup_file "$APP_ROOT/js/legal-config.local.js"

  if [ -d "$APP_ROOT/.git" ]; then
    log "Обновляю репозиторий (git pull)..."
    git -C "$APP_ROOT" fetch origin "$GIT_BRANCH"
    git -C "$APP_ROOT" reset --hard "origin/$GIT_BRANCH"
  else
    log "Клонирую репозиторий..."
    if [ -d "$APP_ROOT" ] && [ "$(ls -A "$APP_ROOT" 2>/dev/null)" ]; then
      warn "Папка $APP_ROOT не пуста — переношу в резервную копию"
      mv "$APP_ROOT" "${APP_ROOT}.bak.$(date +%Y%m%d-%H%M%S)"
    fi
    git clone --branch "$GIT_BRANCH" --depth 1 "$GIT_REPO_URL" "$APP_ROOT"
  fi

  # Восстановить локальные конфиги, если были
  local latest_config
  latest_config="$(ls -t "$BACKUP_DIR"/config.local.js.*.bak 2>/dev/null | head -1 || true)"
  if [ -n "$latest_config" ] && [ ! -f "$APP_ROOT/server/config.local.js" ]; then
    mkdir -p "$APP_ROOT/server"
    cp -f "$latest_config" "$APP_ROOT/server/config.local.js"
    log "Восстановлен server/config.local.js из бэкапа"
  fi

  if [ ! -f "$APP_ROOT/server/config.local.js" ] && [ -f "$APP_ROOT/server/config.example.js" ]; then
    cp "$APP_ROOT/server/config.example.js" "$APP_ROOT/server/config.local.js"
    warn "Создан server/config.local.js из примера — заполните SMTP и домен!"
  fi

  if [ ! -f "$APP_ROOT/js/legal-config.local.js" ] && [ -f "$APP_ROOT/js/legal-config.local.example.js" ]; then
    cp "$APP_ROOT/js/legal-config.local.example.js" "$APP_ROOT/js/legal-config.local.js"
    log "Создан js/legal-config.local.js из примера"
  fi
}

install_dependencies() {
  log "Устанавливаю зависимости (npm ci)..."
  cd "$APP_ROOT"

  if [ -x "$NPM_BIN" ]; then
    "$NPM_BIN" ci
  elif command -v npm >/dev/null 2>&1; then
    npm ci
  else
    fail "npm не найден. Установите Node.js в ~/.local"
  fi
}

build_production_bundle() {
  log "Собираю production-бандл для Passenger..."
  cd "$APP_ROOT"
  if [ -x "$NPM_BIN" ]; then
    "$NPM_BIN" run build:beget
  else
    npm run build:beget
  fi
  [ -f "$APP_ROOT/dist/beget.cjs" ] || fail "Не создан dist/beget.cjs"
}

smoke_test_bundle() {
  log "Проверяю бандл и зависимости..."
  cd "$APP_ROOT"
  local node_cmd="$NODE_BIN"
  [ -x "$node_cmd" ] || node_cmd="node"

  "$node_cmd" --check "$APP_ROOT/dist/beget.cjs" || fail "dist/beget.cjs: синтаксическая ошибка"

  NODE_PATH="$APP_ROOT/node_modules" "$node_cmd" -e "require('express'); require('nodemailer'); console.log('deps ok')" \
    || fail "Не загружаются express/nodemailer. Выполните npm ci в $APP_ROOT"
}

restart_passenger() {
  mkdir -p "$APP_ROOT/tmp"
  chmod -R u+rwX,go+rX "$APP_ROOT/tmp" 2>/dev/null || true
  touch "$APP_ROOT/tmp/restart.txt"
  log "Passenger перезапущен (tmp/restart.txt)"
  sleep 6
}

http_status() {
  curl -sI "http://$SITE_DOMAIN" 2>/dev/null | head -n 1 | tr -d '\r'
}

show_diagnostics() {
  log "=== Диагностика ==="
  log "HTTP: $(http_status || echo 'недоступен')"
  log "--- .htaccess ---"
  [ -f "$PUBLIC_HTML/.htaccess" ] && cat "$PUBLIC_HTML/.htaccess" || log "нет $PUBLIC_HTML/.htaccess"
  log "--- passenger-debug.log (хвост) ---"
  [ -f "$APP_ROOT/tmp/passenger-debug.log" ] && tail -40 "$APP_ROOT/tmp/passenger-debug.log" || log "нет passenger-debug.log — Node, скорее всего, не стартовал"
  log "--- error.log (not allowed / passenger) ---"
  if [ -f "$SITE_ROOT/${SITE_DOMAIN}.error.log" ]; then
    grep -E "not allowed|Passenger|passenger" "$SITE_ROOT/${SITE_DOMAIN}.error.log" | tail -20 || tail -20 "$SITE_ROOT/${SITE_DOMAIN}.error.log"
  fi
  log "Проверьте в панели Beget: общий доступ к ~/.local (чтение и запись, включая вложенные)"
  log "Лог деплоя: $DEPLOY_LOG"
}

auto_fix() {
  local attempt="$1"
  log "--- Автоисправление, попытка $attempt ---"
  fix_permissions
  write_htaccess
  cd "$APP_ROOT" || return 1
  if [ ! -f "$APP_ROOT/dist/beget.cjs" ]; then
    build_production_bundle || true
  fi
  if [ ! -d "$APP_ROOT/node_modules" ]; then
    install_dependencies || true
  fi
  restart_passenger
  sleep 3
}

deploy_once() {
  check_repo_url
  need_cmd git
  need_cmd curl
  check_node || warn "Продолжаю без проверки Node — Passenger может не запуститься"
  clone_or_update_repo
  write_htaccess
  fix_permissions
  install_dependencies
  build_production_bundle
  smoke_test_bundle
  restart_passenger
}

main() {
  log "===== Старт деплоя Кожевня на Beget ====="
  log "Пользователь: $BEGET_USER"
  log "Приложение: $APP_ROOT"
  log "Репозиторий: $GIT_REPO_URL ($GIT_BRANCH)"

  deploy_once

  local attempt=1
  local status
  while [ "$attempt" -le "$MAX_FIX_ATTEMPTS" ]; do
    status="$(http_status || true)"
    log "Проверка HTTP ($attempt/$MAX_FIX_ATTEMPTS): ${status:-нет ответа}"

    if echo "$status" | grep -q "200"; then
      log "===== УСПЕХ: сайт отвечает 200 OK ====="
      log "Откройте: http://$SITE_DOMAIN"
      log "HTTPS: включите SSL (Let's Encrypt) в панели Beget"
      exit 0
    fi

    if echo "$status" | grep -q "500"; then
      auto_fix "$attempt"
    else
      warn "Сайт не отвечает или ответ не 200/500 — проверьте DNS/SSL"
      auto_fix "$attempt"
    fi

    attempt=$((attempt + 1))
  done

  show_diagnostics
  fail "Деплой завершён с ошибкой. Смотрите логи выше и $DEPLOY_LOG"
}

main "$@"
