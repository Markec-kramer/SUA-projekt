const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const swaggerUi = require('swagger-ui-express');
const swaggerJSDoc = require('swagger-jsdoc');

const app = express();
const PORT = process.env.PORT || 4007;

// ===== CORS MIDDLEWARE =====
app.use((req, res, next) => {
  const origin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
console.log(`[metrics-service] CORS_ORIGIN=${CORS_ORIGIN}`);
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

// ===== CORRELATION ID MIDDLEWARE =====
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
});

// ===== DATABASE CONNECTION =====
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'metrics_service',
  password: process.env.DB_PASSWORD || 'metrics_password',
  database: process.env.DB_NAME || 'metrics_db',
});

// Helper function for database queries
async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

// ===== INITIALIZE DATABASE =====
async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // Create api_calls table if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS api_calls (
        id SERIAL PRIMARY KEY,
        service_name VARCHAR(255) NOT NULL,
        endpoint VARCHAR(255) NOT NULL,
        method VARCHAR(10) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        response_time_ms INTEGER
      );
    `);

    // Create index for faster queries
    await query(`
      CREATE INDEX IF NOT EXISTS idx_api_calls_timestamp 
      ON api_calls(timestamp);
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_api_calls_endpoint 
      ON api_calls(endpoint);
    `);

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  }
}

// ===== HEALTH CHECK =====
app.get('/healthz', async (req, res) => {
  try {
    const result = await query('SELECT 1');
    console.log(`[${req.correlationId}] Health check passed`);
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error(`[${req.correlationId}] Health check failed:`, err.message);
    res.status(503).json({ status: 'unavailable', error: err.message });
  }
});

// ===== SWAGGER SETUP =====
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Metrics API',
      version: '1.0.0',
      description: 'API za spremljanje statistike klicev drugih storitev',
    },
    servers: [
      {
        url: 'http://localhost:4004',
        description: 'Development server',
      },
    ],
    components: {
      schemas: {
        ApiCallMetrics: {
          type: 'object',
          properties: {
            endpoint: { type: 'string', description: 'API endpoint' },
            method: { type: 'string', description: 'HTTP method' },
            call_count: { type: 'integer', description: 'Število klicev' },
            last_called: { type: 'string', format: 'date-time', description: 'Čas zadnjega klica' },
            avg_response_time: { type: 'number', description: 'Povprečno trajanje odziva v ms' },
          },
        },
        LastCalledEndpoint: {
          type: 'object',
          properties: {
            endpoint: { type: 'string' },
            method: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            service_name: { type: 'string' },
          },
        },
        MostCalledEndpoint: {
          type: 'object',
          properties: {
            endpoint: { type: 'string' },
            method: { type: 'string' },
            call_count: { type: 'integer' },
          },
        },
        EndpointCallCounts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              endpoint: { type: 'string' },
              method: { type: 'string' },
              call_count: { type: 'integer' },
            },
          },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

if (process.env.SWAGGER_ENABLED === '1' || process.env.NODE_ENV === 'development') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
}

// ===== API ENDPOINTS =====

/**
 * @swagger
 * /metrics/last-called:
 *   get:
 *     summary: Vrne zadnje klicani endpoint
 *     description: Vrne informacije o zadnje klicanem endpointu
 *     responses:
 *       200:
 *         description: Uspešno pridobljeni podatki
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LastCalledEndpoint'
 *       500:
 *         description: Napaka pri pridobivanju podatkov
 */
app.get('/metrics/last-called', async (req, res) => {
  try {
    console.log(`[${req.correlationId}] GET /metrics/last-called`);
    
    const result = await query(`
      SELECT endpoint, method, timestamp, service_name
      FROM api_calls
      ORDER BY timestamp DESC
      LIMIT 1;
    `);

    if (result.rows.length === 0) {
      return res.status(200).json({ message: 'Ni podatkov o klicih' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`[${req.correlationId}] Error fetching last called endpoint:`, err.message);
    res.status(500).json({ error: 'Napaka pri pridobivanju podatkov' });
  }
});

/**
 * @swagger
 * /metrics/most-called:
 *   get:
 *     summary: Vrne najpogosteje klicani endpoint
 *     description: Vrne informacije o najpogosteje klicanem endpointu z številom klicev
 *     responses:
 *       200:
 *         description: Uspešno pridobljeni podatki
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MostCalledEndpoint'
 *       500:
 *         description: Napaka pri pridobivanju podatkov
 */
app.get('/metrics/most-called', async (req, res) => {
  try {
    console.log(`[${req.correlationId}] GET /metrics/most-called`);
    
    const result = await query(`
      SELECT endpoint, method, COUNT(*) as call_count
      FROM api_calls
      GROUP BY endpoint, method
      ORDER BY call_count DESC
      LIMIT 1;
    `);

    if (result.rows.length === 0) {
      return res.status(200).json({ message: 'Ni podatkov o klicih' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`[${req.correlationId}] Error fetching most called endpoint:`, err.message);
    res.status(500).json({ error: 'Napaka pri pridobivanju podatkov' });
  }
});

/**
 * @swagger
 * /metrics/call-counts:
 *   get:
 *     summary: Vrne število klicev za vse endpointe
 *     description: Vrne seznam vseh endpointov s številom njihovih klicev, razporejene po številu klicev
 *     responses:
 *       200:
 *         description: Uspešno pridobljeni podatki
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EndpointCallCounts'
 *       500:
 *         description: Napaka pri pridobivanju podatkov
 */
app.get('/metrics/call-counts', async (req, res) => {
  try {
    console.log(`[${req.correlationId}] GET /metrics/call-counts`);
    
    const result = await query(`
      SELECT endpoint, method, COUNT(*)::int as call_count
      FROM api_calls
      GROUP BY endpoint, method
      ORDER BY COUNT(*) DESC;
    `);

    if (result.rows.length === 0) {
      return res.status(200).json([]);
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(`[${req.correlationId}] Error fetching call counts:`, err.message);
    res.status(500).json({ error: 'Napaka pri pridobivanju podatkov' });
  }
});

/**
 * @swagger
 * /metrics/record:
 *   post:
 *     summary: Zabeleži klic v statistiko
 *     description: POST zahtevek, ki ga kličejo druge storitve za beleženje svojih klicev
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - klicanaStoritev
 *             properties:
 *               klicanaStoritev:
 *                 type: string
 *                 description: 'Endpoint, ki je bil klican (npr. /registrirajUporabnika)'
 *               method:
 *                 type: string
 *                 default: 'GET'
 *                 description: 'HTTP metoda (GET, POST, PUT, DELETE, itd.)'
 *               service_name:
 *                 type: string
 *                 description: 'Ime storitve, ki je klicala endpoint'
 *               response_time_ms:
 *                 type: integer
 *                 description: 'Čas odziva v milisekundah'
 *     responses:
 *       200:
 *         description: Uspešno zabeležen klic
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: 'string' }
 *                 id: { type: 'integer' }
 *       400:
 *         description: Manjkajo zahtevani podatki
 *       500:
 *         description: Napaka pri beleženju klica
 */
app.post('/metrics/record', async (req, res) => {
  try {
    console.log(`[${req.correlationId}] POST /metrics/record`);
    
    const { klicanaStoritev, method = 'GET', service_name = 'unknown', response_time_ms = null } = req.body;

    // Validacija zahtevka
    if (!klicanaStoritev) {
      return res.status(400).json({ 
        error: 'Manjkajo zahtevani podatki',
        required: ['klicanaStoritev']
      });
    }

    // Zabeleži klic v bazo
    const result = await query(
      `INSERT INTO api_calls (service_name, endpoint, method, response_time_ms)
       VALUES ($1, $2, $3, $4)
       RETURNING id;`,
      [service_name, klicanaStoritev, method, response_time_ms]
    );

    console.log(`[${req.correlationId}] Recorded API call: ${service_name} -> ${klicanaStoritev}`);

    res.status(200).json({
      message: 'Klic je bil uspešno zabeležen',
      id: result.rows[0].id,
      data: {
        endpoint: klicanaStoritev,
        method,
        service_name,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (err) {
    console.error(`[${req.correlationId}] Error recording API call:`, err.message);
    res.status(500).json({ error: 'Napaka pri beleženju klica' });
  }
});

// ===== DELETE BACKLOG =====
app.delete('/metrics/backlog', async (req, res) => {
  try {
    console.log(`[${req.correlationId}] DELETE /metrics/backlog`);
    
    // Delete all records from api_calls table
    const result = await query('DELETE FROM api_calls;');

    console.log(`[${req.correlationId}] Deleted all metrics backlog records`);

    res.status(200).json({
      message: 'Vsi backlog zapisi so bili izbrisani',
      deleted_rows: result.rowCount
    });
  } catch (err) {
    console.error(`[${req.correlationId}] Error deleting backlog:`, err.message);
    res.status(500).json({ error: 'Napaka pri brisanju backlog-a' });
  }
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
  console.error(`[${req.correlationId}] Error:`, err);
  res.status(500).json({ error: 'Napaka strežnika' });
});

// ===== START SERVER =====
async function start() {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`[metrics-service] Server running on port ${PORT}`);
      console.log(`[metrics-service] API docs: http://localhost:${PORT}/api-docs`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

start();
