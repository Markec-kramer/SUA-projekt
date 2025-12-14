const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const yaml = require('js-yaml');
const jwt = require("jsonwebtoken");
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const JWT_EXP = process.env.JWT_EXP || "1h";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const fs = require('fs');
const path = require('path');

const PRIVATE_KEY_PATH = process.env.JWT_PRIVATE_KEY_PATH || path.join(__dirname, '..', 'auth', 'private.pem');
const PUBLIC_KEY_PATH = process.env.JWT_PUBLIC_KEY_PATH || path.join(__dirname, '..', 'auth', 'public.pem');
let PRIVATE_KEY = process.env.JWT_PRIVATE_KEY || null;
let PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || null;
if (!PRIVATE_KEY && fs.existsSync(PRIVATE_KEY_PATH)) PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
if (!PUBLIC_KEY && fs.existsSync(PUBLIC_KEY_PATH)) PUBLIC_KEY = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');

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
    const result = await query(
      "SELECT id, email, name FROM users ORDER BY id",
      []
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching users" });
  }
});

// 2) en user po id
app.get("/users/:id", authMiddleware, async (req, res) => {
  try {
    const result = await query(
      "SELECT id, email, name FROM users WHERE id = $1",
      [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "User not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching user" });
  }
});

// 2x POST
// 1) registracija
app.post("/users/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res
      .status(400)
      .json({ message: "email, password, name are required" });
  }
  try {
    const result = await query(
      "INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name",
      [email, password, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Error creating user" });
  }
});

// 2) login (zaenkrat brez JWT, samo zelo basic)
app.post("/users/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await query(
      "SELECT id, email, name, password FROM users WHERE email = $1",
      [email]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ message: "Invalid credentials" });

    const user = result.rows[0];
    if (user.password !== password)
      return res.status(401).json({ message: "Invalid credentials" });

    // ustvarimo access JWT in refresh token
    const accessToken = PRIVATE_KEY
      ? jwt.sign({ sub: String(user.id), name: user.name }, PRIVATE_KEY, { algorithm: 'RS256', expiresIn: JWT_EXP })
      : jwt.sign({ sub: String(user.id), name: user.name }, JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_EXP });

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

    res.json({ id: user.id, email: user.email, name: user.name, token: accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error while logging in" });
  }
});

// refresh endpoint - rotates refresh token and issues a new access token
app.post('/token/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.cookies || {};
    if (!refreshToken) return res.status(401).json({ message: 'No refresh token' });

    const hashed = hashRefreshToken(refreshToken);
    const found = await query('SELECT user_id, expires_at FROM refresh_tokens WHERE token = $1', [hashed]);
    if (found.rows.length === 0) return res.status(401).json({ message: 'Invalid refresh token' });

    const row = found.rows[0];
    const expiresAt = new Date(row.expires_at);
    if (expiresAt.getTime() < Date.now()) {
      await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
      return res.status(401).json({ message: 'Refresh token expired' });
    }

    // fetch user
    const userRes = await query('SELECT id, email, name FROM users WHERE id = $1', [row.user_id]);
    if (userRes.rows.length === 0) return res.status(401).json({ message: 'User not found' });
    const user = userRes.rows[0];

    // issue new access token
    const accessToken = jwt.sign({ sub: String(user.id), name: user.name }, JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_EXP });

    // rotate refresh token
    const newRefresh = crypto.randomBytes(48).toString('hex');
    const newExpires = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    const newHashed = hashRefreshToken(newRefresh);
    await query('UPDATE refresh_tokens SET token = $1, expires_at = $2 WHERE token = $3', [newHashed, newExpires, hashed]);

    res.cookie('refreshToken', newRefresh, { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000 });
    res.json({ id: user.id, email: user.email, name: user.name, token: accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error refreshing token' });
  }
});

// logout - remove refresh token
app.post('/users/logout', async (req, res) => {
  try {
    const { refreshToken } = req.cookies || {};
    if (refreshToken) {
      const hashed = hashRefreshToken(refreshToken);
      await query('DELETE FROM refresh_tokens WHERE token = $1', [hashed]);
    }
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error logging out' });
  }
});

// 2x PUT
// 1) posodobi ime
app.put("/users/:id", authMiddleware, async (req, res) => {
  const { name } = req.body;
  try {
    const result = await query(
      "UPDATE users SET name = $1 WHERE id = $2 RETURNING id, email, name",
      [name, req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "User not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating user" });
  }
});

// 2) posodobi geslo (brez validacije, za vaje OK)
app.put("/users/:id/password", authMiddleware, async (req, res) => {
  const { password } = req.body;
  try {
    const result = await query(
      "UPDATE users SET password = $1 WHERE id = $2 RETURNING id",
      [password, req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "User not found" });
    res.json({ message: "Password updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating password" });
  }
});

// 2x DELETE
// 1) izbriši enega
app.delete("/users/:id", authMiddleware, async (req, res) => {
  try {
    await query("DELETE FROM users WHERE id = $1", [req.params.id]);
    res.json({ message: "User deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting user" });
  }
});

// 2) izbriši vse (za test/reset)
app.delete("/users", authMiddleware, async (req, res) => {
  try {
    await query("DELETE FROM users", []);
    res.json({ message: "All users deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting all users" });
  }
});

// start
const PORT = process.env.PORT || 4001;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`User service listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Error initializing DB:", err);
    process.exit(1);
  });
