<#
.SYNOPSIS
  Validates networking and storage of the TaskHive Docker Compose stack.

.DESCRIPTION
  1. Container health        - every service reports "healthy"
  2. Networking              - networks exist, correct membership, DNS service discovery,
                               allowed paths work, forbidden paths are blocked, port exposure
  3. Storage / persistence   - named volumes exist and are mounted; data written to
                               PostgreSQL, Redis and the log volume survives `compose down` + `up`

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\validate.ps1
#>
param(
  [switch]$SkipRestart   # skip the down/up persistence test
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# ---- read .env ----
$envVars = @{}
Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*[^#].*=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2
  $envVars[$k.Trim()] = $v.Trim()
}
$port = if ($envVars.APP_PORT) { $envVars.APP_PORT } else { '8080' }
$base = "http://localhost:$port"

$script:pass = 0
$script:fail = 0

function Section($title) { Write-Host "`n=== $title ===" -ForegroundColor Cyan }

function Check([string]$name, [scriptblock]$test) {
  $detail = ''
  try { $ok = [bool](& $test) } catch { $ok = $false; $detail = $_.Exception.Message }
  if ($ok) { Write-Host "  [PASS] $name" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "  [FAIL] $name $detail" -ForegroundColor Red; $script:fail++ }
}

# Runs a command inside a container; returns $true when it exits 0.
function Exec-Ok([string]$container, [string]$cmd) {
  docker exec $container sh -c $cmd *> $null
  return ($LASTEXITCODE -eq 0)
}

# The backend image has no nc, so use Node's net module for a raw TCP check.
function Test-TcpFromBackend([string]$hostName, [int]$p) {
  $js = "require('net').connect($p,'$hostName').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
  docker exec taskhive-backend node -e $js *> $null
  return ($LASTEXITCODE -eq 0)
}

function Test-HostPort([int]$p) {
  $c = New-Object Net.Sockets.TcpClient
  try { return $c.ConnectAsync('127.0.0.1', $p).Wait(1500) -and $c.Connected } catch { return $false } finally { $c.Close() }
}

$containers = 'taskhive-frontend', 'taskhive-backend', 'taskhive-db', 'taskhive-redis'

# ==========================================================================
Section '1. Container health'
docker compose ps --format 'table {{.Name}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
foreach ($c in $containers) {
  Check "$c is healthy" { (docker inspect -f '{{.State.Health.Status}}' $c) -eq 'healthy' }
}

# ==========================================================================
Section '2. Networking'
$feNet = 'taskhive_frontend_net'
$beNet = 'taskhive_backend_net'
foreach ($n in $feNet, $beNet) {
  $info = docker network inspect $n -f '{{.Driver}} subnet={{range .IPAM.Config}}{{.Subnet}}{{end}} internal={{.Internal}}' 2>$null
  Write-Host "  $n : $info" -ForegroundColor DarkGray
}
Check "$beNet is marked internal" { (docker network inspect $beNet -f '{{.Internal}}') -eq 'true' }

$feMembers = docker network inspect $feNet -f '{{range .Containers}}{{.Name}} {{end}}'
$beMembers = docker network inspect $beNet -f '{{range .Containers}}{{.Name}} {{end}}'
Write-Host "  $feNet members: $feMembers" -ForegroundColor DarkGray
Write-Host "  $beNet members: $beMembers" -ForegroundColor DarkGray
Check 'frontend_net = { frontend, backend }' { $feMembers -match 'taskhive-frontend' -and $feMembers -match 'taskhive-backend' -and $feMembers -notmatch 'taskhive-db' -and $feMembers -notmatch 'taskhive-redis' }
Check 'backend_net  = { backend, db, redis }' { $beMembers -match 'taskhive-backend' -and $beMembers -match 'taskhive-db' -and $beMembers -match 'taskhive-redis' -and $beMembers -notmatch 'taskhive-frontend' }

Write-Host "`n  Allowed paths (DNS service discovery + connectivity):" -ForegroundColor DarkGray
Check 'frontend -> backend:5000 (HTTP /api/health)' { Exec-Ok 'taskhive-frontend' 'wget -qO- -T 5 http://backend:5000/api/health | grep -q status.:.ok' }
Check 'backend  -> db:5432 (TCP)' { Test-TcpFromBackend 'db' 5432 }
Check 'backend  -> redis:6379 (TCP)' { Test-TcpFromBackend 'redis' 6379 }
Check 'redis responds to authenticated PING' { (docker exec taskhive-redis redis-cli ping) -eq 'PONG' }

Write-Host "`n  Blocked paths (isolation):" -ForegroundColor DarkGray
Check 'frontend -X-> db:5432     (cannot resolve/reach)' { -not (Exec-Ok 'taskhive-frontend' 'nc -z -w 3 db 5432') }
Check 'frontend -X-> redis:6379  (cannot resolve/reach)' { -not (Exec-Ok 'taskhive-frontend' 'nc -z -w 3 redis 6379') }
Check 'db       -X-> internet    (internal network)' { -not (Exec-Ok 'taskhive-db' 'wget -q -T 4 -O /dev/null http://example.com') }
Check 'redis    -X-> internet    (internal network)' { -not (Exec-Ok 'taskhive-redis' 'nc -z -w 4 1.1.1.1 80') }

Write-Host "`n  Host port exposure:" -ForegroundColor DarkGray
Check "host -> localhost:$port serves the web app" { (Invoke-WebRequest "$base/" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 }
Check "host -> localhost:$port/api proxied to backend" { (Invoke-RestMethod "$base/api/health" -TimeoutSec 5).status -eq 'ok' }
Check 'backend port 5000 NOT published to host' { -not (Test-HostPort 5000) }
Check 'postgres port 5432 NOT published to host' { -not (Test-HostPort 5432) }
Check 'redis port 6379 NOT published to host' { -not (Test-HostPort 6379) }

# ==========================================================================
Section '3. Storage'
$volumes = @{ 'taskhive_pg_data' = 'taskhive-db'; 'taskhive_redis_data' = 'taskhive-redis'; 'taskhive_app_logs' = 'taskhive-backend' }
foreach ($v in $volumes.Keys) {
  $mp = docker volume inspect $v -f '{{.Mountpoint}}' 2>$null
  Write-Host "  $v -> $mp" -ForegroundColor DarkGray
  Check "volume $v exists and is mounted in $($volumes[$v])" {
    $LASTEXITCODE -eq 0 -and ((docker inspect $volumes[$v] -f '{{range .Mounts}}{{.Name}} {{end}}') -match $v)
  }
}

# ---- write test data ----
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$email = "persist-$stamp@taskhive.test"
$password = 'Persist-Pass-123'
$projectName = "Persistence check $stamp"

$reg = Invoke-RestMethod "$base/api/auth/register" -Method Post -ContentType 'application/json' `
  -Body (@{ name = 'Volume Tester'; email = $email; password = $password; workspace = "Lab $stamp" } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($reg.token)" }
$null = Invoke-RestMethod "$base/api/projects" -Method Post -Headers $headers -ContentType 'application/json' `
  -Body (@{ name = $projectName; description = 'Created by validate.ps1' } | ConvertTo-Json)
docker exec taskhive-redis redis-cli SET "lab:persist" $stamp | Out-Null
$logBefore = [int](docker exec taskhive-backend sh -c 'wc -l < /app/logs/access.log')

Write-Host "  Wrote: user $email, project '$projectName', redis key lab:persist=$stamp, access.log=$logBefore lines" -ForegroundColor DarkGray

if ($SkipRestart) {
  Write-Host '  (skipping restart test)' -ForegroundColor Yellow
} else {
  Write-Host "`n  Tearing the stack down (containers + networks removed, volumes kept)..." -ForegroundColor Yellow
  docker compose down 2>&1 | Out-Null
  Check 'all containers removed after down' { -not (docker ps -aq --filter 'name=taskhive-') }
  Check 'volumes survive compose down' { (docker volume ls -q --filter 'name=taskhive_') -match 'taskhive_pg_data' }

  Write-Host '  Recreating the stack...' -ForegroundColor Yellow
  docker compose up -d --wait 2>&1 | Out-Null
  Check 'stack healthy again after up' { ($containers | Where-Object { (docker inspect -f '{{.State.Health.Status}}' $_) -ne 'healthy' }).Count -eq 0 }
}

Write-Host "`n  Verifying data after restart:" -ForegroundColor DarkGray
Check 'PostgreSQL: user can still log in' {
  $script:login = Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType 'application/json' `
    -Body (@{ email = $email; password = $password } | ConvertTo-Json)
  [bool]$script:login.token
}
Check 'PostgreSQL: project still exists' {
  $p = Invoke-RestMethod "$base/api/projects" -Headers @{ Authorization = "Bearer $($script:login.token)" }
  @($p.projects | Where-Object { $_.name -eq $projectName }).Count -eq 1
}
Check 'Redis: key restored from AOF on volume' { (docker exec taskhive-redis redis-cli GET 'lab:persist') -eq $stamp }
Check 'Logs: access.log kept previous entries' { [int](docker exec taskhive-backend sh -c 'wc -l < /app/logs/access.log') -ge $logBefore }

# ==========================================================================
Section 'Summary'
$color = if ($script:fail -eq 0) { 'Green' } else { 'Red' }
Write-Host "  $($script:pass) passed, $($script:fail) failed" -ForegroundColor $color
exit $script:fail
