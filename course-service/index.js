const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const axios = require("axios");
const { v4: uuidv4 } = require('uuid');
const { initializeLogger, logger, closeLogger } = require('./logger');

const app = express();
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

// ===== CORRELATION ID MIDDLEWARE =====
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
});

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
    logger.info(req.path, req.correlationId, 'Health check passed');
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Health check failed: ${err.message}`);
    res.status(503).json({ status: 'unavailable', error: err.message });
  }
});

// Internal endpoint for service-to-service communication
app.get('/internal/courses/:id/exists', async (req, res) => {
  try {
    const result = await query(
      "SELECT id FROM courses WHERE id = $1",
      [req.params.id]
    );
    res.json({ exists: result.rows.length > 0 });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error checking course existence: ${err.message}`);
    res.status(500).json({ message: "Error checking course existence" });
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
    const res = await axios.get(`${USER_SERVICE_URL}/internal/users/${userId}/exists`);
    return res.data.exists === true;
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
    logger.info(req.path, req.correlationId, "Fetching all courses");
    const result = await query(
      "SELECT id, title, description, owner_user_id, created_at FROM courses ORDER BY id",
      []
    );
    logger.info(req.path, req.correlationId, `Successfully fetched ${result.rows.length} courses`);
    res.json(result.rows);
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error fetching courses: ${err.message}`);
    console.error(err);
    res.status(500).json({ message: "Error fetching courses" });
  }
});

// 2) en tečaj po id
app.get("/courses/:id", async (req, res) => {
  try {
    logger.info(req.path, req.correlationId, `Fetching course with id ${req.params.id}`);
    const result = await query(
      "SELECT id, title, description, owner_user_id, created_at FROM courses WHERE id = $1",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      logger.info(req.path, req.correlationId, `Course with id ${req.params.id} not found`);
      return res.status(404).json({ message: "Course not found" });
    }
    logger.info(req.path, req.correlationId, `Successfully fetched course with id ${req.params.id}`);
    res.json(result.rows[0]);
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error fetching course: ${err.message}`);
    console.error(err);
    res.status(500).json({ message: "Error fetching course" });
  }
});

// 2x POST
// 1) ustvari tečaj
app.post("/courses", async (req, res) => {
  const { title, description, owner_user_id } = req.body;
  if (!title || !owner_user_id) {
    logger.error(req.path, req.correlationId, "Missing required fields: title and owner_user_id");
    return res
      .status(400)
      .json({ message: "title in owner_user_id sta obvezna" });
  }

  // preveri, če user obstaja
  const userExists = await checkUserExists(owner_user_id);
  if (!userExists) {
    logger.error(req.path, req.correlationId, `Owner user ${owner_user_id} does not exist`);
    return res.status(400).json({ message: "Owner user ne obstaja" });
  }

  try {
    logger.info(req.path, req.correlationId, `Creating new course with title: ${title}`);
    const result = await query(
      "INSERT INTO courses (title, description, owner_user_id) VALUES ($1, $2, $3) RETURNING id, title, description, owner_user_id, created_at",
      [title, description || null, owner_user_id]
    );
    logger.info(req.path, req.correlationId, `Course created successfully with id ${result.rows[0].id}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error creating course: ${err.message}`);
    console.error(err);
    res.status(400).json({ message: "Error creating course" });
  }
});

// 2) podvoji tečaj (za demo, da imamo 2x POST)
app.post("/courses/:id/duplicate", async (req, res) => {
  const { id } = req.params;
  try {
    logger.info(req.path, req.correlationId, `Duplicating course with id ${id}`);
    const original = await query(
      "SELECT title, description, owner_user_id FROM courses WHERE id=$1",
      [id]
    );
    if (original.rows.length === 0) {
      logger.info(req.path, req.correlationId, `Course with id ${id} not found for duplication`);
      return res.status(404).json({ message: "Course not found" });
    }

    const c = original.rows[0];
    const result = await query(
      "INSERT INTO courses (title, description, owner_user_id) VALUES ($1,$2,$3) RETURNING id, title, description, owner_user_id, created_at",
      [c.title + " (copy)", c.description, c.owner_user_id]
    );
    logger.info(req.path, req.correlationId, `Course duplicated successfully, new id: ${result.rows[0].id}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error duplicating course: ${err.message}`);
    console.error(err);
    res.status(400).json({ message: "Error duplicating course" });
  }
});

