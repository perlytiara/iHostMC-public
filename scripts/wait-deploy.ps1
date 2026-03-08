# Poll builder health until deploy is not in progress. Usage: .\scripts\wait-deploy.ps1 [-BuilderUrl "http://51.75.53.62:9090"]
param([string] $BuilderUrl = "http://51.75.53.62:9090")
do {
  Start-Sleep -Seconds 5
  $h = Invoke-RestMethod -Uri "$BuilderUrl/health" -ErrorAction Stop
  Write-Host "deployInProgress: $($h.deployInProgress)"
} while ($h.deployInProgress -eq $true)
$h | ConvertTo-Json -Depth 5
