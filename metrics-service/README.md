# Metrics Service

Metrics storitev je namenjena beleženju in analizi statistike klicev ostalih storitev v sistemu.

## Opis

Metrics Service je RESTful API, ki omogoča:
- **Beleženje** klicev API-jev drugih storitev
- **Spremljanje** popularnosti endpointov
- **Analizo** vzorcev klicanja

## Funkcionalnosti

### 4 Ključni Endpointi

#### 1. GET `/metrics/last-called`
Vrne informacije o zadnje klicanem endpointu.

**Primer odziva:**
```json
{
  "endpoint": "/registrirajUporabnika",
  "method": "POST",
  "timestamp": "2026-01-18T12:34:56.789Z",
  "service_name": "user-service"
}
```

#### 2. GET `/metrics/most-called`
Vrne najpogosteje klicani endpoint s številom klicev.

**Primer odziva:**
```json
{
  "endpoint": "/login",
  "method": "POST",
  "call_count": 156
}
```

#### 3. GET `/metrics/call-counts`
Vrne seznam vseh endpointov s številom njihovih klicev, razporejene po številu klicev (padajoče).

**Primer odziva:**
```json
[
  {
    "endpoint": "/login",
    "method": "POST",
    "call_count": 156
  },
  {
    "endpoint": "/registrirajUporabnika",
    "method": "POST",
    "call_count": 87
  },
  {
    "endpoint": "/getProfil",
    "method": "GET",
    "call_count": 234
  }
]
```

#### 4. POST `/metrics/record`
Zabeleži klic v statistiko. Kličejo ga druge storitve.

**Zahtevek:**
```json
{
  "klicanaStoritev": "/registrirajUporabnika",
  "method": "POST",
  "service_name": "user-service",
  "response_time_ms": 125
}
```

**Primer odziva:**
```json
{
  "message": "Klic je bil uspešno zabeležen",
  "id": 42,
  "data": {
    "endpoint": "/registrirajUporabnika",
    "method": "POST",
    "service_name": "user-service",
    "timestamp": "2026-01-18T12:34:56.789Z"
  }
}
```

## Swagger Dokumentacija

API dokumentacija je dostopna na:
```
http://localhost:4007/api-docs
```

## Tehnična Specifikacija

- **Framework:** Express.js
- **Baza:** PostgreSQL
- **Port:** 4007
- **Dokumentacija:** Swagger/OpenAPI 3.0

## Kako Ga Uporabljati v Drugih Storitvah

Druge storitve bi morale klicati POST `/metrics/record` endpoint vsakič, ko je njihov endpoint klican.

### Primer v Express.js:

```javascript
const axios = require('axios');

// Middleware, ki beleži klic
app.use(async (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', async () => {
    const responseTime = Date.now() - startTime;
    
    try {
      await axios.post('http://metrics-service:4007/metrics/record', {
        klicanaStoritev: req.path,
        method: req.method,
        service_name: 'user-service', // ali druga storitev
        response_time_ms: responseTime
      });
    } catch (err) {
      console.error('Error recording metric:', err.message);
    }
  });
  
  next();
});
```

## Okoljske Spremenljivke

- `DB_HOST` - PostgreSQL host (default: localhost)
- `DB_PORT` - PostgreSQL port (default: 5432)
- `DB_USER` - PostgreSQL uporabnik (default: metrics_service)
- `DB_PASSWORD` - PostgreSQL geslo (default: metrics_password)
- `DB_NAME` - Ime baze (default: metrics_db)
- `PORT` - Port storitve (default: 4007)
- `SWAGGER_ENABLED` - Omogoči Swagger (default: "1")
- `CORS_ORIGIN` - CORS origin (default: http://localhost:5173)

## Zdravstveni Pregled

Preverite здравје storitve:
```bash
GET /healthz
```

Vrne `{ status: 'ok' }` če je baza dostopna.
