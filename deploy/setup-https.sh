#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Music Game 2 — HTTPS reverse proxy setup
#
# Puts Caddy in front of the Node server on the same machine and gets a
# Let's Encrypt certificate automatically. Optionally sets up a cron job
# that pings DuckDNS every 5 minutes so the A record stays in sync with
# your home's public IP.
#
# Required env: DOMAIN (e.g. oriahav.duckdns.org)
# Optional env: DUCKDNS_TOKEN (enable DDNS updater)
#
# Run on the server:
#   DOMAIN=oriahav.duckdns.org \
#   DUCKDNS_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
#   curl -sSL https://raw.githubusercontent.com/roiahav/Music-Game-2/main/deploy/setup-https.sh | bash
#
# Before running, make sure:
#   1. Ports 80 and 443 are forwarded in your home router to this machine.
#   2. The DOMAIN already resolves to your public IP (DuckDNS dashboard).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
GREEN='\033[1;32m'; CYAN='\033[1;36m'; RED='\033[1;31m'; RESET='\033[0m'
banner() { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()     { echo -e "${GREEN}  ✓ $1${RESET}"; }
fail()   { echo -e "${RED}  ✗ $1${RESET}"; }

DOMAIN="${DOMAIN:-}"
DUCKDNS_TOKEN="${DUCKDNS_TOKEN:-}"
UPSTREAM_PORT="${UPSTREAM_PORT:-3000}"

if [ -z "$DOMAIN" ]; then
  fail "DOMAIN is required (e.g. DOMAIN=oriahav.duckdns.org)"
  exit 1
fi

banner "[1/4] Installing Caddy"
if command -v caddy >/dev/null 2>&1; then
  ok "Caddy already installed: $(caddy version | head -1)"
else
  sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt update
  sudo apt install -y caddy
  ok "Caddy installed"
fi

banner "[2/4] Writing Caddyfile for $DOMAIN"
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDYEOF
$DOMAIN {
    encode gzip zstd
    reverse_proxy 127.0.0.1:$UPSTREAM_PORT {
        # Forward original client info so Express's "trust proxy" can use it
        header_up X-Real-IP {remote_host}
    }
    # Generous body limit for music uploads (matches multer's 200MB)
    request_body {
        max_size 200MB
    }
    # Long-lived websocket connections for socket.io
    @websockets {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @websockets 127.0.0.1:$UPSTREAM_PORT
}
CADDYEOF
sudo systemctl reload caddy 2>/dev/null || sudo systemctl restart caddy
sleep 1
sudo systemctl status caddy --no-pager -n 3 || true
ok "Caddyfile installed"

banner "[3/4] Firewall — open 80+443, drop external 3000"
sudo ufw allow 80/tcp  >/dev/null
sudo ufw allow 443/tcp >/dev/null
sudo ufw delete allow 3000/tcp >/dev/null 2>&1 || true
sudo ufw --force enable >/dev/null
ok "ufw rules updated"

banner "[4/4] DuckDNS auto-updater"
if [ -n "$DUCKDNS_TOKEN" ]; then
  SUBDOMAIN="${DOMAIN%%.*}"
  sudo tee /etc/cron.d/music-game-duckdns >/dev/null <<CRONEOF
# Music Game — DuckDNS dynamic-DNS updater. Runs every 5 minutes; an
# empty &ip= lets DuckDNS use the request source IP automatically.
*/5 * * * * root curl -fsS "https://www.duckdns.org/update?domains=$SUBDOMAIN&token=$DUCKDNS_TOKEN&ip=" -o /tmp/duckdns.last 2>&1
CRONEOF
  sudo chmod 644 /etc/cron.d/music-game-duckdns
  # Trigger an update immediately so the IP is fresh right now
  curl -fsS "https://www.duckdns.org/update?domains=$SUBDOMAIN&token=$DUCKDNS_TOKEN&ip=" -o /tmp/duckdns.last 2>&1 || true
  ok "DuckDNS cron installed (every 5 min); current ping: $(cat /tmp/duckdns.last 2>/dev/null || echo unknown)"
else
  echo "  (skipped — no DUCKDNS_TOKEN provided)"
fi

PUBIP=$(curl -fsS https://api.ipify.org 2>/dev/null || echo unknown)
echo
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗"
echo -e "║  HTTPS reverse proxy ready                                   ║"
echo -e "║  Domain:    $DOMAIN"
echo -e "║  Public IP: $PUBIP"
echo -e "║                                                              ║"
echo -e "║  Open in your browser (give Let's Encrypt ~30s on first hit):║"
echo -e "║  https://$DOMAIN                                             ║"
echo -e "╚══════════════════════════════════════════════════════════════╝${RESET}"
echo
echo "Reminder: ports 80 and 443 must be forwarded in your router to this server."
