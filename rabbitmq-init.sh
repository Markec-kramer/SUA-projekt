#!/bin/bash

# Wait for RabbitMQ to be ready
rabbitmqctl wait /var/lib/rabbitmq/mnesia

# Declare exchange and queue for logging
rabbitmq-admin declare exchange name=logs type=direct durable=true
rabbitmq-admin declare queue name=logs_queue durable=true
rabbitmq-admin declare binding source=logs destination=logs_queue routing_key=log

echo "RabbitMQ Exchange and Queue initialized successfully"
