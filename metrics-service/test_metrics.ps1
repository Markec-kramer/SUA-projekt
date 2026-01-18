# test_metrics.ps1 - PowerShell test script za Metrics Service
# Uporaba: powershell -ExecutionPolicy Bypass -File test_metrics.ps1

$metricsUrl = "http://localhost:4007"
$script:testCount = 0
$script:passCount = 0

function Write-Test {
    param([string]$Message, [string]$Color = "Green")
    Write-Host "[$($script:testCount)] $Message" -ForegroundColor $Color
}

function Test-Endpoint {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$Body,
        [string]$Description
    )
    
    $script:testCount++
    
    try {
        $uri = "$metricsUrl$Endpoint"
        $params = @{
            Uri = $uri
            Method = $Method
            ContentType = "application/json"
            ErrorAction = "Stop"
        }
        
        if ($Body) {
            $params["Body"] = $Body
        }
        
        $response = Invoke-WebRequest @params
        $script:passCount++
        Write-Test "✓ $Description" "Green"
        return $response.Content | ConvertFrom-Json
    }
    catch {
        Write-Test "✗ $Description - Error: $($_.Exception.Message)" "Red"
        return $null
    }
}

Clear-Host
Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   METRICS SERVICE - TEST SUITE        ║" -ForegroundColor Cyan
Write-Host "║   PowerShell Edition                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check
Write-Host "━━━ GROUP 1: BASIC TESTS ━━━" -ForegroundColor Yellow
Write-Host ""

$health = Test-Endpoint -Method "GET" -Endpoint "/healthz" -Description "Health Check"
if ($health) {
    Write-Host "Status: $($health.status)" -ForegroundColor Green
}
Write-Host ""

# Test 2-5: Record API Calls
Write-Host "━━━ GROUP 2: RECORDING CALLS ━━━" -ForegroundColor Yellow
Write-Host ""

$call1 = Test-Endpoint -Method "POST" -Endpoint "/metrics/record" `
    -Body '{"klicanaStoritev": "/registrirajUporabnika", "method": "POST", "service_name": "user-service", "response_time_ms": 125}' `
    -Description "Record Call #1: /registrirajUporabnika"

$call2 = Test-Endpoint -Method "POST" -Endpoint "/metrics/record" `
    -Body '{"klicanaStoritev": "/login", "method": "POST", "service_name": "user-service", "response_time_ms": 87}' `
    -Description "Record Call #2: /login"

$call3 = Test-Endpoint -Method "POST" -Endpoint "/metrics/record" `
    -Body '{"klicanaStoritev": "/login", "method": "POST", "service_name": "user-service", "response_time_ms": 92}' `
    -Description "Record Call #3: /login (duplicate)"

$call4 = Test-Endpoint -Method "POST" -Endpoint "/metrics/record" `
    -Body '{"klicanaStoritev": "/getProfil", "method": "GET", "service_name": "user-service", "response_time_ms": 142}' `
    -Description "Record Call #4: /getProfil"

Write-Host ""

# Test 6: Get Last Called
Write-Host "━━━ GROUP 3: QUERY TESTS ━━━" -ForegroundColor Yellow
Write-Host ""

$lastCalled = Test-Endpoint -Method "GET" -Endpoint "/metrics/last-called" `
    -Description "Get Last Called Endpoint"
if ($lastCalled) {
    Write-Host "  Last: $($lastCalled.endpoint) ($($lastCalled.method)) at $($lastCalled.timestamp)" -ForegroundColor Cyan
}
Write-Host ""

# Test 7: Get Most Called
$mostCalled = Test-Endpoint -Method "GET" -Endpoint "/metrics/most-called" `
    -Description "Get Most Called Endpoint"
if ($mostCalled) {
    Write-Host "  Most: $($mostCalled.endpoint) ($($mostCalled.method)) - $($mostCalled.call_count) times" -ForegroundColor Cyan
}
Write-Host ""

