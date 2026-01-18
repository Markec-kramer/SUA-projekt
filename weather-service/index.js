const express = require('express');
const bodyParser = require('body-parser');
const Redis = require('ioredis');
const cors = require('cors');
const yaml = require('js-yaml');
const { v4: uuidv4 } = require('uuid');
const { initializeLogger, logger, closeLogger } = require('./logger');

const app = express();
// Enable CORS - default allow all origins for local development
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(bodyParser.json());

// ===== CORRELATION ID MIDDLEWARE =====
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
});

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const PUBLIC_KEY_PATH = process.env.JWT_PUBLIC_KEY_PATH || path.join(__dirname, '..', 'auth', 'public.pem');
let PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || null;
if (!PUBLIC_KEY && fs.existsSync(PUBLIC_KEY_PATH)) PUBLIC_KEY = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'authorization_required' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'invalid_auth_header' });
  const token = parts[1];
  try {
    const decoded = PUBLIC_KEY ? jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] }) : jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_or_expired_token' });
  }
}

// Health endpoint - BEFORE auth middleware (public endpoint)
app.get('/healthz', async (req, res) => {
  try {
    await redis.ping();
    logger.info(req.path, req.correlationId, 'Health check passed');
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Health check failed: ${err.message}`);
    res.status(503).json({ status: 'unavailable', error: err.message });
  }
});

app.use(authMiddleware);

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const PORT = parseInt(process.env.PORT || '4004', 10);
const DEFAULT_TTL = parseInt(process.env.DEFAULT_TTL || '3600', 10);

const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

// Swagger (dev only) - load openapi.yaml if present
if (process.env.SWAGGER_ENABLED === '1' || process.env.NODE_ENV === 'development') {
  try {
    const swaggerUi = require('swagger-ui-express');
    const specRaw = fs.readFileSync(require('path').join(__dirname, 'openapi.yaml'), 'utf8');
    const swaggerSpec = yaml.load(specRaw);
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  } catch (err) {
    console.warn('Swagger openapi.yaml not found or failed to load:', err.message || err);
  }
}

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


/**
 * @openapi
 * /weather/{city}:
 *   get:
 *     summary: Get weather for a city
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Weather object
 */
app.get('/weather/:city', async (req, res) => {
  const city = req.params.city.toLowerCase();
  const key = `weather:${city}`;
  try {
    logger.info(req.path, req.correlationId, `Fetching weather for city: ${city}`);
    const raw = await redis.get(key);
    if (!raw) {
      logger.info(req.path, req.correlationId, `No data found for city: ${city}`);
      return res.status(404).json({ error: 'not_found', message: 'no data for city' });
    }
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
    logger.info(req.path, req.correlationId, `Successfully retrieved weather for city: ${city}`);
    return res.json(payload);
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error fetching weather for city ${city}: ${err.message}`);
    console.error('GET error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// List all cached weather entries (GET /weather)
app.get('/weather', async (req, res) => {
  try {
    logger.info(req.path, req.correlationId, "Fetching all cached weather entries");
    const keys = await redis.keys('weather:*');
    if (!keys || keys.length === 0) {
      logger.info(req.path, req.correlationId, "No weather entries found in cache");
      return res.json([]);
    }
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
    logger.info(req.path, req.correlationId, `Retrieved ${results.length} weather entries from cache`);
    return res.json(results);
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error fetching weather entries: ${err.message}`);
    console.error('LIST error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// POST /weather - create a weather entry (body: { city, tempC, conditions, ttl? })
app.post('/weather', async (req, res) => {
  const { city, tempC, conditions, ttl } = req.body || {};
  if (!city || typeof tempC !== 'number' || typeof conditions !== 'string') {
    logger.error(req.path, req.correlationId, "Missing or invalid required fields: city, tempC, conditions");
    return res.status(400).json({ error: 'invalid_input', message: 'city, tempC(number) and conditions(string) are required' });
  }
  const key = `weather:${city.toLowerCase()}`;
  const now = new Date().toISOString();
  const value = { city: city.toLowerCase(), tempC, conditions, timestamp: now };
  const appliedTtl = Number.isInteger(ttl) && ttl >= 0 ? ttl : DEFAULT_TTL;
  try {
    logger.info(req.path, req.correlationId, `Creating weather entry for city: ${city}`);
    if (appliedTtl > 0) await redis.set(key, JSON.stringify(value), 'EX', appliedTtl);
    else await redis.set(key, JSON.stringify(value));
    logger.info(req.path, req.correlationId, `Weather entry for city ${city} created successfully`);
    return res.status(201).json({ city: value.city, ttl: appliedTtl, timestamp: now });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error creating weather entry for city ${city}: ${err.message}`);
    console.error('POST error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// POST /weather/bulk - create multiple entries (body: [{city,tempC,conditions,ttl?}, ...])
app.post('/weather/bulk', async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  if (!items.length) {
    logger.error(req.path, req.correlationId, "Bulk weather request received with empty array");
    return res.status(400).json({ error: 'invalid_input', message: 'Expecting array in request body' });
  }
  logger.info(req.path, req.correlationId, `Processing bulk weather request with ${items.length} items`);
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
      logger.error(req.path, req.correlationId, `Error in bulk POST for city ${key}: ${err.message}`);
      console.error('BULK POST error', key, err);
    }
  }
  logger.info(req.path, req.correlationId, `Bulk weather request completed with ${results.length} successful entries`);
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
    await initializeLogger();
  } catch (err) {
    console.error('Warning: could not seed initial data, redis may be unavailable', err.message || err);
  }

  const server = app.listen(PORT, () => {
    logger.info('localhost', 'startup', `weather-service listening on port ${PORT}, redis ${REDIS_HOST}:${REDIS_PORT}`);
  });

  // TEST ENDPOINT - Regenerate sample data
  app.post('/test/seed-data', async (req, res) => {
    try {
      logger.info(req.path, req.correlationId, 'Regenerating sample weather data');

      const samples = [
        { city: 'Oslo', tempC: 3.5, conditions: 'Cloudy' },
        { city: 'London', tempC: 8.0, conditions: 'Rainy' },
        { city: 'Ljubljana', tempC: 12.0, conditions: 'Sunny' },
        { city: 'Maribor', tempC: 10.0, conditions: 'Cloudy' },
        { city: 'Paris', tempC: 15.0, conditions: 'Sunny' },
      ];

      let created = 0;
      for (const s of samples) {
        const key = `weather:${s.city.toLowerCase()}`;
        const now = new Date().toISOString();
        const value = { city: s.city, tempC: s.tempC, conditions: s.conditions, timestamp: now };

        // Force overwrite with SET (not NX)
        await redis.set(key, JSON.stringify(value), 'EX', DEFAULT_TTL);
        created++;
      }

      logger.info(req.path, req.correlationId, `Successfully seeded ${created} weather entries`);
      res.json({
        success: true,
        message: `Seeded ${created} sample weather entries`,
        cities: samples.map(s => s.city)
      });
    } catch (err) {
      logger.error(req.path, req.correlationId, `Error seeding data: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('localhost', 'shutdown', 'SIGTERM received, shutting down gracefully');
    server.close(async () => {
      await closeLogger();
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    logger.info('localhost', 'shutdown', 'SIGINT received, shutting down gracefully');
    server.close(async () => {
      await closeLogger();
      process.exit(0);
    });
  });
})();
