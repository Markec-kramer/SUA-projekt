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

// Create a recommendation for user
app.post('/recommendations/:userId', async (req, res) => {
  const userId = req.params.userId;
  const { courseId, score, reason, ttl } = req.body || {};
  if (typeof courseId !== 'number') {
    return res.status(400).json({ error: 'invalid_input', message: 'courseId must be a number' });
  }
  const id = uuidv4();
  const key = `rec:${userId}:${id}`;
  const now = new Date().toISOString();
  const val = { id, userId, courseId, score: typeof score === 'number' ? score : null, reason: reason || null, createdAt: now };
  const appliedTtl = Number.isInteger(ttl) && ttl > 0 ? ttl : DEFAULT_TTL;
  try {
    if (appliedTtl > 0) {
      await redis.set(key, JSON.stringify(val), 'EX', appliedTtl);
    } else {
      await redis.set(key, JSON.stringify(val));
    }
    res.status(201).json({ ...val, ttl: appliedTtl });
  } catch (err) {
    console.error('CREATE error', err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// Delete all recommendations for a user
app.delete('/recommendations/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    const keys = await redis.keys(`rec:${userId}:*`);
    if (!keys || keys.length === 0) return res.status(404).json({ error: 'not_found', message: 'no recommendations' });
    await redis.del(...keys);
    res.status(204).send();
  } catch (err) {
    console.error('DELETE error', err);
    res.status(500).json({ error: 'server_error', message: err.message });
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
