import json
import pika
import uuid
from datetime import datetime

RABBITMQ_URL = 'amqp://guest:guest@rabbitmq:5672/'
EXCHANGE_NAME = 'logs'
ROUTING_KEY = 'log'
SERVICE_NAME = 'planner-service'

connection = None
channel = None
is_connecting = False


def get_timestamp():
    """Format timestamp as specified"""
    now = datetime.now()
    return now.strftime('%Y-%m-%d %H:%M:%S,') + f'{now.microsecond // 1000:03d}'


def format_log(timestamp, log_type, url, correlation_id, message):
    """Format log message according to specification"""
    return f'{timestamp} {log_type} {url} Correlation: {correlation_id} [{SERVICE_NAME}] - {message}'


def send_log_to_rabbitmq(log_message):
    """Send log to RabbitMQ"""
    global channel
    
    if channel is None:
        print(f'[Logger] RabbitMQ not connected, buffering log: {log_message}')
        return
    
    try:
        log_object = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'service': SERVICE_NAME,
            'message': log_message
        }
        
        channel.basic_publish(
            exchange=EXCHANGE_NAME,
            routing_key=ROUTING_KEY,
            body=json.dumps(log_object)
        )
    except Exception as e:
        print(f'[Logger] Failed to send log to RabbitMQ: {str(e)}')


def _log(log_type, url, correlation_id, message):
    """Internal logging function"""
    timestamp = get_timestamp()
    formatted_log = format_log(timestamp, log_type, url, correlation_id, message)
    
    # Always log to console
    print(formatted_log)
    
    # Send to RabbitMQ asynchronously
    try:
        send_log_to_rabbitmq(formatted_log)
    except Exception as e:
        print(f'[Logger] Error in sendLogToRabbitMQ: {str(e)}')


class Logger:
    """Logger class with methods for different log levels"""
    
    @staticmethod
    def info(url, correlation_id, message):
        _log('INFO', url, correlation_id, message)
    
    @staticmethod
    def error(url, correlation_id, message):
        _log('ERROR', url, correlation_id, message)
    
    @staticmethod
    def warn(url, correlation_id, message):
        _log('WARN', url, correlation_id, message)
    
    @staticmethod
    def debug(url, correlation_id, message):
        _log('DEBUG', url, correlation_id, message)


# Export convenience functions
def log_info(url, correlation_id, message):
    """Log info message"""
    _log('INFO', url, correlation_id, message)


def log_error(url, correlation_id, message):
    """Log error message"""
    _log('ERROR', url, correlation_id, message)


def log_warn(url, correlation_id, message):
    """Log warning message"""
    _log('WARN', url, correlation_id, message)


def log_debug(url, correlation_id, message):
    """Log debug message"""
    _log('DEBUG', url, correlation_id, message)


def initialize_logger():
    """Initialize RabbitMQ connection"""
    global connection, channel, is_connecting
    
    if connection is not None:
        return
    
    if is_connecting:
        # Wait for connection
        import time
        while connection is None:
            time.sleep(0.1)
        return
    
    is_connecting = True
    try:
        connection = pika.BlockingConnection(
            pika.URLParameters(RABBITMQ_URL)
        )
        channel = connection.channel()
        
        # Ensure exchange exists
        channel.exchange_declare(
            exchange=EXCHANGE_NAME,
            exchange_type='direct',
            durable=True
        )
        
        # Ensure queue exists
        channel.queue_declare(
            queue='logs_queue',
            durable=True
        )
        
        # Bind queue to exchange
        channel.queue_bind(
            exchange=EXCHANGE_NAME,
            queue='logs_queue',
            routing_key=ROUTING_KEY
        )
        
        print('[Logger] RabbitMQ connection established')
        print('[Logger] Exchange and queue configured successfully')
        is_connecting = False
    except Exception as e:
        print(f'[Logger] Failed to connect to RabbitMQ: {str(e)}')
        is_connecting = False
        # Retry connection after 5 seconds
        import time
        import threading
        def retry():
            time.sleep(5)
            initialize_logger()
        threading.Thread(target=retry, daemon=True).start()


def close_logger():
    """Close RabbitMQ connection"""
    global connection, channel
    
    try:
        if channel is not None:
            channel.close()
        if connection is not None:
            connection.close()
        print('[Logger] RabbitMQ connection closed')
    except Exception as e:
        print(f'[Logger] Error closing RabbitMQ connection: {str(e)}')


logger = Logger()
