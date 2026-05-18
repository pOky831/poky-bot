# 🚀 pOky Discord Bot – Komplettes Hosting-Tutorial für Kali Linux

Dieses Tutorial führt dich von Null zu einem 24/7 laufenden Discord-Bot mit öffentlich erreichbarem Web-Dashboard.

---

## 📋 Inhaltsverzeichnis

1. [Voraussetzungen](#1-voraussetzungen)
2. [Discord Application erstellen](#2-discord-application-erstellen)
3. [Projekt einrichten](#3-projekt-einrichten)
4. [Turso-Datenbank einrichten](#4-turso-datenbank-einrichten)
5. [.env-Datei konfigurieren](#5-env-datei-konfigurieren)
6. [Bot lokal testen](#6-bot-lokal-testen)
7. [Domain + Cloudflare Tunnel](#7-domain--cloudflare-tunnel)
8. [Discord OAuth2 Redirect konfigurieren](#8-discord-oauth2-redirect-konfigurieren)
9. [systemd-Services für 24/7-Betrieb](#9-systemd-services-für-247-betrieb)
10. [Laptop am Schlafen hindern](#10-laptop-am-schlafen-hindern)
11. [Cheatsheet – Alle Befehle](#11-cheatsheet--alle-befehle)

---

## 1. Voraussetzungen

### 1.1 Node.js installieren (falls nicht vorhanden)

```bash
# Prüfen ob Node.js installiert ist
node --version

# Falls nicht: installieren
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Prüfen
node --version   # sollte v20.x.x zeigen
npm --version    # sollte 10.x.x zeigen
```

### 1.2 Git installieren

```bash
sudo apt install -y git
```

### 1.3 Cloudflare Tunnel (cloudflared) installieren

```bash
# Download
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Prüfen
cloudflared --version
```

---

## 2. Discord Application erstellen

Gehe zum [Discord Developer Portal](https://discord.com/developers/applications):

1. **"New Application"** → Name: `pOky` (oder was du willst)
2. Links auf **"Bot"** klicken:
   - **"Add Bot"** bestätigen
   - **"Reset Token"** → Token kopieren und sicher aufbewahren – das ist `DISCORD_TOKEN`
   - Schalter umlegen:
     - ✅ **PRESENCE INTENT**
     - ✅ **SERVER MEMBERS INTENT**
     - ✅ **MESSAGE CONTENT INTENT**
   - **Save Changes**
3. Links auf **"OAuth2"** klicken:
   - **CLIENT ID** kopieren und merken
   - **CLIENT SECRET** → "Reset Secret" → kopieren und merken
   - Bei **Redirects** trägst du später deine Domain-URL ein (siehe Schritt 8)

### Bot auf deinen Server einladen

Ersetze `DEINE_CLIENT_ID` mit deiner echten Client-ID:

```
https://discord.com/oauth2/authorize?client_id=DEINE_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

Im Browser öffnen → Server auswählen → "Authorize".

---

## 3. Projekt einrichten

```bash
# Ins Projektverzeichnis
cd ~/.cursor/projects/empty-window/dc-allround-bot

# Abhängigkeiten installieren
npm install

# TypeScript kompilieren (optional – dev-Modus reicht)
npm run build
```

---

## 4. Turso-Datenbank einrichten

Der Bot nutzt Turso (LibSQL) als Datenbank. Kostenlos bis 9 GB.

1. Gehe auf [turso.tech](https://turso.tech) → **Sign Up** (GitHub-Login reicht)
2. **Create Database** → Name: `poky-bot`
3. Database auswählen → **"Show Token"** klicken
4. Kopiere die **URL** (Format: `libsql://poky-bot-xxx.turso.io`) und das **Auth Token**

```bash
# Alternativ per CLI:
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create poky-bot
turso db show poky-bot      # zeigt die URL
turso db tokens create poky-bot   # erstellt Auth Token
```

---

## 5. .env-Datei konfigurieren

Erstelle im Projektordner eine `.env`-Datei:

```bash
nano .env
```

**Inhalt (Werte ersetzen!):**

```env
# Discord
DISCORD_TOKEN=MTExMjIyMzMzNDQ0OTk4ODg3Nzc.MjIyM3N.ZmFrZS10b2tlbl9jaGFuZ2VfbWU
CLIENT_ID=1234567890123456789
CLIENT_SECRET=abc123def456_aus_dem_developer_portal

# Dashboard
SESSION_SECRET=SuperGeheimesPasswort123!Mindestens32ZeichenLang
DASHBOARD_PORT=3000
DASHBOARD_CALLBACK_URL=https://dashboard.deinedomain.de/auth/discord/callback

# Turso DB
TURSO_DATABASE_URL=libsql://poky-bot-deinname.turso.io
TURSO_AUTH_TOKEN=eyJhbG...dein_turso_token
```

> ⚠️ **Wichtig:** `.env` niemals committen oder teilen! Die Datei steht schon in `.gitignore`.

---

## 6. Bot lokal testen

```bash
# Entwicklungsmodus starten
npm run dev
```

Du solltest sehen:
```
🌐 Dashboard läuft auf http://localhost:3000
```

Teste:
- Bot sollte in Discord online erscheinen
- `http://localhost:3000` im Browser sollte die Landing-Page zeigen

**Mit `Ctrl+C` beenden** – wir richten jetzt den Dauerbetrieb ein.

---

## 7. Domain + Cloudflare Tunnel

### 7.1 Domain vorbereiten

Du brauchst eine eigene Domain. Wenn du noch keine hast:
- Kaufe eine bei [Porkbun](https://porkbun.com), [Namecheap](https://namecheap.com) oder [Cloudflare](https://cloudflare.com) (~5-10 €/Jahr)
- **Nameserver auf Cloudflare umstellen** (im Domain-Dashboard → Custom DNS → Nameserver: `ada.ns.cloudflare.com` und `carter.ns.cloudflare.com`)

### 7.2 Cloudflare Tunnel erstellen

```bash
# Bei Cloudflare authentifizieren (öffnet Browser)
cloudflared tunnel login

# Tunnel erstellen
cloudflared tunnel create poky-bot

# Ausgabe zeigt die Tunnel-ID – merken!
```

### 7.3 Tunnel-Konfiguration

```bash
# Konfigurationsdatei erstellen
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Ersetze `<TUNNEL-ID>` mit der ID aus Schritt 7.2:

```yaml
tunnel: <TUNNEL-ID>
credentials-file: /home/deinuser/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: dashboard.deinedomain.de
    service: http://localhost:3000
  - service: http_status:404
```

> ⚠️ Ersetze `dashboard.deinedomain.de` mit deiner echten (Sub-)Domain!

### 7.4 DNS-Route setzen

```bash
cloudflared tunnel route dns poky-bot dashboard.deinedomain.de
```

### 7.5 Tunnel testen

```bash
# In einem Terminal den Tunnel starten
cloudflared tunnel run poky-bot
```

Jetzt sollte `https://dashboard.deinedomain.de` dein Dashboard zeigen! 🎉

---

## 8. Discord OAuth2 Redirect konfigurieren

Zurück im [Discord Developer Portal](https://discord.com/developers/applications):

1. Deine App auswählen
2. Links auf **"OAuth2"**
3. Im Feld **"Redirects"** eintragen:
   ```
   https://dashboard.deinedomain.de/auth/discord/callback
   ```
4. **Save Changes**

Stelle sicher, dass in deiner `.env` die gleiche URL steht:
```env
DASHBOARD_CALLBACK_URL=https://dashboard.deinedomain.de/auth/discord/callback
```

---

## 9. systemd-Services für 24/7-Betrieb

Damit Bot und Tunnel automatisch starten, bei Absturz neu starten und nach Reboots wieder hochkommen.

### 9.1 Bot-Service

```bash
sudo nano /etc/systemd/system/poky-bot.service
```

```ini
[Unit]
Description=pOky Discord Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=deinuser
WorkingDirectory=/home/deinuser/.cursor/projects/empty-window/dc-allround-bot
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

> ⚠️ **`deinuser`** durch deinen echten Linux-Benutzernamen ersetzen!
> ⚠️ `WorkingDirectory`-Pfad prüfen und ggf. anpassen!

### 9.2 Cloudflare-Tunnel-Service

```bash
sudo nano /etc/systemd/system/cloudflare-tunnel.service
```

```ini
[Unit]
Description=Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=deinuser
ExecStart=/usr/bin/cloudflared tunnel run poky-bot
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 9.3 Services aktivieren und starten

```bash
# systemd neu laden
sudo systemctl daemon-reload

# Services aktivieren (starten automatisch bei Boot)
sudo systemctl enable poky-bot
sudo systemctl enable cloudflare-tunnel

# Jetzt sofort starten
sudo systemctl start poky-bot
sudo systemctl start cloudflare-tunnel

# Status prüfen
sudo systemctl status poky-bot
sudo systemctl status cloudflare-tunnel
```

### 9.4 Nützliche systemd-Befehle

```bash
# Status anzeigen
sudo systemctl status poky-bot

# Logs anzeigen (live)
sudo journalctl -u poky-bot -f

# Neustarten
sudo systemctl restart poky-bot

# Stoppen
sudo systemctl stop poky-bot
```

---

## 10. Laptop am Schlafen hindern

Damit der Laptop nicht in den Standby geht wenn der Deckel zugeklappt wird:

```bash
sudo nano /etc/systemd/logind.conf
```

Diese Zeilen suchen und wie folgt setzen (entkommentieren, d.h. `#` entfernen):

```ini
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
```

Danach:

```bash
sudo systemctl restart systemd-logind
```

**Zusätzlich:** In den Kali-Energieeinstellungen (GUI) oder via:

```bash
# Bildschirm nicht automatisch ausschalten
gsettings set org.gnome.desktop.session idle-delay 0

# Suspend deaktivieren wenn Netzteil angeschlossen
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
```

---

## 11. Cheatsheet – Alle Befehle auf einen Blick

```bash
# === EINMALIGE EINRICHTUNG ===

# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Projekt
cd ~/.cursor/projects/empty-window/dc-allround-bot
npm install

# .env erstellen (Werte eintragen!)
nano .env

# Cloudflare Tunnel
cloudflared tunnel login
cloudflared tunnel create poky-bot
nano ~/.cloudflared/config.yml
cloudflared tunnel route dns poky-bot dashboard.deinedomain.de

# systemd-Services
sudo nano /etc/systemd/system/poky-bot.service
sudo nano /etc/systemd/system/cloudflare-tunnel.service
sudo systemctl daemon-reload
sudo systemctl enable --now poky-bot cloudflare-tunnel

# Laptop wach halten
sudo nano /etc/systemd/logind.conf   # HandleLidSwitch=ignore setzen
sudo systemctl restart systemd-logind

# === TÄGLICHER BETRIEB ===

# Status prüfen
sudo systemctl status poky-bot cloudflare-tunnel

# Logs live ansehen
sudo journalctl -u poky-bot -f

# Neustart nach Code-Änderungen
sudo systemctl restart poky-bot
```

---

## ✅ Erfolgskontrolle

Am Ende sollte alles funktionieren:

| Check | Wie prüfen? |
|-------|-------------|
| Bot online? | Bot erscheint in Discord als "online" |
| Dashboard lokal? | `curl http://localhost:3000` |
| Dashboard öffentlich? | `https://dashboard.deinedomain.de` im Browser |
| Login funktioniert? | Auf "Login mit Discord" klicken → Discord OAuth → Dashboard erscheint |
| Auto-Start? | `sudo reboot`, danach `sudo systemctl status poky-bot cloudflare-tunnel` |

---

Bei Fragen oder Problemen – einfach fragen! 🚀
