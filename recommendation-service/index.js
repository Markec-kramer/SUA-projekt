const express = require('express');
const bodyParser = require('body-parser');
const Redis = require('ioredis');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: CORS_ORIGIN }));
app.use(bodyParser.json());

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const PORT = parseInt(process.env.PORT || '4005', 10);
const DEFAULT_TTL = parseInt(process.env.DEFAULT_TTL || '86400', 10);

const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

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

// Health
app.get('/healthz', async (req, res) => {
  try {
    await redis.ping();
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: err.message });
  }
});

// List recommendations (optionally filter by userId)
app.get('/recommendations', async (req, res) => {
  const userId = req.query.userId;
  try {
    let pattern = 'rec:*';
    if (userId) pattern = `rec:${userId}:*`;
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
    res.json(results);
  } catch (err) {
    console.error('LIST error', err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// Get recommendations for specific user
app.get('/recommendations/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    const keys = await redis.keys(`rec:${userId}:*`);
    if (!keys || keys.length === 0) return res.status(404).json({ error: 'not_found', message: 'no recommendations' });
    const values = await redis.mget(...keys);
    const results = values.filter(Boolean).map((v) => JSON.parse(v));
    res.json(results);
  } catch (err) {
    console.error('GET user recs error', err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// Get single recommendation by user and id
app.get('/recommendations/:userId/:id', async (req, res) => {
  const { userId, id } = req.params;
  const key = `rec:${userId}:${id}`;
  try {
    const raw = await redis.get(key);
    if (!raw) return res.status(404).json({ error: 'not_found', message: 'recommendation not found' });
    const obj = JSON.parse(raw);
    // attach ttl if present
    const ttlSeconds = await redis.ttl(key);
    obj.ttl = ttlSeconds >= 0 ? ttlSeconds : null;
    obj.expiresAt = ttlSeconds > 0 ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
    res.json(obj);
  } catch (err) {
    console.error('GET rec by id error', err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// POST /recommendations - create by body { userId, courseId, score?, reason?, ttl? }
app.post('/recommendations', async (req, res) => {
  const { userId, courseId, score, reason, ttl } = req.body || {};
  if (!userId || typeof courseId !== 'number') {
    return res.status(400).json({ error: 'invalid_input', message: 'userId and courseId required (courseId:number)' });
  }
  const id = uuidv4();
  const key = `rec:${userId}:${id}`;
  const now = new Date().toISOString();
  const val = { id, userId, courseId, score: typeof score === 'number' ? score : null, reason: reason || null, createdAt: now };
  const appliedTtl = Number.isInteger(ttl) && ttl > 0 ? ttl : DEFAULT_TTL;
  try {
    if (appliedTtl > 0) await redis.set(key, JSON.stringify(val), 'EX', appliedTtl);
    else await redis.set(key, JSON.stringify(val));
    return res.status(201).json({ ...val, ttl: appliedTtl });
  } catch (err) {
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
    const raw = await redis.get(key);
    if (!raw) return res.status(404).json({ error: 'not_found', message: 'recommendation not found' });
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
    return res.json({ ...updated, ttl: appliedTtl });
  } catch (err) {
    console.error('PUT update rec error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// PUT /recommendations/:id - update by id (search across users)
app.put('/recommendations/id/:id', async (req, res) => {
  const { id } = req.params;
  const { courseId, score, reason, ttl } = req.body || {};
  try {
    const key = await findKeyById(id);
    if (!key) return res.status(404).json({ error: 'not_found', message: 'recommendation not found' });
    const raw = await redis.get(key);
    if (!raw) return res.status(404).json({ error: 'not_found', message: 'recommendation not found' });
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
    return res.json({ ...updated, ttl: appliedTtl });
  } catch (err) {
    console.error('PUT update by id error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// DELETE /recommendations/:userId/:id - delete single recommendation
app.delete('/recommendations/:userId/:id', async (req, res) => {
  const { userId, id } = req.params;
  const key = `rec:${userId}:${id}`;
  try {
    const removed = await redis.del(key);
    if (removed === 0) return res.status(404).json({ error: 'not_found', message: 'recommendation not found' });
    return res.status(204).send();
  } catch (err) {
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
      const keys = await redis.keys('rec:*');
      if (!keys || keys.length === 0) return res.status(204).send();
      await redis.del(...keys);
      return res.status(204).send();
    }
    if (!ids.length) return res.status(400).json({ error: 'invalid_input', message: 'Provide ids array in body or use ?all=1' });
    const keys = ids.map((it) => `rec:${it.userId}:${it.id}`);
    await redis.del(...keys);
    return res.status(204).send();
  } catch (err) {
    console.error('BULK DELETE recs error', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// Start server
(async () => {
  try {
    await redis.ping();
    await seedInitialRecommendations();
  } catch (err) {
    console.error('Warning: could not seed recommendations', err.message || err);
  }
  app.listen(PORT, () => {
    console.log(`recommendation-service listening on port ${PORT}, redis ${REDIS_HOST}:${REDIS_PORT}`);
  });
})();
