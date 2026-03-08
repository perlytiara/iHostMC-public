# Test dev tier override: set tier to Pro then confirm subscription status.
# Usage: .\scripts\test-tier-dev-override.ps1 -BaseUrl "http://51.75.53.62:3010" -Token "YOUR_JWT" -Secret "DEV_TIER_OVERRIDE_SECRET"
# Get Token: sign in at website or app, then from browser DevTools → Application → Local Storage (or Network tab copy Authorization header).
param(
    [Parameter(Mandatory=$true)] [string] $BaseUrl,
    [Parameter(Mandatory=$true)] [string] $Token,
    [Parameter(Mandatory=$true)] [string] $Secret,
    [string] $TierId = "pro"
)

$headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type" = "application/json"
    "X-Dev-Tier-Secret" = $Secret
}

Write-Host "1. Setting tier to $TierId..."
try {
    $body = @{ tierId = $TierId } | ConvertTo-Json
    $set = Invoke-RestMethod -Uri "$BaseUrl/api/dev/set-tier" -Method POST -Headers $headers -Body $body
    Write-Host "   Response: $($set | ConvertTo-Json -Compress)"
} catch {
    Write-Host "   ERROR: $_"
    exit 1
}

Write-Host "2. Getting subscription status..."
$authOnly = @{ "Authorization" = "Bearer $Token" }
try {
    $status = Invoke-RestMethod -Uri "$BaseUrl/api/subscription/status" -Headers $authOnly
    $plan = $status.tier.name
    $id = $status.tierId
    Write-Host "   Current plan: $plan (tierId: $id)"
} catch {
    Write-Host "   ERROR: $_"
    exit 1
}

if ($id -eq $TierId) {
    Write-Host "OK - Did it work? YES. Settings -> Account should show Current plan: $plan."
} else {
    Write-Host "UNEXPECTED - tierId is $id, expected $TierId. Check backend ALLOW_DEV_TIER_OVERRIDE and DEV_TIER_OVERRIDE_SECRET; run db:migrate."
    exit 1
}
