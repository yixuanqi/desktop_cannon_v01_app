# Read only by default. Never kill unrelated process names.
$ErrorActionPreference = 'Stop'
$procs = @(Get-CimInstance Win32_Process -Filter "Name = 'desktop-cannon.exe'" -ErrorAction SilentlyContinue)
if ($procs.Count -eq 0) {
  Write-Host '[OK] No pre-existing desktop-cannon.exe process.' -ForegroundColor Green
  exit 0
}
Write-Host '[WARNING] Existing Desktop Cannon processes detected:' -ForegroundColor Yellow
$procs | ForEach-Object { Write-Host ("  PID={0}, PATH={1}" -f $_.ProcessId, $_.ExecutablePath) }
Write-Host 'A previous process may draw V0.6.0 debug grids over the new build.' -ForegroundColor Yellow
$choice = Read-Host 'Close these desktop-cannon.exe processes now? (Y/N)'
if ($choice -match '^[Yy]$') {
  foreach ($proc in $procs) {
    try { Stop-Process -Id $proc.ProcessId -ErrorAction Stop }
    catch { Write-Host ("Failed PID={0}: {1}" -f $proc.ProcessId, $_) -ForegroundColor Red; exit 1 }
  }
  Start-Sleep -Milliseconds 500
  exit 0
}
exit 1
