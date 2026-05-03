#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Music Game 2 — update / redeploy script (runs on the server)
#
# Pulls latest from GitHub, reinstalls deps, rebuilds the client, restarts
# the systemd service. Safe to run repeatedly — npm install is incremental.
#
#   curl -sSL https://raw.githubusercontent.com/roiahav/Music-Game-2/main/deploy/update.sh | bash
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
GREEN='\033[1;32m'; CYAN='\033[1;36m'; RESET='\033[0m'
banner() { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()     { echo -e "${GREEN}  ✓ $1${RESET}"; }

SETUP_USER="${SUDO_USER:-$USER}"
APP_DIR="$(getent passwd "$SETUP_USER" | cut -d: -f6)/music-game-2"

banner "Pulling latest from GitHub"
git -C "$APP_DIR" fetch --all
git -C "$APP_DIR" reset --hard origin/main
ok "$(git -C "$APP_DIR" rev-parse --short HEAD) — $(git -C "$APP_DIR" log -1 --pretty=%s)"

banner "npm install (server)"
cd "$APP_DIR/server" && npm install --no-audit --no-fund

banner "npm install + build (client)"
cd "$APP_DIR/client" && npm install --no-audit --no-fund && npm run build
ok "client rebuilt"

banner "Restarting service"
sudo systemctl restart music-game
sleep 1
sudo systemctl status music-game --no-pager -n 5 || true
ok "service restarted"
