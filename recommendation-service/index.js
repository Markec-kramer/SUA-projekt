const express = require('express');
const bodyParser = require('body-parser');
const Redis = require('ioredis');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { initializeLogger, logger, closeLogger } = require('./logger');

const app = express();
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(bodyParser.json());
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const PUBLIC_KEY_PATH = process.env.JWT_PUBLIC_KEY_PATH || path.join(__dirname, '..', 'auth', 'public.pem');
let PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || null;
if (!PUBLIC_KEY && fs.existsSync(PUBLIC_KEY_PATH)) PUBLIC_KEY = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

// Correlation ID middleware
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
});

// ===== METRICS REPORTING MIDDLEWARE =====
const axios = require('axios');
const METRICS_SERVICE_URL = process.env.METRICS_SERVICE_URL || 'http://localhost:4007';

app.use((req, res, next) => {
  // Capture the original end function
  const originalEnd = res.end;
  const startTime = Date.now();

  res.end = function(chunk, encoding) {
    const responseTime = Date.now() - startTime;
    
    // Send metrics asynchronously (don't block response)
    axios.post(`${METRICS_SERVICE_URL}/metrics/record`, {
      klicanaStoritev: req.path,
      method: req.method,
      service_name: 'recommendation-service',
      response_time_ms: responseTime
    }).catch(err => {
      console.warn(`[${req.correlationId}] Failed to record metric:`, err.message);
    });

    // Call the original end method
    originalEnd.call(res, chunk, encoding);
  };

  next();
});

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
const PORT = parseInt(process.env.PORT || '4005', 10);
const DEFAULT_TTL = parseInt(process.env.DEFAULT_TTL || '86400', 10);

const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

