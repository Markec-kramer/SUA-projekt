# Recommendation Service

Simple Express microservice that stores recommendations in Redis.

Endpoints:
- GET /healthz -> 200 if Redis reachable
- GET /recommendations -> list all (optional query param userId)
- GET /recommendations/:userId -> list for user or 404
- POST /recommendations/:userId -> create new recommendation
- DELETE /recommendations/:userId -> delete all recommendations for user

Env vars:
- REDIS_HOST, REDIS_PORT, PORT, DEFAULT_TTL, CORS_ORIGIN

Run with docker-compose (from repo root):

    docker-compose up --build recommendation-db recommendation-service


