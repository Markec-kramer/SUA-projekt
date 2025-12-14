const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const fs = require('fs');
const yaml = require('js-yaml');

const app = express();
app.use(cors());
app.use(express.json());

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
app.get("/users", async (req, res) => {
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
app.get("/users/:id", async (req, res) => {
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

    // vrnemo userja (zaenkrat brez tokena)
    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error while logging in" });
  }
});

// 2x PUT
// 1) posodobi ime
app.put("/users/:id", async (req, res) => {
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
app.put("/users/:id/password", async (req, res) => {
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
app.delete("/users/:id", async (req, res) => {
  try {
    await query("DELETE FROM users WHERE id = $1", [req.params.id]);
    res.json({ message: "User deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting user" });
  }
});

// 2) izbriši vse (za test/reset)
app.delete("/users", async (req, res) => {
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