// Swagger (dev only)
if (process.env.SWAGGER_ENABLED === '1' || process.env.NODE_ENV === 'development') {
  const swaggerUi = require('swagger-ui-express');
  const swaggerJSDoc = require('swagger-jsdoc');
  const swaggerSpec = swaggerJSDoc({
    definition: {
      openapi: '3.0.0',
      info: { title: 'recommendation-service', version: '1.0.0', description: 'Recommendation service - Dev docs' },
      servers: [{ url: `http://localhost:${PORT}` }],
    },
    apis: [__filename],
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Seed recommendations for local development
async function seedInitialRecommendations() {
  // deterministic samples: use stable IDs so seeds are idempotent
  const samples = [
    { userId: '1', courseId: 101, score: 0.9, reason: 'Based on your interests' },
    { userId: '1', courseId: 201, score: 0.85, reason: 'Recommended for new learners' },
    { userId: '2', courseId: 102, score: 0.8, reason: 'Popular in your area' },
    { userId: '3', courseId: 103, score: 0.75, reason: 'Peers with similar profiles liked it' },
    { userId: '42', courseId: 150, score: 0.95, reason: 'Top-rated course' },
  ];

  for (const s of samples) {
    const id = `seed-${s.userId}-${s.courseId}`; // stable id for seed
    const key = `rec:${s.userId}:${id}`;
    const now = new Date().toISOString();
    const val = { id, userId: s.userId, courseId: s.courseId, score: s.score, reason: s.reason, createdAt: now };
    try {
      // NX prevents overwriting existing real data and makes seeding idempotent
      const res = await redis.set(key, JSON.stringify(val), 'EX', DEFAULT_TTL, 'NX');
      if (res === 'OK') console.log(`Seeded recommendation ${key}`);
      else console.log(`Seed skipped (exists): ${key}`);
    } catch (err) {
      console.error('Error seeding', key, err.message || err);
    }
  }
}


/**
 * @openapi
 * /recommendations:
 *   get:
 *     summary: List recommendations (optionally by userId)
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: array of recommendations
 */
app.get('/recommendations', async (req, res) => {
  const userId = req.query.userId;
  try {
    let pattern = 'rec:*';
    if (userId) {
      logger.info(req.path, req.correlationId, `Fetching recommendations for userId: ${userId}`);
      pattern = `rec:${userId}:*`;
    } else {
      logger.info(req.path, req.correlationId, "Fetching all recommendations");
    }
    const keys = await redis.keys(pattern);
    const results = [];
    if (keys.length > 0) {
      const values = await redis.mget(...keys);
      for (const v of values) {
        if (!v) continue;
        const obj = JSON.parse(v);
        results.push(obj);
      }
    }
    logger.info(req.path, req.correlationId, `Retrieved ${results.length} recommendations`);
    res.json(results);
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error listing recommendations: ${err.message}`);
    console.error('LIST error', err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

/**
 * @openapi
 * /recommendations/{userId}:
 *   get:
 *     summary: Get recommendations for a user
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: array of recommendations
 */
app.get('/recommendations/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    logger.info(req.path, req.correlationId, `Fetching recommendations for userId: ${userId}`);
    const keys = await redis.keys(`rec:${userId}:*`);
    if (!keys || keys.length === 0) {
      logger.info(req.path, req.correlationId, `No recommendations found for userId: ${userId}`);
      return res.status(404).json({ error: 'not_found', message: 'no recommendations' });
    }
    const values = await redis.mget(...keys);
    const results = values.filter(Boolean).map((v) => JSON.parse(v));
    logger.info(req.path, req.correlationId, `Retrieved ${results.length} recommendations for userId: ${userId}`);
    res.json(results);
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error fetching recommendations for userId ${userId}: ${err.message}`);
    console.error('GET user recs error', err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// Get single recommendation by user and id
app.get('/recommendations/:userId/:id', async (req, res) => {
  const { userId, id } = req.params;
  const key = `rec:${userId}:${id}`;
  try {
    logger.info(req.path, req.correlationId, `Fetching recommendation ${id} for userId: ${userId}`);
    const raw = await redis.get(key);
    if (!raw) {
      logger.info(req.path, req.correlationId, `Recommendation ${id} not found for userId: ${userId}`);
      return res.status(404).json({ error: 'not_found', message: 'recommendation not found' });
    }
    const obj = JSON.parse(raw);
    // attach ttl if present
    const ttlSeconds = await redis.ttl(key);
    obj.ttl = ttlSeconds >= 0 ? ttlSeconds : null;
    obj.expiresAt = ttlSeconds > 0 ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
    logger.info(req.path, req.correlationId, `Successfully retrieved recommendation ${id}`);
    res.json(obj);
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error fetching recommendation ${id}: ${err.message}`);
    console.error('GET rec by id error', err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// POST /recommendations - create by body { userId, courseId, score?, reason?, ttl? }
app.post('/recommendations', async (req, res) => {
  const { userId, courseId, score, reason, ttl } = req.body || {};
  if (!userId || typeof courseId !== 'number') {
    logger.error(req.path, req.correlationId, "Missing required fields: userId or courseId");
    return res.status(400).json({ error: 'invalid_input', message: 'userId and courseId required (courseId:number)' });
  }
  const id = uuidv4();
  const key = `rec:${userId}:${id}`;
  const now = new Date().toISOString();
  const val = { id, userId, courseId, score: typeof score === 'number' ? score : null, reason: reason || null, createdAt: now };
  const appliedTtl = Number.isInteger(ttl) && ttl > 0 ? ttl : DEFAULT_TTL;
  try {
    logger.info(req.path, req.correlationId, `Creating recommendation for userId: ${userId}, courseId: ${courseId}`);
    if (appliedTtl > 0) await redis.set(key, JSON.stringify(val), 'EX', appliedTtl);
    else await redis.set(key, JSON.stringify(val));
    logger.info(req.path, req.correlationId, `Recommendation created successfully with id: ${id}`);
    return res.status(201).json({ ...val, ttl: appliedTtl });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error creating recommendation: ${err.message}`);
    console.error('POST create rec error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// Helper: find key by id (search rec:*:id)
async function findKeyById(id) {
  const keys = await redis.keys(`rec:*:${id}`);
  return (keys && keys.length) ? keys[0] : null;
}

// PUT /recommendations/:userId/:id - update specific recommendation
app.put('/recommendations/:userId/:id', async (req, res) => {
  const { userId, id } = req.params;
  const { courseId, score, reason, ttl } = req.body || {};
  const key = `rec:${userId}:${id}`;
  try {
    logger.info(req.path, req.correlationId, `Updating recommendation ${id} for userId: ${userId}`);
    const raw = await redis.get(key);
    if (!raw) {
      logger.info(req.path, req.correlationId, `Recommendation ${id} not found for userId: ${userId}`);
      return res.status(404).json({ error: 'not_found', message: 'recommendation not found' });
    }
    const obj = JSON.parse(raw);
    const updated = {
      ...obj,
      courseId: typeof courseId === 'number' ? courseId : obj.courseId,
      score: typeof score === 'number' ? score : obj.score,
      reason: typeof reason === 'string' ? reason : obj.reason,
      createdAt: obj.createdAt || new Date().toISOString(),
    };
    const appliedTtl = Number.isInteger(ttl) && ttl >= 0 ? ttl : DEFAULT_TTL;
    if (appliedTtl > 0) await redis.set(key, JSON.stringify(updated), 'EX', appliedTtl);
    else await redis.set(key, JSON.stringify(updated));
    logger.info(req.path, req.correlationId, `Recommendation ${id} updated successfully`);
    return res.json({ ...updated, ttl: appliedTtl });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error updating recommendation: ${err.message}`);
    console.error('PUT update rec error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// PUT /recommendations/:id - update by id (search across users)
app.put('/recommendations/id/:id', async (req, res) => {
  const { id } = req.params;
  const { courseId, score, reason, ttl } = req.body || {};
  try {
    logger.info(req.path, req.correlationId, `Updating recommendation by id: ${id}`);
    const key = await findKeyById(id);
    if (!key) {
      logger.info(req.path, req.correlationId, `Recommendation ${id} not found`);
      return res.status(404).json({ error: 'not_found', message: 'recommendation not found' });
    }
    const raw = await redis.get(key);
    if (!raw) {
      logger.info(req.path, req.correlationId, `Recommendation ${id} not found (redis)`);
      return res.status(404).json({ error: 'not_found', message: 'recommendation not found' });
    }
    const obj = JSON.parse(raw);
    const updated = {
      ...obj,
      courseId: typeof courseId === 'number' ? courseId : obj.courseId,
      score: typeof score === 'number' ? score : obj.score,
      reason: typeof reason === 'string' ? reason : obj.reason,
      createdAt: obj.createdAt || new Date().toISOString(),
    };
    const appliedTtl = Number.isInteger(ttl) && ttl >= 0 ? ttl : DEFAULT_TTL;
    if (appliedTtl > 0) await redis.set(key, JSON.stringify(updated), 'EX', appliedTtl);
    else await redis.set(key, JSON.stringify(updated));
    logger.info(req.path, req.correlationId, `Recommendation ${id} updated successfully`);
    return res.json({ ...updated, ttl: appliedTtl });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error updating recommendation ${id}: ${err.message}`);
    console.error('PUT update by id error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// DELETE /recommendations/:userId/:id - delete single recommendation
app.delete('/recommendations/:userId/:id', async (req, res) => {
  const { userId, id } = req.params;
  const key = `rec:${userId}:${id}`;
  try {
    logger.info(req.path, req.correlationId, `Deleting recommendation ${id} for userId: ${userId}`);
    const removed = await redis.del(key);
    if (removed === 0) {
      logger.info(req.path, req.correlationId, `Recommendation ${id} not found for deletion`);
      return res.status(404).json({ error: 'not_found', message: 'recommendation not found' });
    }
    logger.info(req.path, req.correlationId, `Recommendation ${id} deleted successfully`);
    return res.status(204).send();
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error deleting recommendation: ${err.message}`);
    console.error('DELETE single rec error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// DELETE /recommendations - bulk delete by body.ids = [{userId,id}] or ?all=1
app.delete('/recommendations', async (req, res) => {
  const deleteAll = req.query.all === '1';
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  try {
    if (deleteAll) {
      logger.info(req.path, req.correlationId, "Deleting all recommendations");
      const keys = await redis.keys('rec:*');
      if (!keys || keys.length === 0) {
        logger.info(req.path, req.correlationId, "No recommendations found to delete");
        return res.status(204).send();
      }
      await redis.del(...keys);
      logger.info(req.path, req.correlationId, `Deleted ${keys.length} recommendations`);
      return res.status(204).send();
    }
    if (!ids.length) {
      logger.error(req.path, req.correlationId, "Invalid bulk delete request - no ids provided");
      return res.status(400).json({ error: 'invalid_input', message: 'Provide ids array in body or use ?all=1' });
    }
    const keys = ids.map((it) => `rec:${it.userId}:${it.id}`);
    logger.info(req.path, req.correlationId, `Bulk deleting ${keys.length} recommendations`);
    await redis.del(...keys);
    logger.info(req.path, req.correlationId, `Bulk deleted ${keys.length} recommendations successfully`);
    return res.status(204).send();
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error in bulk delete: ${err.message}`);
    console.error('BULK DELETE recs error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// Start server
(async () => {
  try {
    await redis.ping();
    await seedInitialRecommendations();
    await initializeLogger();
  } catch (err) {
    console.error('Warning: could not seed recommendations', err.message || err);
  }
  const server = app.listen(PORT, () => {
    logger.info('localhost', 'startup', `recommendation-service listening on port ${PORT}, redis ${REDIS_HOST}:${REDIS_PORT}`);
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
