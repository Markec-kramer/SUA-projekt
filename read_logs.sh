#!/bin/bash

# Simple RabbitMQ queue message reader
# Usage: ./read_logs.sh [count]
# count: number of messages to read (default: 10)

COUNT=${1:-10}

echo "Reading $COUNT messages from logs_queue..."
echo "=========================================="

for i in $(seq 1 $COUNT); do
  MESSAGE=$(curl -s -u guest:guest \
    -X POST \
    http://localhost:15672/api/queues/%2F/logs_queue/get \
    -H 'content-type: application/json' \
    -d "{\"count\":1,\"ackmode\":\"ack_requeue_false\",\"encoding\":\"auto\"}")
  
  if [ "$MESSAGE" = "[]" ]; then
    echo "No more messages in queue"
    break
  fi
  
  echo "$MESSAGE" | python3 -c "
import sys, json
idx = $i
data = json.load(sys.stdin)
if data:
    msg = data[0]
    payload = json.loads(msg['payload'])
    print(f\"Message {idx}:\")
    print(f\"  {payload['message']}\")
    print()
"
done

echo "=========================================="
echo "Done reading messages"
