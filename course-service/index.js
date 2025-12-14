const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());
const jwt = require("jsonwebtoken");
const fs = require('fs');
const path = require('path');
const PUBLIC_KEY_PATH = process.env.JWT_PUBLIC_KEY_PATH || path.join(__dirname, '..', 'auth', 'public.pem');
let PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || null;
if (!PUBLIC_KEY && fs.existsSync(PUBLIC_KEY_PATH)) PUBLIC_KEY = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

// Simple auth middleware: if Authorization header present, verify token and attach decoded to req.user
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth)
    return res.status(401).json({ message: "Authorization header required" });
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer")
    return res.status(401).json({ message: "Invalid Authorization header" });
  const token = parts[1];
  try {
    const decoded = PUBLIC_KEY
      ? jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] })
      : jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// Health endpoint - BEFORE auth middleware (public endpoint)
app.get('/healthz', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', error: err.message });
  }
});

app.use(authMiddleware);

// Swagger (dev only)
if (process.env.SWAGGER_ENABLED === "1" || process.env.NODE_ENV === "development") {
  const swaggerUi = require("swagger-ui-express");
  const swaggerJSDoc = require("swagger-jsdoc");
  const PORT = process.env.PORT || 4002;
  const swaggerSpec = swaggerJSDoc({
    definition: {
      openapi: "3.0.0",
      info: {
        title: "course-service",
        version: "1.0.0",
        description: "Course service - Dev docs",
      },
      servers: [{ url: `http://localhost:${PORT}` }],
    },
    apis: [__filename],
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// DB pool
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "course_service",
  password: process.env.DB_PASSWORD || "course_password",
  database: process.env.DB_NAME || "course_db",
});

const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL || "http://localhost:4001";

// helper za query
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
    `CREATE TABLE IF NOT EXISTS courses (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      owner_user_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );`
  );
  console.log("Course table ensured");
}

// preveri, če user obstaja v User Service
async function checkUserExists(userId) {
  try {
    const res = await axios.get(`${USER_SERVICE_URL}/users/${userId}`);
    return res.status === 200;
  } catch (err) {
    return false;
  }
}

// ===== ENDPOINTI =====

// 2x GET
// 1) vsi tečaji
/**
 * @openapi
 * /courses:
 *   get:
 *     summary: List courses
 *     responses:
 *       200:
 *         description: array of courses
 */
app.get("/courses", async (req, res) => {
  try {
    const result = await query(
      "SELECT id, title, description, owner_user_id, created_at FROM courses ORDER BY id",
      []
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching courses" });
  }
});

// 2) en tečaj po id
app.get("/courses/:id", async (req, res) => {
  try {
    const result = await query(
      "SELECT id, title, description, owner_user_id, created_at FROM courses WHERE id = $1",
      [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Course not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching course" });
  }
});

// 2x POST
// 1) ustvari tečaj
app.post("/courses", async (req, res) => {
  const { title, description, owner_user_id } = req.body;
  if (!title || !owner_user_id) {
    return res
      .status(400)
      .json({ message: "title in owner_user_id sta obvezna" });
  }

  // preveri, če user obstaja
  const userExists = await checkUserExists(owner_user_id);
  if (!userExists) {
    return res.status(400).json({ message: "Owner user ne obstaja" });
  }

  try {
    const result = await query(
      "INSERT INTO courses (title, description, owner_user_id) VALUES ($1, $2, $3) RETURNING id, title, description, owner_user_id, created_at",
      [title, description || null, owner_user_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Error creating course" });
  }
});

// 2) podvoji tečaj (za demo, da imamo 2x POST)
app.post("/courses/:id/duplicate", async (req, res) => {
  const { id } = req.params;
  try {
    const original = await query(
      "SELECT title, description, owner_user_id FROM courses WHERE id=$1",
      [id]
    );
    if (original.rows.length === 0)
      return res.status(404).json({ message: "Course not found" });

    const c = original.rows[0];
    const result = await query(
      "INSERT INTO courses (title, description, owner_user_id) VALUES ($1,$2,$3) RETURNING id, title, description, owner_user_id, created_at",
      [c.title + " (copy)", c.description, c.owner_user_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Error duplicating course" });
  }
});

// 2x PUT
// 1) posodobi osnovne podatke
app.put("/courses/:id", async (req, res) => {
  const { title, description } = req.body;
  try {
    const result = await query(
      "UPDATE courses SET title = $1, description = $2 WHERE id = $3 RETURNING id, title, description, owner_user_id, created_at",
      [title, description, req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Course not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating course" });
  }
});

// 2) spremeni lastnika (owner_user_id)
app.put("/courses/:id/owner", async (req, res) => {
  const { owner_user_id } = req.body;
  if (!owner_user_id) {
    return res.status(400).json({ message: "owner_user_id je obvezen" });
  }

  // preveri, če user obstaja
  const userExists = await checkUserExists(owner_user_id);
  if (!userExists) {
    return res.status(400).json({ message: "Owner user ne obstaja" });
  }

  try {
    const result = await query(
      "UPDATE courses SET owner_user_id = $1 WHERE id = $2 RETURNING id, title, description, owner_user_id, created_at",
      [owner_user_id, req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Course not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating course owner" });
  }
});

// 2x DELETE
// 1) izbriši en tečaj
app.delete("/courses/:id", async (req, res) => {
  try {
    await query("DELETE FROM courses WHERE id = $1", [req.params.id]);
    res.json({ message: "Course deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting course" });
  }
});

// 2) izbriši vse (za test/reset)
app.delete("/courses", async (req, res) => {
  try {
    await query("DELETE FROM courses", []);
    res.json({ message: "All courses deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting all courses" });
  }
});

// start
const PORT = process.env.PORT || 4002;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Course service listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Error initializing DB:", err);
    process.exit(1);
  });
