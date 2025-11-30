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

// List all cached weather entries (GET /weather)
app.get('/weather', async (req, res) => {
  try {
    const keys = await redis.keys('weather:*');
    if (!keys || keys.length === 0) return res.json([]);
    const values = await redis.mget(...keys);
    const results = [];
    for (let i = 0; i < keys.length; i++) {
      const raw = values[i];
      if (!raw) continue;
      const obj = JSON.parse(raw);
      const ttlSeconds = await redis.ttl(keys[i]);
      let expiresAt = null;
      if (ttlSeconds > 0) expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      results.push({ ...obj, source: 'cache', ttl: ttlSeconds >= 0 ? ttlSeconds : null, expiresAt });
    }
    return res.json(results);
  } catch (err) {
    console.error('LIST error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// POST /weather - create a weather entry (body: { city, tempC, conditions, ttl? })
app.post('/weather', async (req, res) => {
  const { city, tempC, conditions, ttl } = req.body || {};
  if (!city || typeof tempC !== 'number' || typeof conditions !== 'string') {
    return res.status(400).json({ error: 'invalid_input', message: 'city, tempC(number) and conditions(string) are required' });
  }
  const key = `weather:${city.toLowerCase()}`;
  const now = new Date().toISOString();
  const value = { city: city.toLowerCase(), tempC, conditions, timestamp: now };
  const appliedTtl = Number.isInteger(ttl) && ttl >= 0 ? ttl : DEFAULT_TTL;
  try {
    if (appliedTtl > 0) await redis.set(key, JSON.stringify(value), 'EX', appliedTtl);
    else await redis.set(key, JSON.stringify(value));
    return res.status(201).json({ city: value.city, ttl: appliedTtl, timestamp: now });
  } catch (err) {
    console.error('POST error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// POST /weather/bulk - create multiple entries (body: [{city,tempC,conditions,ttl?}, ...])
app.post('/weather/bulk', async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  if (!items.length) return res.status(400).json({ error: 'invalid_input', message: 'Expecting array in request body' });
  const results = [];
  for (const it of items) {
    const { city, tempC, conditions, ttl } = it;
    if (!city || typeof tempC !== 'number' || typeof conditions !== 'string') continue;
    const key = `weather:${city.toLowerCase()}`;
    const now = new Date().toISOString();
    const value = { city: city.toLowerCase(), tempC, conditions, timestamp: now };
    const appliedTtl = Number.isInteger(ttl) && ttl >= 0 ? ttl : DEFAULT_TTL;
    try {
      if (appliedTtl > 0) await redis.set(key, JSON.stringify(value), 'EX', appliedTtl);
      else await redis.set(key, JSON.stringify(value));
      results.push({ city: value.city, ttl: appliedTtl, timestamp: now });
    } catch (err) {
      console.error('BULK POST error', key, err);
    }
  }
  return res.status(201).json(results);
});

// PUT /weather/:city - update/create single (existing behavior)
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
    if (appliedTtl > 0) {
      await redis.set(key, JSON.stringify(value), 'EX', appliedTtl);
    } else {
      await redis.set(key, JSON.stringify(value));
    }
    return res.status(201).json({ city, ttl: appliedTtl, timestamp: now });
  } catch (err) {
    console.error('PUT error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// PUT /weather/bulk - update multiple entries (body: array like POST /weather/bulk)
app.put('/weather/bulk', async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  if (!items.length) return res.status(400).json({ error: 'invalid_input', message: 'Expecting array in request body' });
  const results = [];
  for (const it of items) {
    const { city, tempC, conditions, ttl } = it;
    if (!city || typeof tempC !== 'number' || typeof conditions !== 'string') continue;
    const key = `weather:${city.toLowerCase()}`;
    const now = new Date().toISOString();
    const value = { city: city.toLowerCase(), tempC, conditions, timestamp: now };
    const appliedTtl = Number.isInteger(ttl) && ttl >= 0 ? ttl : DEFAULT_TTL;
    try {
      if (appliedTtl > 0) await redis.set(key, JSON.stringify(value), 'EX', appliedTtl);
      else await redis.set(key, JSON.stringify(value));
      results.push({ city: value.city, ttl: appliedTtl, timestamp: now });
    } catch (err) {
      console.error('BULK PUT error', key, err);
    }
  }
  return res.status(200).json(results);
});

// Delete single city
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

// DELETE /weather - bulk delete by cities array in body or delete all if ?all=1
app.delete('/weather', async (req, res) => {
  const { cities } = req.body || {};
  const deleteAll = req.query.all === '1';
  try {
    if (deleteAll) {
      const keys = await redis.keys('weather:*');
      if (keys.length === 0) return res.status(204).send();
      await redis.del(...keys);
      return res.status(204).send();
    }
    if (!Array.isArray(cities) || cities.length === 0) return res.status(400).json({ error: 'invalid_input', message: 'Provide cities array in body or use ?all=1' });
    const keys = cities.map((c) => `weather:${String(c).toLowerCase()}`);
    await redis.del(...keys);
    return res.status(204).send();
  } catch (err) {
    console.error('BULK DELETE error', err);
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
