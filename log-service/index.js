const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const amqp = require('amqplib');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const corsOptions = {
  origin: FRONTEND_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

console.log(`[log-service] FRONTEND_ORIGIN=${FRONTEND_ORIGIN}`);
console.log('[log-service] CORS options:', corsOptions);

app.use(cors(corsOptions));
app.use(express.json());

// ===== CORRELATION ID MIDDLEWARE =====
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
});

// ===== METRICS REPORTING MIDDLEWARE =====
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
      service_name: 'log-service',
      response_time_ms: responseTime
    }).catch(err => {
      console.warn(`[${req.correlationId}] Failed to record metric:`, err.message);
    });

    // Call the original end method
    originalEnd.call(res, chunk, encoding);
  };

  next();
});

const PORT = process.env.PORT || 4006;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672/';
const QUEUE_NAME = 'logs_queue';

// PostgreSQL pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'log_service',
  password: process.env.DB_PASSWORD || 'log_password',
  database: process.env.DB_NAME || 'log_db',
});

// Initialize database
async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL,
        service VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        raw_data JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // Create index for faster date range queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
    `);
    
    console.log('Log database initialized');
  } finally {
    client.release();
  }
}

// POST /logs - Consume all messages from RabbitMQ and save to database
app.post('/logs', async (req, res) => {
  let connection;
  let channel;
  let consumedCount = 0;
  
  try {
    // Connect to RabbitMQ
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    
    // Get all messages from queue
    let msg;
    const messages = [];
    
    // Consume all available messages
    while ((msg = await channel.get(QUEUE_NAME, { noAck: false })) !== false) {
      try {
        const logData = JSON.parse(msg.content.toString());
        messages.push(logData);
        channel.ack(msg);
        consumedCount++;
      } catch (parseError) {
        console.error('Error parsing message:', parseError);
        channel.nack(msg, false, false); // Reject and don't requeue
      }
    }
    
    // Save all messages to database
    if (messages.length > 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        for (const logData of messages) {
          await client.query(
            `INSERT INTO logs (timestamp, service, message, raw_data) 
             VALUES ($1, $2, $3, $4)`,
            [
              logData.timestamp || new Date(),
              logData.service || 'unknown',
              logData.message || '',
              JSON.stringify(logData)
            ]
          );
        }
        
        await client.query('COMMIT');
        console.log(`Saved ${messages.length} logs to database`);
      } catch (dbError) {
        await client.query('ROLLBACK');
        throw dbError;
      } finally {
        client.release();
      }
    }
    
    res.json({
      success: true,
      consumed: consumedCount,
      saved: messages.length,
      message: `Successfully consumed ${consumedCount} logs from RabbitMQ and saved to database`
    });
    
  } catch (error) {
    console.error('Error consuming logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to consume logs from RabbitMQ'
    });
  } finally {
    try {
      if (channel) await channel.close();
      if (connection) await connection.close();
    } catch (closeError) {
      console.error('Error closing RabbitMQ connection:', closeError);
    }
  }
});

// GET /logs/:datumOd/:datumDo - Get logs between two dates
app.get('/logs/:datumOd/:datumDo', async (req, res) => {
  const { datumOd, datumDo } = req.params;
  
  try {
    // Parse dates (format: YYYY-MM-DD)
    const dateFrom = new Date(datumOd);
    const dateTo = new Date(datumDo);
    
    // Set dateTo to end of day
    dateTo.setHours(23, 59, 59, 999);
    
    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }
    
    const result = await pool.query(
      `SELECT id, timestamp, service, message, raw_data, created_at 
       FROM logs 
       WHERE timestamp >= $1 AND timestamp <= $2 
       ORDER BY timestamp DESC`,
      [dateFrom, dateTo]
    );
    
    res.json({
      success: true,
      count: result.rows.length,
      dateFrom: datumOd,
      dateTo: datumDo,
      logs: result.rows
    });
    
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to fetch logs from database'
    });
  }
});

// DELETE /logs - Delete all logs from database
app.delete('/logs', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM logs');
    
    res.json({
      success: true,
      deleted: result.rowCount,
      message: `Successfully deleted ${result.rowCount} logs from database`
    });
    
  } catch (error) {
    console.error('Error deleting logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to delete logs from database'
    });
  }
});

// Health check endpoint
app.get('/healthz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'log-service' });
  } catch (error) {
    res.status(503).json({ status: 'error', error: error.message });
  }
});

// TEST ENDPOINT - Generate dummy log data for testing/demo
// Usage: POST /test/generate-logs?count=100
app.post('/test/generate-logs', async (req, res) => {
  try {
    const count = parseInt(req.query.count || '100', 10);

    // Different services, endpoints, and patterns
    const services = ['user-service', 'course-service', 'planner-service', 'weather-service', 'recommendation-service'];
    const endpoints = {
      'user-service': ['/users', '/users/1', '/users/2', '/login', '/token/refresh', '/healthz'],
      'course-service': ['/courses', '/courses/1', '/courses/2', '/courses/3', '/healthz'],
      'planner-service': ['/study-sessions', '/study-sessions/1', '/study-sessions/2', '/healthz'],
      'weather-service': ['/weather', '/weather/Ljubljana', '/weather/Maribor', '/healthz'],
      'recommendation-service': ['/recommendations', '/recommendations/1', '/healthz']
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < count; i++) {
        const service = services[Math.floor(Math.random() * services.length)];
        const endpointsList = endpoints[service];
        const endpoint = endpointsList[Math.floor(Math.random() * endpointsList.length)];

        // Create timestamp from last 7 days
        const daysAgo = Math.floor(Math.random() * 7);
        const timestamp = new Date();
        timestamp.setDate(timestamp.getDate() - daysAgo);
        timestamp.setHours(Math.floor(Math.random() * 24));
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));

        const message = `${timestamp.toISOString().split('T')[0]} ${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}:${String(timestamp.getSeconds()).padStart(2, '0')} INFO ${endpoint} Correlation: test-${i}`;

        const rawData = {
          path: endpoint,
          service: service,
          method: 'GET',
          statusCode: Math.random() > 0.95 ? 500 : 200
        };

        await client.query(
          `INSERT INTO logs (timestamp, service, message, raw_data) 
           VALUES ($1, $2, $3, $4)`,
          [timestamp, service, message, JSON.stringify(rawData)]
        );
      }

      await client.query('COMMIT');
      res.json({
        success: true,
        message: `Generated ${count} dummy log entries`,
        generated: count
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error generating test logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to generate test logs'
    });
  }
});

// Start server
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Log service listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize log service:', error);
    process.exit(1);
  });
