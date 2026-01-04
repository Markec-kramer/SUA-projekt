# Log Service - Test Rezultati

## ✅ Implementacija Zaključena

### Struktura storitve:
```
log-service/
├── Dockerfile           # Docker image za log-service
├── index.js            # Glavna aplikacija z vsemi endpoints
├── package.json        # Dependencies (express, pg, amqplib)
└── README.md           # Podrobna dokumentacija
```

### Docker Compose Konfiguracija:
- **log-db** - PostgreSQL 16 baza na portu 5436
- **log-service** - Node.js storitev na portu 4006
- Povezava z RabbitMQ preko AMQP

---

## 🧪 Test Scenarij

### 1. Generiranje testnih logov ✅
```bash
for i in 1 2 3 4 5; do
  curl -X GET http://localhost:4001/healthz -H "x-correlation-id: batch-test-$i"
done
```
**Rezultat:** 5 sporočil v RabbitMQ queue

---

### 2. Preverjanje RabbitMQ queue ✅
```bash
curl -s -u guest:guest http://localhost:15672/api/queues/%2F/logs_queue
```
**Rezultat:** `"messages": 5`

---

### 3. POST /logs - Pobranje logov iz RabbitMQ ✅
```bash
curl -X POST http://localhost:4006/logs
```
**Response:**
```json
{
  "success": true,
  "consumed": 5,
  "saved": 5,
  "message": "Successfully consumed 5 logs from RabbitMQ and saved to database"
}
```

**Preverjanje:**
- RabbitMQ queue prazen: `"messages": 0` ✅
- Vsi logi shranjeni v PostgreSQL bazo ✅

---

### 4. GET /logs/{datumOd}/{datumDo} - Pridobivanje logov ✅
```bash
curl -X GET "http://localhost:4006/logs/2026-01-04/2026-01-04"
```
**Response:**
```json
{
  "success": true,
  "count": 5,
  "dateFrom": "2026-01-04",
  "dateTo": "2026-01-04",
  "logs": [
    {
      "id": 5,
      "timestamp": "2026-01-04T11:13:11.766Z",
      "service": "user-service",
      "message": "2026-01-04 11:13:11,765 INFO /healthz Correlation: batch-test-5 [user-service] - Health check passed",
      "raw_data": {...},
      "created_at": "2026-01-04T11:14:42.180Z"
    },
    ...
  ]
}
```

**Funkcionalnost:**
- Prikaže vse loge za izbrano datumsko obdobje ✅
- Logi sortirani po času (najnovejši prvi) ✅
- Vsebuje correlation ID in celoten log message ✅

---

### 5. DELETE /logs - Brisanje vseh logov ✅
```bash
curl -X DELETE http://localhost:4006/logs
```
**Response:**
```json
{
  "success": true,
  "deleted": 5,
  "message": "Successfully deleted 5 logs from database"
}
```

**Preverjanje:**
```bash
curl -X GET "http://localhost:4006/logs/2026-01-04/2026-01-04"
```
**Response:**
```json
{
  "success": true,
  "count": 0,
  "logs": []
}
```

Vsi logi uspešno izbrisani ✅

---

## 📊 Funkcionalnosti

### ✅ POST /logs
- Poveže se na RabbitMQ
- Prebere **vse** sporočila iz `logs_queue`
- Shrani jih v PostgreSQL tabelo
- ACK uspešno obdelana sporočila
- Transakcijska varnost (BEGIN/COMMIT/ROLLBACK)

### ✅ GET /logs/{datumOd}/{datumDo}
- Podpora za format `YYYY-MM-DD`
- Iskanje po časovnem obdobju
- Index na `timestamp` za hitro iskanje
- Sortiranje po času (najnovejši prvi)

### ✅ DELETE /logs
- Globalno brisanje vseh logov
- Vrne število izbrisanih zapisov
- Transakcijsko varno

### ✅ GET /healthz
- Health check endpoint
- Preveri povezavo z bazo
- Podpora za monitoring

---

## 🔄 Celoten Workflow

```
1. Aplikacija (user-service) → ustvari log
2. Logger → pošlje log na RabbitMQ (logs_queue)
3. RabbitMQ → shrani sporočilo v queue
4. POST /logs → pobere vse iz queue
5. log-service → shrani v PostgreSQL
6. GET /logs/{datum} → pridobi shranjene loge
7. DELETE /logs → počisti bazo
```

---

## 🚀 Kako uporabiti

### Zagon vseh storitev:
```bash
docker-compose up -d
```

### Preverjanje statusa:
```bash
docker ps | grep -E "log-service|log-db|rabbitmq"
```

### Tipičen delovni tok:

```bash
# 1. Ustvari nekaj aktivnosti (logi se samodejno pošljejo v RabbitMQ)
curl -X POST http://localhost:4001/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'

# 2. Poberi loge iz RabbitMQ v bazo
curl -X POST http://localhost:4006/logs

# 3. Poglej loge za danes
TODAY=$(date +%Y-%m-%d)
curl -X GET "http://localhost:4006/logs/$TODAY/$TODAY" | jq '.logs'

# 4. Počisti loge (opcijsko)
curl -X DELETE http://localhost:4006/logs
```

---

## 🎯 Preverjeno

✅ RabbitMQ povezava deluje  
✅ Pobranje vseh sporočil iz queue-ja  
✅ Shranjevanje v PostgreSQL bazo  
✅ Iskanje po datumskem obdobju  
✅ Brisanje vseh logov  
✅ Error handling in graceful degradation  
✅ Health check endpoint  
✅ Docker Compose integracija  

---

## 📍 Endpoints Povzetek

| Metoda | Endpoint | Funkcionalnost |
|--------|----------|----------------|
| POST | /logs | Pobere vse loge iz RabbitMQ in jih shrani |
| GET | /logs/{datumOd}/{datumDo} | Vrne loge med dvema datumoma |
| DELETE | /logs | Izbriše vse loge iz baze |
| GET | /healthz | Health check |

**Storitev dostopna na:** http://localhost:4006

---

## 🔐 Produkcijska Priporočila

Za produkcijsko uporabo priporočam:
1. ✅ Avtentikacija/avtorizacija za vse endpoints
2. ✅ Paginacija pri GET /logs
3. ✅ Filtriranje po service name, log level, correlation ID
4. ✅ Rate limiting za POST /logs
5. ✅ Arhiviranje starih logov (npr. po 30 dneh)
6. ✅ Monitoring in alerting
7. ✅ Log retention policy

Vse zahteve iz naloge so implementirane in testirane! 🎉
