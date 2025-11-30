# Weather Service

Small Express microservice that caches weather data in Redis.

Endpoints:
- GET /healthz -> 200 if Redis reachable
- GET /weather/:city -> 200 JSON or 404
- PUT /weather/:city -> 201 when stored
- DELETE /weather/:city -> 204 when deleted