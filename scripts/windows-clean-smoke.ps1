<#
  Real Windows basic executable/runtime smoke. Does NOT certify Explorer visual
  effects: it only checks the binary exists, SHA256, WebView2 presence and that
  the app process can start in an INTERACTIVE Windows session.
#>
param(
  [Parameter(Mandatory=$true)][string]$ExePath,
  [switch]$SkipLaunch
)
$ErrorActionPreference='Stop'
$exe=(Resolve-Path $ExePath).Path
if (-not $exe.ToLowerInvariant().EndsWith('.exe')) { throw 'Expected executable (.exe)' }
Write-Host "Executable: $exe"
$hash=(Get-FileHash -Algorithm SHA256 -Path $exe).Hash
Write-Host "SHA256: $hash"
Write-Host "File version: $((Get-Item $exe).VersionInfo.FileVersion)"
$runtimeGuid='{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
$runtimeKeys=@(
  "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$runtimeGuid",
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$runtimeGuid",
  "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$runtimeGuid"
)
$webview = $null
foreach($key in $runtimeKeys){
  if(Test-Path $key){$v=(Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).pv;if($v){$webview=$v;break}}
}
if($webview){Write-Host "WebView2 registered version: $webview"}
else{Write-Warning 'WebView2 registry entry not found. Portable EXE may not start. Check Microsoft WebView2 Runtime.'}
if($SkipLaunch){Write-Host 'Launch skipped';exit 0}
Write-Host 'Starting desktop cannon; the app will be left running for interactive checks.'
$proc=Start-Process -FilePath $exe -PassThru
Start-Sleep -Seconds 3
$proc.Refresh()
if($proc.HasExited){throw "Desktop Cannon exited during startup (exit code $($proc.ExitCode))"}
Write-Host "Process running: PID=$($proc.Id) [basic startup smoke passed]"
Write-Host 'Now verify W01-W16 manually, including Explorer icon physics, DPI, tray and exit.'
