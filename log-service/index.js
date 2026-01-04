const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const amqp = require('amqplib');

const app = express();
app.use(cors());
app.use(express.json());

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