# Test 8: Get Call Counts
$callCounts = Test-Endpoint -Method "GET" -Endpoint "/metrics/call-counts" `
    -Description "Get Call Counts (All Endpoints)"
if ($callCounts) {
    Write-Host "  Summary:" -ForegroundColor Cyan
    foreach ($item in $callCounts) {
        Write-Host "    - $($item.endpoint) ($($item.method)): $($item.call_count) calls" -ForegroundColor Cyan
    }
}
Write-Host ""

# Test 9-11: Error Handling
Write-Host "━━━ GROUP 4: ERROR HANDLING ━━━" -ForegroundColor Yellow
Write-Host ""

$errorTest1 = Test-Endpoint -Method "POST" -Endpoint "/metrics/record" `
    -Body '{"method": "GET"}' `
    -Description "Missing Required Field"

$errorTest2 = Test-Endpoint -Method "POST" -Endpoint "/metrics/record" `
    -Body '{}' `
    -Description "Empty Body"

# Non-existent endpoint
$errorTest3 = Test-Endpoint -Method "GET" -Endpoint "/metrics/invalid" `
    -Description "Non-existent Endpoint (should fail)"

Write-Host ""

# Test 12: Load Test (Multiple Calls)
Write-Host "━━━ GROUP 5: LOAD TEST ━━━" -ForegroundColor Yellow
Write-Host ""

Write-Host "Recording 50 additional calls..." -ForegroundColor Cyan

$loadTestSuccess = 0
for ($i = 1; $i -le 50; $i++) {
    $endpoint = @("/testA", "/testB", "/testC", "/testD")[(Get-Random -Minimum 0 -Maximum 4)]
    $method = @("GET", "POST")[(Get-Random -Minimum 0 -Maximum 2)]
    
    try {
        $response = Invoke-WebRequest -Uri "$metricsUrl/metrics/record" `
            -Method POST `
            -ContentType "application/json" `
            -Body @{
                klicanaStoritev = $endpoint
                method = $method
                service_name = "load-test"
                response_time_ms = (Get-Random -Minimum 50 -Maximum 150)
            } | ConvertFrom-Json
        
        $loadTestSuccess++
        
        if ($i % 10 -eq 0) {
            Write-Host "  ✓ $i calls recorded" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "  ✗ Failed to record call $i" -ForegroundColor Red
    }
}

Write-Test "Load Test: $loadTestSuccess/50 calls recorded" $(if ($loadTestSuccess -eq 50) { "Green" } else { "Yellow" })
Write-Host ""

# Final Summary
Write-Host "━━━ FINAL SUMMARY ━━━" -ForegroundColor Yellow
Write-Host ""

$finalCallCounts = Test-Endpoint -Method "GET" -Endpoint "/metrics/call-counts" `
    -Description "Final Call Counts"

if ($finalCallCounts) {
    Write-Host "Final Statistics:" -ForegroundColor Cyan
    $totalCalls = 0
    foreach ($item in $finalCallCounts) {
        $totalCalls += $item.call_count
        Write-Host "  $($item.endpoint): $($item.call_count) calls" -ForegroundColor Cyan
    }
    Write-Host "  Total: $totalCalls calls" -ForegroundColor Yellow
}
Write-Host ""

# Summary Stats
$successRate = if ($script:testCount -gt 0) { [math]::Round(($script:passCount / $script:testCount) * 100) } else { 0 }

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   TEST RESULTS                        ║" -ForegroundColor Cyan
Write-Host "║   Tests Run: $script:testCount".PadRight(36) + "║" -ForegroundColor Cyan
Write-Host "║   Tests Passed: $script:passCount".PadRight(33) + "║" -ForegroundColor Cyan
Write-Host "║   Success Rate: $successRate%".PadRight(33) + "║" -ForegroundColor $(if ($successRate -ge 90) { "Green" } else { "Yellow" })
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan

if ($successRate -ge 80) {
    Write-Host ""
    Write-Host "✓ Tests completed successfully!" -ForegroundColor Green
}
else {
    Write-Host ""
    Write-Host "⚠ Some tests failed. Check the output above." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "View Swagger docs: http://localhost:4007/api-docs" -ForegroundColor Cyan
