const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672/';
const EXCHANGE_NAME = 'logs';
const ROUTING_KEY = 'log';
const SERVICE_NAME = 'user-service';

let connection = null;
let channel = null;
let isConnecting = false;

// Initialize RabbitMQ connection
async function initializeLogger() {
  if (connection) return;
  if (isConnecting) {
    // Wait for connection to be established
    await new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (connection && channel) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
    return;
  }

  isConnecting = true;
  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    
    // Ensure exchange exists
    await channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
    
    // Ensure queue exists
    await channel.assertQueue('logs_queue', { durable: true });
    
    // Bind queue to exchange
    await channel.bindQueue('logs_queue', EXCHANGE_NAME, ROUTING_KEY);
    
    console.log('[Logger] RabbitMQ connection established');
    console.log('[Logger] Exchange and queue configured successfully');
    isConnecting = false;
  } catch (err) {
    console.error('[Logger] Failed to connect to RabbitMQ:', err.message);
    isConnecting = false;
    // Retry connection after 5 seconds
    setTimeout(initializeLogger, 5000);
  }
}

// Format timestamp
function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${date} ${hours}:${minutes}:${seconds},${ms}`;
}

// Format log message according to specification
function formatLog(timestamp, logType, url, correlationId, message) {
  return `${timestamp} ${logType} ${url} Correlation: ${correlationId} [${SERVICE_NAME}] - ${message}`;
}

// Send log to RabbitMQ
async function sendLogToRabbitMQ(logMessage) {
  if (!channel) {
    console.log('[Logger] RabbitMQ not connected yet, buffering log:', logMessage);
    return;
  }

  try {
    const logObject = {
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
      message: logMessage
    };
    
    await channel.publish(
      EXCHANGE_NAME,
      ROUTING_KEY,
      Buffer.from(JSON.stringify(logObject))
    );
  } catch (err) {
    console.error('[Logger] Failed to send log to RabbitMQ:', err.message);
  }
}

// Internal logging function
function _log(logType, url, correlationId, message) {
  const timestamp = getTimestamp();
  const formattedLog = formatLog(timestamp, logType, url, correlationId, message);
  
  // Always log to console
  console.log(formattedLog);
  
  // Send to RabbitMQ asynchronously (don't block)
  sendLogToRabbitMQ(formattedLog).catch(err => {
    console.error('[Logger] Error in sendLogToRabbitMQ:', err.message);
  });
}

// Public logging functions
const logger = {
  info: (url, correlationId, message) => {
    _log('INFO', url, correlationId, message);
  },

  error: (url, correlationId, message) => {
    _log('ERROR', url, correlationId, message);
  },

  warn: (url, correlationId, message) => {
    _log('WARN', url, correlationId, message);
  },

  debug: (url, correlationId, message) => {
    _log('DEBUG', url, correlationId, message);
  }
};

// Graceful shutdown
async function closeLogger() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('[Logger] RabbitMQ connection closed');
  } catch (err) {
    console.error('[Logger] Error closing RabbitMQ connection:', err.message);
  }
}

module.exports = {
  initializeLogger,
  logger,
  closeLogger
};
