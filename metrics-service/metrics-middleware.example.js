/**
 * METRICS INTEGRATION EXAMPLE
 * 
 * To integrate metrics tracking into your service:
 * 1. Add axios to your package.json dependencies
 * 2. Add this middleware to your service after app.use(express.json())
 * 3. Update METRICS_SERVICE_URL to match your deployment
 */

const axios = require('axios');

/**
 * Middleware to record API calls to metrics service
 * 
 * Usage: app.use(metricsMiddleware);
 */
const metricsMiddleware = async (req, res, next) => {
  const startTime = Date.now();
  
  // Store original res.json to intercept responses
  const originalJson = res.json;
  let responseStatus = res.statusCode;
  
  res.json = function(data) {
    responseStatus = res.statusCode;
    return originalJson.call(this, data);
  };

  // Capture response status
  const originalSend = res.send;
  res.send = function(data) {
    responseStatus = res.statusCode;
    return originalSend.call(this, data);
  };

  // When response is finished, record the metric
  res.on('finish', async () => {
    const responseTime = Date.now() - startTime;
    
    // Skip health checks and internal endpoints
    if (req.path === '/healthz' || req.path.startsWith('/internal/')) {
      return;
    }

    try {
      const METRICS_SERVICE_URL = process.env.METRICS_SERVICE_URL || 'http://metrics-service:4007';
      const SERVICE_NAME = process.env.SERVICE_NAME || 'user-service';
      
      await axios.post(`${METRICS_SERVICE_URL}/metrics/record`, {
        klicanaStoritev: req.path,
        method: req.method,
        service_name: SERVICE_NAME,
        response_time_ms: responseTime
      }, {
        timeout: 5000, // 5 second timeout
        headers: {
          'x-correlation-id': req.correlationId // pass correlation ID if available
        }
      });
    } catch (err) {
      // Log error but don't fail the request
      console.warn(`[METRICS] Failed to record metric for ${req.method} ${req.path}:`, err.message);
    }
  });

  next();
};

module.exports = metricsMiddleware;
