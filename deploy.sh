#!/bin/bash
set -e

echo "🚀 pOky Bot VPS Deployment"
echo "=========================="

# ── 1. System-Updates ──
echo ""
echo "📦 System-Updates..."
apt update -y && apt upgrade -y

# ── 2. Node.js installieren (falls nicht vorhanden) ──
if ! command -v node &> /dev/null; then
  echo "📦 Node.js installieren..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi
echo "✅ Node.js: $(node -v)"
echo "✅ npm: $(npm -v)"

# ── 3. Git installieren (falls nicht vorhanden) ──
if ! command -v git &> /dev/null; then
  echo "📦 Git installieren..."
  apt install -y git
fi

# ── 4. PM2 installieren (falls nicht vorhanden) ──
if ! command -v pm2 &> /dev/null; then
  echo "📦 PM2 installieren..."
  npm install -g pm2
fi
echo "✅ PM2: $(pm2 -v)"

# ── 5. Projekt klonen ──
INSTALL_DIR="$HOME/poky-bot"
if [ -d "$INSTALL_DIR" ]; then
  echo "📂 Repo existiert schon, pull..."
  cd "$INSTALL_DIR"
  git pull origin main
else
  echo "📂 Repo klonen..."
  git clone https://github.com/pOky831/poky-bot.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# ── 6. Dependencies installieren ──
echo "📦 Dependencies installieren..."
npm install

# ── 7. TypeScript kompilieren ──
echo "🔨 TypeScript kompilieren..."
npx tsc || echo "⚠️ TypeScript Fehler – prüfe die Logs"

# ── 8. .env-Datei erstellen (falls nicht vorhanden) ──
if [ ! -f .env ]; then
  echo ""
  echo "⚠️  Keine .env-Datei gefunden! Erstelle eine Vorlage..."
  cat > .env <<'ENVEOF'
# Discord
DISCORD_TOKEN=HIER_EINSETZEN
CLIENT_ID=HIER_EINSETZEN
CLIENT_SECRET=HIER_EINSETZEN

# Dashboard
SESSION_SECRET=$(openssl rand -hex 32)
DASHBOARD_PORT=3000
DASHBOARD_CALLBACK_URL=http://HIER_DEINE_DOMAIN:3000/auth/discord/callback

# Turso DB (optional – lokales SQLite wird als Fallback verwendet)
# TURSO_DATABASE_URL=libsql://poky-bot-xxx.turso.io
# TURSO_AUTH_TOKEN=eyJhbG...
ENVEOF
  chmod 600 .env
  echo ""
  echo "📝 .env-Datei erstellt! Fülle die Werte aus:"
  echo "   nano $INSTALL_DIR/.env"
  echo ""
fi

# ── 9. PM2 starten ──
echo "🚀 Bot mit PM2 starten..."
pm2 delete poky-bot 2>/dev/null || true
pm2 start dist/index.js --name poky-bot
pm2 save

# ── 10. PM2 autostart einrichten ──
pm2 startup systemd -u "$USER" --hp "$HOME" 2>/dev/null || true

echo ""
echo "✅ Deployment abgeschlossen!"
echo "=========================="
echo "📊 Status:  pm2 status"
echo "📋 Logs:    pm2 logs poky-bot"
echo "🔄 Restart: pm2 restart poky-bot"
echo "🌐 Dashboard: http://localhost:3000"
echo ""
echo "⚠️  Falls du noch keine .env hattest:"
echo "   nano $INSTALL_DIR/.env"
echo "   pm2 restart poky-bot"
