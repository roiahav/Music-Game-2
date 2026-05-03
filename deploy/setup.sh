#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Music Game 2 — first-time server setup script (Ubuntu 22.04 / 24.04 / 26.04)
#
# Run from a fresh Ubuntu Server install:
#   curl -sSL https://raw.githubusercontent.com/roiahav/Music-Game-2/main/deploy/setup.sh | bash
#
# Or, if you want to pin to a specific commit / branch:
#   curl -sSL https://raw.githubusercontent.com/roiahav/Music-Game-2/<branch>/deploy/setup.sh | bash
#
# What it does:
#   1. apt update + base packages (git, curl, build-essential, ufw)
#   2. Node.js 22 LTS via NodeSource
#   3. Clones the repo to ~/music-game-2 (idempotent: skips if already there)
#   4. npm install for server + client, builds the client to dist/
#   5. Creates a systemd service that auto-starts on boot + restarts on crash
#   6. Configures ufw to allow SSH + port 3000
#   7. Starts the service and prints status
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Colors for the progress banners
GREEN='\033[1;32m'; CYAN='\033[1;36m'; RED='\033[1;31m'; RESET='\033[0m'
banner() { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()     { echo -e "${GREEN}  ✓ $1${RESET}"; }
fail()   { echo -e "${RED}  ✗ $1${RESET}"; }

# Detect the invoking user (when we hit `sudo` later, $USER is preserved)
SETUP_USER="${SUDO_USER:-$USER}"
SETUP_HOME="$(getent passwd "$SETUP_USER" | cut -d: -f6)"
APP_DIR="$SETUP_HOME/music-game-2"
REPO_URL="https://github.com/roiahav/Music-Game-2.git"
NODE_BIN="/usr/bin/node"

banner "[1/7] System update + base packages"
sudo apt update -y
sudo apt install -y git curl wget build-essential ca-certificates gnupg ufw
ok "apt packages installed"

banner "[2/7] Node.js 22 LTS"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi
ok "node $(node -v) / npm $(npm -v)"

banner "[3/7] Clone (or refresh) the repo at $APP_DIR"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --all
  git -C "$APP_DIR" reset --hard origin/main
  ok "existing clone refreshed to latest main"
else
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
  ok "fresh clone complete"
fi

banner "[4/7] Server dependencies"
cd "$APP_DIR/server"
npm install --no-audit --no-fund
ok "server deps installed"

banner "[5/7] Client dependencies + production build"
cd "$APP_DIR/client"
npm install --no-audit --no-fund
npm run build
ok "client built to $APP_DIR/client/dist"

banner "[6/7] systemd service (auto-start + auto-restart)"
SERVICE_FILE=/etc/systemd/system/music-game.service
sudo tee "$SERVICE_FILE" >/dev/null <<SERVICE_EOF
[Unit]
Description=Music Game Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SETUP_USER
Group=$SETUP_USER
WorkingDirectory=$APP_DIR/server
ExecStart=$NODE_BIN $APP_DIR/server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
StandardOutput=journal
StandardError=journal
SyslogIdentifier=music-game
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SERVICE_EOF

sudo systemctl daemon-reload
sudo systemctl enable music-game
sudo systemctl restart music-game
ok "service installed and started"

banner "[7/7] Firewall (allow SSH + port 3000)"
sudo ufw allow ssh
sudo ufw allow 3000/tcp
sudo ufw --force enable
ok "ufw enabled — only SSH and 3000 are open"

banner "Done — service status"
sleep 2
sudo systemctl status music-game --no-pager -n 8 || true

LAN_IP=$(hostname -I | awk '{print $1}')
echo
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗"
echo -e "║  Music Game server is up!                                    ║"
echo -e "║  Open in your browser:  http://$LAN_IP:3000$(printf '%*s' $((20 - ${#LAN_IP})) '')║"
echo -e "╚══════════════════════════════════════════════════════════════╝${RESET}"
echo
echo "Next steps:"
echo "  1. Copy data files (settings.json, favorites.json, data/) from your dev machine"
echo "  2. Copy MP3 library to ~/music"
echo "  3. Update playlist paths in settings.json from C:\\\\... to /home/$SETUP_USER/music/"
echo "  4. Restart the service: sudo systemctl restart music-game"
