const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const yaml = require('js-yaml');
const jwt = require("jsonwebtoken");
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { initializeLogger, logger, closeLogger } = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const JWT_EXP = process.env.JWT_EXP || "1h";

const app = express();
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ===== CORRELATION ID MIDDLEWARE =====
// Generate or extract correlation ID from request header
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = correlationId;
  
  // Add correlation ID to response header for tracking
  res.setHeader('x-correlation-id', correlationId);
  
  next();
});

const fs = require('fs');
const path = require('path');

const PRIVATE_KEY_PATH = process.env.JWT_PRIVATE_KEY_PATH || path.join(__dirname, '..', 'auth', 'private.pem');
const PUBLIC_KEY_PATH = process.env.JWT_PUBLIC_KEY_PATH || path.join(__dirname, '..', 'auth', 'public.pem');
let PRIVATE_KEY = process.env.JWT_PRIVATE_KEY || null;
let PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || null;
if (!PRIVATE_KEY && fs.existsSync(PRIVATE_KEY_PATH)) PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
if (!PUBLIC_KEY && fs.existsSync(PUBLIC_KEY_PATH)) PUBLIC_KEY = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');

// DEBUG: show if keys were loaded (do not print full keys)
console.log('JWT: PRIVATE_KEY present=', !!PRIVATE_KEY, 'PUBLIC_KEY present=', !!PUBLIC_KEY);

// stricter check: ensure PEM header exists
if (PRIVATE_KEY && !PRIVATE_KEY.trim().startsWith('-----BEGIN')) {
  console.warn('Loaded PRIVATE_KEY does not start with PEM header — ignoring PRIVATE_KEY');
  PRIVATE_KEY = null;
}
if (PUBLIC_KEY && !PUBLIC_KEY.trim().startsWith('-----BEGIN')) {
  console.warn('Loaded PUBLIC_KEY does not start with PEM header — ignoring PUBLIC_KEY');
  PUBLIC_KEY = null;
}

function isLikelyPrivateKey(key) {
  if (!key || typeof key !== 'string') return false;
  return key.includes('BEGIN RSA PRIVATE KEY') || key.includes('BEGIN PRIVATE KEY');
}

if (PRIVATE_KEY && !isLikelyPrivateKey(PRIVATE_KEY)) {
  console.warn('JWT private key present but does not look like a PEM private key — falling back to HS256');
  PRIVATE_KEY = null;
}
if (PUBLIC_KEY && !(typeof PUBLIC_KEY === 'string' && PUBLIC_KEY.includes('BEGIN PUBLIC KEY')) ) {
  console.warn('JWT public key present but does not look like a PEM public key — ignoring public key');
  PUBLIC_KEY = null;
}

function signAccessToken(payload) {
  try {
    if (PRIVATE_KEY) {
      return jwt.sign(payload, PRIVATE_KEY, { algorithm: 'RS256', expiresIn: JWT_EXP });
    }
  } catch (err) {
    console.warn('Failed to sign with RS256 private key, falling back to HS256:', err.message);
    // fallthrough to HS256
  }
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_EXP });
}

const REFRESH_TOKEN_DAYS = parseInt(process.env.REFRESH_TOKEN_DAYS || '7', 10);
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

function hashRefreshToken(token) {
  return crypto.createHmac('sha256', JWT_SECRET).update(token).digest('hex');
}

// Health endpoint - public (no auth required)
app.get('/healthz', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    logger.info(req.path, req.correlationId, 'Health check passed');
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Health check failed: ${err.message}`);
    res.status(503).json({ status: 'unavailable', error: err.message });
  }
});

// Internal endpoint for service-to-service communication
app.get('/internal/users/:id/exists', async (req, res) => {
  try {
    const result = await query(
      "SELECT id FROM users WHERE id = $1",
      [req.params.id]
    );
    res.json({ exists: result.rows.length > 0 });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error checking user existence: ${err.message}`);
    res.status(500).json({ message: "Error checking user existence" });
  }
});

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'Authorization header required' });
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ message: 'Invalid Authorization header' });
  const token = parts[1];
  try {
    let decoded;
    if (PUBLIC_KEY) decoded = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
    else decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

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

// DB pool
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "user_service",
  password: process.env.DB_PASSWORD || "user_password",
  database: process.env.DB_NAME || "user_db",
});

// helper za query-e
async function query(sql, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res;
  } finally {
    client.release();
  }
}

// inicializacija baze
async function initDb() {
  await query(
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL
    );`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );`
  );
  console.log("User table ensured");
}

