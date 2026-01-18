#!/bin/bash

# test_metrics.sh - Testni script za Metrics Service
# Uporaba: ./test_metrics.sh

set -e

METRICS_URL="http://localhost:4007"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== METRICS SERVICE TEST SCRIPT ===${NC}\n"

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
health=$(curl -s -w "\n%{http_code}" $METRICS_URL/healthz)
http_code=$(echo "$health" | tail -n1)
response=$(echo "$health" | head -n-1)

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}✓ Health check passed${NC}"
    echo "Response: $response"
else
    echo -e "${RED}✗ Health check failed (HTTP $http_code)${NC}"
    exit 1
fi

echo ""

# Test 2: Record first API call
echo -e "${YELLOW}Test 2: Record API Call #1${NC}"
response=$(curl -s -X POST $METRICS_URL/metrics/record \
  -H "Content-Type: application/json" \
  -d '{
    "klicanaStoritev": "/registrirajUporabnika",
    "method": "POST",
    "service_name": "user-service",
    "response_time_ms": 125
  }')

echo "Response: $response"
echo ""

# Test 3: Record second API call
echo -e "${YELLOW}Test 3: Record API Call #2${NC}"
response=$(curl -s -X POST $METRICS_URL/metrics/record \
  -H "Content-Type: application/json" \
  -d '{
    "klicanaStoritev": "/login",
    "method": "POST",
    "service_name": "user-service",
    "response_time_ms": 87
  }')

echo "Response: $response"
echo ""

# Test 4: Record duplicate call
echo -e "${YELLOW}Test 4: Record API Call #3 (duplicate)${NC}"
response=$(curl -s -X POST $METRICS_URL/metrics/record \
  -H "Content-Type: application/json" \
  -d '{
    "klicanaStoritev": "/login",
    "method": "POST",
    "service_name": "user-service",
    "response_time_ms": 92
  }')

echo "Response: $response"
echo ""

# Test 5: Record third endpoint
echo -e "${YELLOW}Test 5: Record API Call #4${NC}"
response=$(curl -s -X POST $METRICS_URL/metrics/record \
  -H "Content-Type: application/json" \
  -d '{
    "klicanaStoritev": "/getProfil",
    "method": "GET",
    "service_name": "user-service",
    "response_time_ms": 142
  }')

echo "Response: $response"
echo ""

# Test 6: Get last called endpoint
echo -e "${YELLOW}Test 6: Last Called Endpoint${NC}"
response=$(curl -s $METRICS_URL/metrics/last-called)
echo "Response: $response"
echo ""

# Test 7: Get most called endpoint
echo -e "${YELLOW}Test 7: Most Called Endpoint${NC}"
response=$(curl -s $METRICS_URL/metrics/most-called)
echo "Response: $response"
echo ""

# Test 8: Get call counts
echo -e "${YELLOW}Test 8: Call Counts${NC}"
response=$(curl -s $METRICS_URL/metrics/call-counts)
echo "Response: $response"
echo ""

# Test 9: Validate error handling
echo -e "${YELLOW}Test 9: Error Handling (missing required field)${NC}"
response=$(curl -s -X POST $METRICS_URL/metrics/record \
  -H "Content-Type: application/json" \
  -d '{"method": "GET"}')

echo "Response: $response"
echo ""

echo -e "${GREEN}=== ALL TESTS COMPLETED ===${NC}"
