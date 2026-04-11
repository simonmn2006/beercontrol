# 🍺 KegHero

**Draft Beer Management Platform** — Real-time monitoring for restaurant keg systems via ESP32 + MQTT.

## What it does

- Live dashboard showing keg levels, temperature, CO₂ pressure per tap
- Automatic keg change detection via FOB sensor
- Flow meter tracking with volume calculation
- Multi-restaurant SaaS — one server, multiple venues
- Email + Telegram alerts (low keg, offline devices, temperature)
- Reports, analytics, cost/revenue tracking per tap
- 5 languages: English, German, Spanish, Italian, Greek
- ESP32 firmware config generator with MQTT credentials

## Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (via better-sqlite3)
- **MQTT Broker:** Mosquitto (same server)
- **Auth:** Session-based with bcrypt
- **Frontend:** Vanilla JS + Chart.js

---

## Quick Start

### Requirements
- Node.js v18 or higher
- (Optional for ESP32 testing) Mosquitto MQTT broker

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/beercontrol.git
cd beercontrol
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with your settings (or leave defaults for local testing)
```

### 4. Create database + seed admin user
```bash
node server/setup-db.js
```

You'll see:
```
✓ Admin user created: admin@beercontrol.io / admin
✓ Demo restaurant: carlos@cerveceria.es / demo123
✅ Database ready at data/beercontrol.db
```

### 5. Start the server
```bash
npm start
```

### 6. Open browser
```
http://localhost:3000
```

Login with `admin@beercontrol.io` / `admin`

---

## Project Structure

```
beercontrol/
├── server/
│   ├── index.js          ← Express app, middleware, routes
│   ├── db.js             ← SQLite connection singleton
│   ├── setup-db.js       ← Database schema + seed data
│   └── routes/
│       ├── auth.js       ← Login / logout / session
│       ├── api.js        ← Restaurant user API endpoints
│       └── admin.js      ← Admin-only API endpoints
├── public/
│   ├── login.html        ← Login page (5 languages)
│   ├── app.html          ← Main dashboard (all pages)
│   └── uploads/          ← Beer logos (gitignored)
├── data/                 ← SQLite database (gitignored)
├── .env.example          ← Environment variables template
├── .gitignore
└── package.json
```

---

## Updating

When new changes are pushed to this repo:

```bash
git pull
npm install     # only if package.json changed
npm start
```

---

## MQTT Topic Structure

```
{restaurant_id}/keg/{tap_number}/sensor    ← ESP32 sensor publishes here
{restaurant_id}/keg/{tap_number}/display   ← Server publishes per-keg data here  
{restaurant_id}/display/bar_01             ← Server publishes all-kegs summary here
{restaurant_id}/system/heartbeat           ← ESP32 heartbeat every 30s
```

## ESP32 Sensor payload (JSON)
```json
{
  "flow": 0.42,
  "temp": 4.1,
  "co2": 2.4,
  "fob": false,
  "pulses": 189,
  "uptime": 3600
}
```

---

## License

Private — All rights reserved.