// 2x PUT
// 1) posodobi osnovne podatke
app.put("/courses/:id", async (req, res) => {
  const { title, description } = req.body;
  try {
    logger.info(req.path, req.correlationId, `Updating course with id ${req.params.id}`);
    const result = await query(
      "UPDATE courses SET title = $1, description = $2 WHERE id = $3 RETURNING id, title, description, owner_user_id, created_at",
      [title, description, req.params.id]
    );
    if (result.rows.length === 0) {
      logger.info(req.path, req.correlationId, `Course with id ${req.params.id} not found for update`);
      return res.status(404).json({ message: "Course not found" });
    }
    logger.info(req.path, req.correlationId, `Course with id ${req.params.id} updated successfully`);
    res.json(result.rows[0]);
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error updating course: ${err.message}`);
    console.error(err);
    res.status(500).json({ message: "Error updating course" });
  }
});

// 2) spremeni lastnika (owner_user_id)
app.put("/courses/:id/owner", async (req, res) => {
  const { owner_user_id } = req.body;
  if (!owner_user_id) {
    logger.error(req.path, req.correlationId, "Missing required field: owner_user_id");
    return res.status(400).json({ message: "owner_user_id je obvezen" });
  }

  // preveri, če user obstaja
  const userExists = await checkUserExists(owner_user_id);
  if (!userExists) {
    logger.error(req.path, req.correlationId, `Owner user ${owner_user_id} does not exist`);
    return res.status(400).json({ message: "Owner user ne obstaja" });
  }

  try {
    logger.info(req.path, req.correlationId, `Changing owner of course ${req.params.id} to user ${owner_user_id}`);
    const result = await query(
      "UPDATE courses SET owner_user_id = $1 WHERE id = $2 RETURNING id, title, description, owner_user_id, created_at",
      [owner_user_id, req.params.id]
    );
    if (result.rows.length === 0) {
      logger.info(req.path, req.correlationId, `Course with id ${req.params.id} not found for owner change`);
      return res.status(404).json({ message: "Course not found" });
    }
    logger.info(req.path, req.correlationId, `Course owner changed successfully`);
    res.json(result.rows[0]);
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error updating course owner: ${err.message}`);
    console.error(err);
    res.status(500).json({ message: "Error updating course owner" });
  }
});

// 2x DELETE
// 1) izbriši en tečaj
app.delete("/courses/:id", async (req, res) => {
  try {
    logger.info(req.path, req.correlationId, `Deleting course with id ${req.params.id}`);
    await query("DELETE FROM courses WHERE id = $1", [req.params.id]);
    logger.info(req.path, req.correlationId, `Course with id ${req.params.id} deleted successfully`);
    res.json({ message: "Course deleted" });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error deleting course: ${err.message}`);
    console.error(err);
    res.status(500).json({ message: "Error deleting course" });
  }
});

// 2) izbriši vse (za test/reset)
app.delete("/courses", async (req, res) => {
  try {
    logger.info(req.path, req.correlationId, "Deleting all courses");
    await query("DELETE FROM courses", []);
    logger.info(req.path, req.correlationId, "All courses deleted successfully");
    res.json({ message: "All courses deleted" });
  } catch (err) {
    logger.error(req.path, req.correlationId, `Error deleting all courses: ${err.message}`);
    console.error(err);
    res.status(500).json({ message: "Error deleting all courses" });
  }
});

// start
const PORT = process.env.PORT || 4002;

initDb()
  .then(() => {
    return initializeLogger();
  })
  .then(() => {
    const server = app.listen(PORT, () => {
      logger.info('localhost', 'startup', `Course service listening on port ${PORT}`);
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
