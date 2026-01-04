# RabbitMQ Logging Setup

## Overview

RabbitMQ je namenjen kot centralni message broker za logging v vsem sistemu. Vse mikrostoritve bodo pošiljale svoje loge na RabbitMQ, ki jih bo shranil v dedicirani logging queue.

## Konfiguracija

### RabbitMQ v Docker Compose

RabbitMQ je dodan v `docker-compose.yml` z naslednjimi karakteristikami:

- **Image**: `rabbitmq:3.13-management-alpine`
- **Container**: `rabbitmq`
- **AMQP Port**: `5672` (za aplikacije)
- **Management UI**: `15672` (web interface dostopen na `http://localhost:15672`)
- **Credentials**: 
  - Username: `guest`
  - Password: `guest`
- **Volume**: `rabbitmq_data` (za persistentnost podatkov)

### Exchange in Queue

Avtomatično so ustvarjeni:

- **Exchange**: `logs` (type: direct, durable: true)
- **Queue**: `logs_queue` (durable: true)
- **Binding**: `logs_queue` je vezan na exchange `logs` z routing key `log`

## Dostop do RabbitMQ

### Iz aplikacij (znotraj Docker):
```
amqp://guest:guest@rabbitmq:5672/
```

### Management UI:
```
http://localhost:15672
```
Credentials: `guest` / `guest`

## Kaj se zgodi v naslednjem delu

V naslednje fazi boste dodali kodo v vsako mikrostoritev, ki bo:

1. Vzpostavila povezavo z RabbitMQ
2. Pošiljala loge na `logs` exchange z routing key `log`
3. Logirala vse relevantne dogajaje (zahtevke, odgovore, napake, itd.)

## Testiranje

Ko poženete Docker Compose:

```bash
docker-compose up
```

RabbitMQ bo avtomatsko inicijaliziran in bo pripravljen za sprejemanje logov.

Lahko tudi preverite Management UI na `http://localhost:15672` in vidite ustvarjeni exchange in queue.