// ===== ENDPOINTI =====

/**
 * @openapi
 * /users:
 *   get:
 *     summary: List users
 *     responses:
 *       200:
 *         description: array of users
 */
// 2x GET
// 1) seznam userjev
app.get("/users", authMiddleware, async (req, res) => {
  try {
    logger.info(req.path, req.correlationId, 'Fetching all users');
    const result = await query(
      "SELECT id, email, name FROM users ORDER BY id",
      []
    );
    logger.info(req.path, req.correlationId, `Retrieved ${result.rows.length} users`);
    res.json(result.rows);
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error fetching users: ${err.message}`);
    res.status(500).json({ message: "Error fetching users" });
  }
});

// 2) en user po id
app.get("/users/:id", authMiddleware, async (req, res) => {
  try {
    logger.info(req.path, req.correlationId, `Fetching user with ID: ${req.params.id}`);
    const result = await query(
      "SELECT id, email, name FROM users WHERE id = $1",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      logger.warn(req.path, req.correlationId, `User not found for ID: ${req.params.id}`);
      return res.status(404).json({ message: "User not found" });
    }
    logger.info(req.path, req.correlationId, `User retrieved successfully for ID: ${req.params.id}`);
    res.json(result.rows[0]);
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error fetching user: ${err.message}`);
    res.status(500).json({ message: "Error fetching user" });
  }
});

// 2x POST
// 1) registracija
app.post("/users/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    logger.warn(req.path, req.correlationId, 'Registration attempt with missing fields');
    return res
      .status(400)
      .json({ message: "email, password, name are required" });
  }
  try {
    logger.info(req.path, req.correlationId, `User registration attempt for email: ${email}`);
    const result = await query(
      "INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name",
      [email, password, name]
    );
    logger.info(req.path, req.correlationId, `User registered successfully with ID: ${result.rows[0].id}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error(req.path, req.correlationId, `User registration failed: ${err.message}`);
    res.status(400).json({ message: "Error creating user" });
  }
});

// 2) login (zaenkrat brez JWT, samo zelo basic)
app.post("/users/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    logger.info(req.path, req.correlationId, `Login attempt for email: ${email}`);
    const result = await query(
      "SELECT id, email, name, password FROM users WHERE email = $1",
      [email]
    );
    if (result.rows.length === 0) {
      logger.warn(req.path, req.correlationId, `Login failed: User not found for email: ${email}`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0];
    if (user.password !== password) {
      logger.warn(req.path, req.correlationId, `Login failed: Invalid password for email: ${email}`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ustvarimo access JWT in refresh token
    // Use helper that attempts RS256 then falls back to HS256 on error
    const accessToken = signAccessToken({ sub: String(user.id), name: user.name });

    const refreshToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    const hashed = hashRefreshToken(refreshToken);
    await query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, hashed, expiresAt]
    );

    // set refresh token as httpOnly cookie (store raw token only in cookie)
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    });

    logger.info(req.path, req.correlationId, `User logged in successfully: ${user.id}`);
    res.json({ id: user.id, email: user.email, name: user.name, token: accessToken });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Login error: ${err.message}`);
    res.status(500).json({ message: "Error while logging in" });
  }
});

