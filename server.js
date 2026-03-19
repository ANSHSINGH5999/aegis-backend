/*
  ╔═══════════════════════════════════════════╗
  ║   AEGIS SENTINEL — RENDER BACKEND         ║
  ║   Node.js + Express                       ║
  ║   Deploy on: render.com (free tier)       ║
  ╚═══════════════════════════════════════════╝

  ENDPOINTS:
  POST /update    ← ESP32 sends sensor data
  GET  /data      ← Frontend reads sensor data
  POST /control   ← Frontend sends commands
  GET  /control   ← ESP32 polls for commands
  GET  /health    ← Render health check
*/

const express = require('express');
const cors    = require('cors');
const app     = express();

app.use(cors());
app.use(express.json());

// ── In-memory store (no DB needed) ──
let sensorData = {
  temp:      0,
  gas:       0,
  fan:       false,
  alarm:     false,
  mode:      'auto',
  updatedAt: null
};

let controlState = {
  mode:      'auto',
  fan:       false,
  mute:      false,
  updatedAt: null
};

// ─────────────────────────────────────
// POST /update  ← ESP32 sends data here
// Body: { temp, gas, fan, alarm }
// ─────────────────────────────────────
app.post('/update', (req, res) => {
  const { temp, gas, fan, alarm } = req.body;

  if (temp === undefined || gas === undefined) {
    return res.status(400).json({ error: 'Missing fields: temp, gas required' });
  }

  sensorData = {
    temp:      parseFloat(temp),
    gas:       parseInt(gas),
    fan:       fan === true || fan === 'true',
    alarm:     alarm === true || alarm === 'true',
    mode:      controlState.mode,
    updatedAt: new Date().toISOString()
  };

  console.log(`[ESP32 → Server] temp=${temp}°C gas=${gas}ppm fan=${fan} alarm=${alarm}`);
  res.json({ ok: true });
});

// ─────────────────────────────────────
// GET /data  ← Frontend polls this
// ─────────────────────────────────────
app.get('/data', (req, res) => {
  const age = sensorData.updatedAt
    ? Math.floor((Date.now() - new Date(sensorData.updatedAt)) / 1000)
    : null;

  res.json({
    ...sensorData,
    esp32Online: age !== null && age < 10,  // offline if no update in 10s
    dataAgeSeconds: age
  });
});

// ─────────────────────────────────────
// POST /control  ← Frontend sends commands
// Body: { mode?, fan?, mute? }
// ─────────────────────────────────────
app.post('/control', (req, res) => {
  const { mode, fan, mute } = req.body;

  if (mode !== undefined) {
    if (!['auto', 'manual'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "auto" or "manual"' });
    }
    controlState.mode = mode;
  }

  if (fan !== undefined)  controlState.fan  = fan === true || fan === 'true';
  if (mute !== undefined) controlState.mute = mute === true || mute === 'true';

  controlState.updatedAt = new Date().toISOString();

  console.log(`[Frontend → Server] mode=${controlState.mode} fan=${controlState.fan} mute=${controlState.mute}`);
  res.json({ ok: true, control: controlState });
});

// ─────────────────────────────────────
// GET /control  ← ESP32 polls for commands
// ─────────────────────────────────────
app.get('/control', (req, res) => {
  res.json(controlState);
});

// ─────────────────────────────────────
// GET /health  ← Render health check
// ─────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    sensorData,
    controlState
  });
});

// ─────────────────────────────────────
// Root
// ─────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    service: 'AEGIS Sentinel Backend',
    version: '2.0',
    endpoints: {
      'POST /update':   'ESP32 → Server (sensor data)',
      'GET  /data':     'Frontend ← Server (sensor data)',
      'POST /control':  'Frontend → Server (commands)',
      'GET  /control':  'ESP32 ← Server (commands)',
      'GET  /health':   'Health check'
    }
  });
});

// ─────────────────────────────────────
// Start
// ─────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🛡  AEGIS Sentinel Backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});