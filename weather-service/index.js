const express = require('express');
const bodyParser = require('body-parser');
const Redis = require('ioredis');
const cors = require('cors');

const app = express();
// Enable CORS - default allow all origins for local development
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: CORS_ORIGIN }));
app.use(bodyParser.json());

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const PORT = parseInt(process.env.PORT || '4004', 10);
const DEFAULT_TTL = parseInt(process.env.DEFAULT_TTL || '3600', 10);

const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

// Seed initial data (only sets keys if they don't already exist)
async function seedInitialData() {
  const samples = [
    { city: 'oslo', tempC: 3.5, conditions: 'cloudy' },
    { city: 'london', tempC: 8.0, conditions: 'rain' },
    { city: 'newyork', tempC: 12.0, conditions: 'sunny' },
    { city: 'maribor', tempC: 12.0, conditions: 'sunny' },
    { city: 'ljubljana', tempC: 12.0, conditions: 'sunny' },
  ];

  for (const s of samples) {
    const key = `weather:${s.city}`;
    const now = new Date().toISOString();
    const value = { city: s.city, tempC: s.tempC, conditions: s.conditions, timestamp: now };
    try {
      // Use NX so we don't overwrite existing data
      const res = await redis.set(key, JSON.stringify(value), 'EX', DEFAULT_TTL, 'NX');
      if (res === 'OK') {
        console.log(`Seeded initial weather for ${s.city}`);
      } else {
        console.log(`Weather for ${s.city} already exists, skipping seed`);
      }
    } catch (err) {
      console.error('Error seeding', key, err);
    }
  }
}

// Health
app.get('/healthz', async (req, res) => {
  try {
    await redis.ping();
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: err.message });
  }
});

// Get weather for city
app.get('/weather/:city', async (req, res) => {
  const city = req.params.city.toLowerCase();
  const key = `weather:${city}`;
  try {
    const raw = await redis.get(key);
    if (!raw) return res.status(404).json({ error: 'not_found', message: 'no data for city' });
    const payload = JSON.parse(raw);

    // Get TTL in seconds. -2 = key does not exist, -1 = key exists but has no associated expire
    const ttlSeconds = await redis.ttl(key);
    let expiresAt = null;
    if (ttlSeconds > 0) {
      expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    }

    payload.source = 'cache';
    payload.ttl = ttlSeconds >= 0 ? ttlSeconds : null; // null if persistent or not applicable
    payload.expiresAt = expiresAt; // ISO string or null
    return res.json(payload);
  } catch (err) {
    console.error('GET error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// Put weather for city
app.put('/weather/:city', async (req, res) => {
  const city = req.params.city.toLowerCase();
  const key = `weather:${city}`;
  const { tempC, conditions, ttl } = req.body || {};
  if (typeof tempC !== 'number' || typeof conditions !== 'string') {
    return res.status(400).json({ error: 'invalid_input', message: 'Missing or invalid fields' });
  }
  const appliedTtl = Number.isInteger(ttl) && ttl > 0 ? ttl : DEFAULT_TTL;
  const now = new Date().toISOString();
  const value = { city, tempC, conditions, timestamp: now };
  try {
    await redis.set(key, JSON.stringify(value), 'EX', appliedTtl);
    return res.status(201).json({ city, ttl: appliedTtl, timestamp: now });
  } catch (err) {
    console.error('PUT error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// Delete
app.delete('/weather/:city', async (req, res) => {
  const city = req.params.city.toLowerCase();
  const key = `weather:${city}`;
  try {
    const removed = await redis.del(key);
    if (removed === 0) return res.status(404).json({ error: 'not_found', message: 'no data for city' });
    return res.status(204).send();
  } catch (err) {
    console.error('DELETE error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// Start server after ensuring Redis is reachable and seed initial data
(async () => {
  try {
    await redis.ping();
    await seedInitialData();
  } catch (err) {
    console.error('Warning: could not seed initial data, redis may be unavailable', err.message || err);
  }

  app.listen(PORT, () => {
    console.log(`weather-service listening on port ${PORT}, redis ${REDIS_HOST}:${REDIS_PORT}`);
  });
})();
