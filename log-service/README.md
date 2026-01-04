# Log Service - Centralna Storitev za Upravljanje Logov

## Pregled

Log Service je specializirana mikrostoritev, ki:
- Pobira loge iz RabbitMQ queue-ja
- Shranjuje jih v PostgreSQL bazo
- Omogoča iskanje logov po datumskem obdobju
- Omogoča brisanje vseh logov

## Endpoints

### 1. POST /logs
**Prenese vse loge iz RabbitMQ in jih shrani v bazo**

```bash
curl -X POST http://localhost:4006/logs
```

**Response:**
```json
{
  "success": true,
  "consumed": 15,
  "saved": 15,
  "message": "Successfully consumed 15 logs from RabbitMQ and saved to database"
}
```

**Funkcionalnost:**
- Poveže se na RabbitMQ
- Prebere VSE sporočila iz `logs_queue`
- Shrani jih v PostgreSQL tabelo `logs`
- Potrdi (ACK) uspešno obdelana sporočila
- Zavrne (NACK) sporočila s napako pri parsanju

---

### 2. GET /logs/{datumOd}/{datumDo}
**Vrne vse loge med dvema datumoma**

```bash
# Format datuma: YYYY-MM-DD
curl -X GET http://localhost:4006/logs/2026-01-01/2026-01-31
```

**Response:**
```json
{
  "success": true,
  "count": 42,
  "dateFrom": "2026-01-01",
  "dateTo": "2026-01-31",
  "logs": [
    {
      "id": 1,
      "timestamp": "2026-01-04T11:03:08.610Z",
      "service": "user-service",
      "message": "2026-01-04 11:03:08,610 INFO /healthz Correlation: test-123 [user-service] - Health check passed",
      "raw_data": {...},
      "created_at": "2026-01-04T11:05:00.000Z"
    },
    ...
  ]
}
```

**Parametri:**
- `datumOd` - Začetni datum (vključno)
- `datumDo` - Končni datum (vključno, do 23:59:59)

---

### 3. DELETE /logs
**Izbriše vse loge iz baze**

```bash
curl -X DELETE http://localhost:4006/logs
```

**Response:**
```json
{
  "success": true,
  "deleted": 42,
  "message": "Successfully deleted 42 logs from database"
}
```

⚠️ **OPOZORILO:** Ta operacija je nepreklicna!

---

### 4. GET /healthz
**Health check endpoint**

```bash
curl -X GET http://localhost:4006/healthz
```

**Response:**
```json
{
  "status": "ok",
  "service": "log-service"
}
```

## Struktura Baze

### Tabela: `logs`

| Stolpec | Tip | Opis |
|---------|-----|------|
| id | SERIAL | Primarni ključ |
| timestamp | TIMESTAMPTZ | Časovni žig iz loga |
| service | VARCHAR(255) | Ime mikrostoritve |
| message | TEXT | Formatiran log message |
| raw_data | JSONB | Surovi podatki iz RabbitMQ |
| created_at | TIMESTAMPTZ | Kdaj je bil log shranjen v bazo |

**Indeksi:**
- `idx_logs_timestamp` - Za hitre datumske poizvedbe

## Docker Compose Konfiguracija

```yaml
log-db:
  image: postgres:16-alpine
  ports:
    - "5436:5432"

log-service:
  build: ./log-service
  ports:
    - "4006:4006"
  environment:
    - DB_HOST=log-db
    - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672/
```

## Testiranje

### 1. Ustvari nekaj logov v user-service
```bash
curl -X GET http://localhost:4001/healthz -H "x-correlation-id: test-001"
curl -X GET http://localhost:4001/healthz -H "x-correlation-id: test-002"
curl -X GET http://localhost:4001/healthz -H "x-correlation-id: test-003"
```

### 2. Preveri število sporočil v RabbitMQ
```bash
curl -s -u guest:guest http://localhost:15672/api/queues/%2F/logs_queue | \
  python3 -c "import sys, json; data = json.load(sys.stdin); print(f\"Sporočil: {data['messages']}\")"
```

### 3. Prenesi loge iz RabbitMQ v bazo
```bash
curl -X POST http://localhost:4006/logs
```

### 4. Pridobi loge za danes
```bash
TODAY=$(date +%Y-%m-%d)
curl -X GET http://localhost:4006/logs/$TODAY/$TODAY
```

### 5. Izbriši vse loge
```bash
curl -X DELETE http://localhost:4006/logs
```

## Primeri Uporabe

### Scenario 1: Redno pobiranje logov
```bash
# Cron job, ki vsako uro pobere loge
0 * * * * curl -X POST http://localhost:4006/logs
```

### Scenario 2: Analiza logov za določen dan
```bash
# Preveri vse loge za včeraj
YESTERDAY=$(date -d yesterday +%Y-%m-%d)
curl -X GET http://localhost:4006/logs/$YESTERDAY/$YESTERDAY | jq '.logs'
```

### Scenario 3: Iskanje po correlation ID
```bash
# Pridobi loge in filtriraj po correlation ID
curl -X GET http://localhost:4006/logs/2026-01-01/2026-01-31 | \
  jq '.logs[] | select(.message | contains("test-123"))'
```

## Tehnične Podrobnosti

### RabbitMQ Povezava
- Uporablja `channel.get()` za enkratno branje vseh sporočil
- **noAck: false** - ročno potrjevanje sporočil
- ACK za uspešno obdelana sporočila
- NACK (brez requeue) za neveljavna sporočila

### Transakcije
- Uporaba BEGIN/COMMIT/ROLLBACK za atomičnost
- Če katera koli vstava v bazo spodleti, se vse vrne

### Error Handling
- Graceful degradacija pri napakah
- Logging vseh napak v konzolo
- HTTP status kode (200, 400, 500, 503)

## Omejitve in Priporočila

⚠️ **Omejitve:**
- POST /logs prebere VSE sporočila naenkrat (lahko traja pri velikih količinah)
- Ni paginacije pri GET /logs
- DELETE je globalna operacija brez filtriranja

✅ **Priporočila za produkcijo:**
- Dodaj avtentikacijo/avtorizacijo
- Implementiraj paginacijo za GET endpoint
- Dodaj filtering po service name, log level
- Implementiraj arhiviranje starih logov
- Dodaj rate limiting na POST endpoint
- Uporabi connection pooling za RabbitMQ

## Povezave

- **Service URL:** http://localhost:4006
- **Database Port:** 5436 (PostgreSQL)
- **RabbitMQ Queue:** logs_queue
- **Health Check:** http://localhost:4006/healthz
