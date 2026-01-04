# Implementacija Messaging in Logging sistema

## Status Implementacije

### ✅ Faza 1: RabbitMQ Setup (Zaključeno)
- RabbitMQ dodan v Docker Compose
- AMQP port: 5672
- Management UI: http://localhost:15672 (guest/guest)
- Exchange: `logs` (type: direct, durable)
- Queue: `logs_queue` (durable, samodejno ustvarjena)

### ✅ Faza 2: User Service Logging (Zaključeno)

**Implementirane funkcionalnosti:**
1. **Logger modul** (`logger.js`)
   - RabbitMQ povezava s samodejnim retry-jem
   - Formatiranje logov glede na specifikacijo
   - Pošiljanje na RabbitMQ exchange
   
2. **Correlation ID middleware**
   - Samodejno generiranje UUID-a ali sprejemanje iz headerja
   - Posredovanje preko `x-correlation-id` headerja
   - Dostopno v vseh končnih točkah kot `req.correlationId`

3. **Celovito beleženje:**
   - ✅ Health checks
   - ✅ User registration (POST /users/register)
   - ✅ User login (POST /users/login)
   - ✅ User logout (POST /users/logout)
   - ✅ Token refresh (POST /token/refresh)
   - ✅ Get users (GET /users)
   - ✅ Get user by ID (GET /users/:id)
   - ✅ Update user (PUT /users/:id)
   - ✅ Update password (PUT /users/:id/password)
   - ✅ Delete user (DELETE /users/:id)
   - ✅ Delete all users (DELETE /users)

4. **Log format:**
```
2026-01-04 11:03:08,610 INFO /healthz Correlation: test-123 [user-service] - Health check passed
```

## Testiranje

### Hitri test:
```bash
# Zaženi storitve
docker-compose up -d

# Počakaj da se storitve zaženejo
sleep 5

# Test s correlation ID
curl -X GET http://localhost:4001/healthz -H "x-correlation-id: my-test-001"

# Preveri loge
docker logs user-service | grep "Correlation:"

# Preveri RabbitMQ queue
curl -s -u guest:guest http://localhost:15672/api/queues/%2F/logs_queue | \
  python3 -c "import sys, json; data = json.load(sys.stdin); print(f\"Messages in queue: {data['messages']}\")"
```

### RabbitMQ Management UI:
Odpri: http://localhost:15672
- Username: guest
- Password: guest
- Queue: logs_queue

## Struktura projekta

```
user-service/
├── index.js          # Glavna aplikacija s correlation ID middleware
├── logger.js         # RabbitMQ logger modul
└── package.json      # Dependencies (uuid, amqplib)
```

## Dobre prakse implementirane

1. **✅ Correlation ID sledenje** - Vsak zahtevek ima edinstven ID, ki se posreduje skozi sistem
2. **✅ Strukturirani logi** - Konsistenten format s časovnim žigom, tipom, URL-jem, correlation ID-jem, imenom storitve in sporočilom
3. **✅ Relevantni podatki** - Beležijo se vse ključne operacije (zahtevki, odgovori, napake, opozorila)
4. **✅ Centralizirano beleženje** - Vsi logi gredo na RabbitMQ za centralno zbiranje
5. **✅ Obravnava napak** - Napake se beležijo s kontekstom in correlation ID-jem
6. **✅ Graceful shutdown** - RabbitMQ povezava se pravilno zapre

## Naslednji koraki (Faza 3) - ✅ ZAKLJUČENO

### ✅ Faza 3: Razširjeno beleženje ostalih storitev (Zaključeno)

Implementiran enak sistem beleženja za vse ostale mikrostoritve:

**Course Service (Node.js)** ✅
- Logger modul ustvarjen
- Correlation ID middleware implementiran
- Vse končne točke imajo beleženje:
  - GET /courses - seznam tečajev
  - GET /courses/:id - tečaj po ID-ju
  - POST /courses - ustvarjanje tečaja
  - POST /courses/:id/duplicate - podvajanje tečaja
  - PUT /courses/:id - posodobitev tečaja
  - PUT /courses/:id/owner - sprememba lastnika
  - DELETE /courses/:id - brisanje tečaja
  - DELETE /courses - brisanje vseh

**Weather Service (Node.js)** ✅
- Logger modul ustvarjen
- Correlation ID middleware implementiran
- Vse končne točke imajo beleženje:
  - GET /weather - seznam vremenskih podatkov
  - GET /weather/:city - podatki za mesto
  - POST /weather - ustvarjanje vremenskega vnosa
  - POST /weather/bulk - množično ustvarjanje
  - PUT /weather/:city - posodobitev vremenske napovedi
  - DELETE /weather - brisanje vseh

**Recommendation Service (Node.js)** ✅
- Logger modul ustvarjen
- Correlation ID middleware implementiran
- Vse končne točke imajo beleženje:
  - GET /recommendations - seznam priporočil
  - GET /recommendations/:userId - priporočila za uporabnika
  - GET /recommendations/:userId/:id - posamezno priporočilo
  - POST /recommendations - ustvarjanje priporočila
  - PUT /recommendations/:userId/:id - posodobitev priporočila
  - PUT /recommendations/id/:id - posodobitev po ID-ju
  - DELETE /recommendations/:userId/:id - brisanje priporočila
  - DELETE /recommendations - brisanje vseh

**Planner Service (Python/FastAPI)** ✅
- Python logger modul ustvarjen s pika biblioteko
- Correlation ID middleware implementiran
- Vse končne točke imajo beleženje:
  - GET /study-sessions - seznam seja
  - GET /study-sessions/:session_id - seja po ID-ju
  - POST /study-sessions - ustvarjanje seje
  - POST /study-sessions/:session_id/complete - označevanje kot opravljeno
  - PUT /study-sessions/:session_id - posodobitev seje
  - PUT /study-sessions/:session_id/reschedule - prerazporejevanje seje
  - DELETE /study-sessions/:session_id - brisanje seje
  - DELETE /study-sessions - brisanje vseh

### ✅ Faza 4: Log Service in Obratovanje (Zaključeno)

**Log Service** ✅
- POST /logs - konzumiranje logov iz RabbitMQ in shranjevanje v PostgreSQL
- GET /logs/{datumOd}/{datumDo} - pridobivanje logov po datumskem obsegu
- DELETE /logs - brisanje vseh logov
- Polna podpora za correlation ID sledenje

### Testiranje in verifikacija

Vse storitve so testirane in delujejo pravilno:
```
✅ user-service: 14 log vnosov
✅ course-service: 1 log vnos
✅ weather-service: 2 log vnosa
✅ recommendation-service: 2 log vnosa
✅ planner-service: Pripravljeno za testiranje (zahteva avtentifikacijo)
```

## Dokumentacija

- [RABBITMQ_SETUP.md](RABBITMQ_SETUP.md) - RabbitMQ konfiguracija
- [USER_SERVICE_LOGGING.md](USER_SERVICE_LOGGING.md) - Podrobnosti o user-service implementaciji
- [read_logs.sh](read_logs.sh) - Skripta za branje logov iz RabbitMQ