// refresh endpoint - rotates refresh token and issues a new access token
app.post('/token/refresh', async (req, res) => {
  try {
    logger.info(req.path, req.correlationId, 'Token refresh attempt');
    const { refreshToken } = req.cookies || {};
    if (!refreshToken) {
      logger.warn(req.path, req.correlationId, 'Token refresh failed: No refresh token provided');
      return res.status(401).json({ message: 'No refresh token' });
    }

    const hashed = hashRefreshToken(refreshToken);
    const found = await query('SELECT user_id, expires_at FROM refresh_tokens WHERE token = $1', [hashed]);
    if (found.rows.length === 0) {
      logger.warn(req.path, req.correlationId, 'Token refresh failed: Invalid refresh token');
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const row = found.rows[0];
    const expiresAt = new Date(row.expires_at);
    if (expiresAt.getTime() < Date.now()) {
      await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
      logger.warn(req.path, req.correlationId, 'Token refresh failed: Refresh token expired');
      return res.status(401).json({ message: 'Refresh token expired' });
    }

    // fetch user
    const userRes = await query('SELECT id, email, name FROM users WHERE id = $1', [row.user_id]);
    if (userRes.rows.length === 0) {
      logger.warn(req.path, req.correlationId, 'Token refresh failed: User not found');
      return res.status(401).json({ message: 'User not found' });
    }
    const user = userRes.rows[0];

    // issue new access token using the same signing method as login
    const accessToken = signAccessToken({ sub: String(user.id), name: user.name });

    // rotate refresh token
    const newRefresh = crypto.randomBytes(48).toString('hex');
    const newExpires = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    const newHashed = hashRefreshToken(newRefresh);
    await query('UPDATE refresh_tokens SET token = $1, expires_at = $2 WHERE token = $3', [newHashed, newExpires, hashed]);

    res.cookie('refreshToken', newRefresh, { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000 });
    logger.info(req.path, req.correlationId, `Token refreshed successfully for user: ${user.id}`);
    res.json({ id: user.id, email: user.email, name: user.name, token: accessToken });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Token refresh error: ${err.message}`);
    res.status(500).json({ message: 'Error refreshing token' });
  }
});

// logout - remove refresh token
app.post('/users/logout', async (req, res) => {
  try {
    logger.info(req.path, req.correlationId, 'User logout attempt');
    const { refreshToken } = req.cookies || {};
    if (refreshToken) {
      const hashed = hashRefreshToken(refreshToken);
      await query('DELETE FROM refresh_tokens WHERE token = $1', [hashed]);
    }
    res.clearCookie('refreshToken');
    logger.info(req.path, req.correlationId, 'User logged out successfully');
    res.json({ message: 'Logged out' });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Logout error: ${err.message}`);
    res.status(500).json({ message: 'Error logging out' });
  }
});

// 2x PUT
// 1) posodobi ime
app.put("/users/:id", authMiddleware, async (req, res) => {
  const { name } = req.body;
  try {
    logger.info(req.path, req.correlationId, `Updating user name for ID: ${req.params.id}`);
    const result = await query(
      "UPDATE users SET name = $1 WHERE id = $2 RETURNING id, email, name",
      [name, req.params.id]
    );
    if (result.rows.length === 0) {
      logger.warn(req.path, req.correlationId, `User not found for ID: ${req.params.id}`);
      return res.status(404).json({ message: "User not found" });
    }
    logger.info(req.path, req.correlationId, `User name updated successfully for ID: ${req.params.id}`);
    res.json(result.rows[0]);
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error updating user: ${err.message}`);
    res.status(500).json({ message: "Error updating user" });
  }
});

// 2) posodobi geslo (brez validacije, za vaje OK)
app.put("/users/:id/password", authMiddleware, async (req, res) => {
  const { password } = req.body;
  try {
    logger.info(req.path, req.correlationId, `Updating password for user ID: ${req.params.id}`);
    const result = await query(
      "UPDATE users SET password = $1 WHERE id = $2 RETURNING id",
      [password, req.params.id]
    );
    if (result.rows.length === 0) {
      logger.warn(req.path, req.correlationId, `User not found for ID: ${req.params.id}`);
      return res.status(404).json({ message: "User not found" });
    }
    logger.info(req.path, req.correlationId, `Password updated successfully for user ID: ${req.params.id}`);
    res.json({ message: "Password updated" });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error updating password: ${err.message}`);
    res.status(500).json({ message: "Error updating password" });
  }
});

// 2x DELETE
// 1) izbriši enega
app.delete("/users/:id", authMiddleware, async (req, res) => {
  try {
    logger.info(req.path, req.correlationId, `Deleting user with ID: ${req.params.id}`);
    await query("DELETE FROM users WHERE id = $1", [req.params.id]);
    logger.info(req.path, req.correlationId, `User deleted successfully with ID: ${req.params.id}`);
    res.json({ message: "User deleted" });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error deleting user: ${err.message}`);
    res.status(500).json({ message: "Error deleting user" });
  }
});

// 2) izbriši vse (za test/reset)
app.delete("/users", authMiddleware, async (req, res) => {
  try {
    logger.info(req.path, req.correlationId, 'Deleting all users');
    await query("DELETE FROM users", []);
    logger.warn(req.path, req.correlationId, 'All users deleted');
    res.json({ message: "All users deleted" });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error deleting all users: ${err.message}`);
    res.status(500).json({ message: "Error deleting all users" });
  }
});

// start
const PORT = process.env.PORT || 4001;

initDb()
  .then(() => {
    return initializeLogger();
  })
  .then(() => {
    const server = app.listen(PORT, () => {
      logger.info('localhost', 'startup', `User service listening on port ${PORT}`);
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
  })
  .catch((err) => {
    console.error("Error initializing:", err);
    process.exit(1);
  });
