# User Service - Logging Implementation

## Pregled

User service je sada konfiguriran sa kompletnim logging sistemom koji koristi RabbitMQ kao message broker. Svi logovi se šalju na `logs` exchange u formatu:

```
<timestamp> <LogType> <URL> Correlation: <CorrelationId> [user-service] - <Poruka>
```

## Implementacija

### 1. Logger modul (`logger.js`)

- Inicijalizuje RabbitMQ konekciju
- Formatira loge prema specifikaciji
- Prosljeđuje loge na RabbitMQ exchange
- Logira sve u console istovremeno

### 2. Correlation ID Middleware

Svaki HTTP zahtjev automatski dobija:
- **Correlation ID** - Ili se prosleđuje via `x-correlation-id` header ili se generiše novi UUID
- Header se dodaje odgovoru kako bi frontend mogao pratiti request across servisa

### 3. Logiranje u Endpointi

Svi ključni endpointi su instruirani sa logiranjem:

#### Uspešne operacije (INFO)
- User registration
- User login
- User logout
- Fetching users
- Updating user data

#### Greške (ERROR)
- Database failures
- Connection errors
- Invalid operations

#### Upozorenja (WARN)
- Missing users
- Invalid credentials
- Deleted resources

### 4. Log Format Primeri

```
2025-01-04 15:23:45,123 INFO /users Correlation: 550e8400-e29b-41d4-a716-446655440000 [user-service] - Fetching all users

2025-01-04 15:24:12,456 INFO /users/login Correlation: 550e8400-e29b-41d4-a716-446655440001 [user-service] - Login attempt for email: test@example.com

2025-01-04 15:25:33,789 ERROR /users Correlation: 550e8400-e29b-41d4-a716-446655440002 [user-service] - Error fetching users: Connection timeout
```

## Dependencies

Dodane dependencies:
```json
{
  "uuid": "^9.0.0",
  "amqplib": "^0.10.3"
}
```

## RabbitMQ Konekcija

- **URL**: `amqp://guest:guest@rabbitmq:5672/`
- **Exchange**: `logs` (type: direct, durable)
- **Routing Key**: `log`
- **Queue**: `logs_queue` (pravi se automatski sa docker-compose)

## Correlation ID Praćenje

### Kako funkcionira:

1. **Request dolazi** → Middleware proverava `x-correlation-id` header
2. **Ako nema** → Generiše se novi UUID
3. **Se čuva u** `req.correlationId`
4. **Dodeljuje se header-u odgovora** (`x-correlation-id`)

Ovo omogućava da se prate zahtevi kroz više mikrostoritev ako se prosleđuje isti correlation ID.

## Testiranje

### Pokretanje Docker Compose:
```bash
docker-compose up -d
```

### Test zahteva sa Correlation ID:
```bash
# bez correlation ID (generiše se novi)
curl -X GET http://localhost:4001/healthz

# sa specificiranim correlation ID
curl -H "x-correlation-id: test-123" \
     -X GET http://localhost:4001/healthz
```

### Proveravanje logova u konzoli:
```bash
docker logs user-service | grep "Correlation:"
```

### Proveravanje logova u RabbitMQ:

#### Option 1: RabbitMQ Management UI
1. Otvorite RabbitMQ Management UI: `http://localhost:15672` (guest/guest)
2. Idite u **Queues** sekciju
3. Kliknite na `logs_queue`
4. U sekciji "Get messages" kliknite "Get Message(s)" da vidite loge

#### Option 2: RabbitMQ API
```bash
# Proveri broj poruka u queue-u
curl -s -u guest:guest http://localhost:15672/api/queues/%2F/logs_queue | \
  python3 -c "import sys, json; data = json.load(sys.stdin); print(f\"Messages: {data['messages']}\")"

# Pročitaj jednu poruku (bez brisanja)
curl -s -u guest:guest -X POST http://localhost:15672/api/queues/%2F/logs_queue/get \
  -H 'content-type: application/json' \
  -d '{"count":1,"ackmode":"ack_requeue_true","encoding":"auto"}' | \
  python3 -c "import sys, json; data=json.load(sys.stdin); print(json.loads(data[0]['payload'])['message']) if data else print('No messages')"
```

### Test scenarij:
```bash
# 1. Health check
curl -X GET http://localhost:4001/healthz -H "x-correlation-id: test-001"

# 2. User registration
curl -X POST http://localhost:4001/users/register \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: test-002" \
  -d '{"email":"test@example.com", "password":"password123", "name":"Test User"}'

# 3. User login
curl -X POST http://localhost:4001/users/login \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: test-003" \
  -d '{"email":"test@example.com", "password":"password123"}'

# 4. Proveri loge
docker logs user-service | grep "Correlation:" | tail -10
```

## Proverena funkcionalnost

✅ RabbitMQ konekcija se uspešno inicijalizuje  
✅ Exchange i Queue se automatski kreiraju  
✅ Correlation ID se generiše ili prosleđuje kroz header  
✅ Svi logovi se formatiraju prema specifikaciji  
✅ Logovi se šalju u RabbitMQ `logs_queue`  
✅ Logovi se takođe prikazuju u Docker konzoli  
✅ Graceful shutdown pravilno zatvara konekcije

## Graceful Shutdown

Aplikacija pravilno gasi RabbitMQ konekciju pri shutdownu:
- Na `SIGTERM` ili `SIGINT` signale
- Zatvara sve konekcije
- Šalje finalni log pre nego što se zatvori

## Sledeće korake

Sada trebam da implementiram isti logging sistem u ostale mikrostoritve:
- course-service
- planner-service
- weather-service
- recommendation-service
