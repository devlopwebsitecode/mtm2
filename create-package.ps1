$projectRoot = $PSScriptRoot
$outputZip = Join-Path (Split-Path -Parent $projectRoot) "MTM2-Handball-v1.0.0-Offline.zip"

Write-Host "Creating MTM2 Offline Windows package: $outputZip" -ForegroundColor Cyan

$tempDist = Join-Path $projectRoot "dist_temp"
if (Test-Path $tempDist) { Remove-Item $tempDist -Recurse -Force }
New-Item -ItemType Directory -Path $tempDist -Force | Out-Null

$items = @("app.js", "biomechanics-worker.js", "icon.ico", "icon.svg", "index.html", "Install-Windows.bat", "manifest.json", "package.json", "README.md", "server.js", "Start-MTM2.bat", "Stop-MTM2.bat", "sw.js", "node_modules", "runtime", "vendor")

foreach ($item in $items) {
    $src = Join-Path $projectRoot $item
    if (Test-Path $src) {
        Write-Host "  -> Copying $item..." -ForegroundColor Gray
        Copy-Item -Path $src -Destination (Join-Path $tempDist $item) -Recurse -Force
    }
}

if (Test-Path $outputZip) { Remove-Item $outputZip -Force }
Write-Host "  -> Compressing to ZIP archive..." -ForegroundColor Yellow
Compress-Archive -Path "$tempDist\*" -DestinationPath $outputZip -CompressionLevel Optimal

Remove-Item $tempDist -Recurse -Force

if (Test-Path $outputZip) {
    $sizeMb = [math]::Round(((Get-Item $outputZip).Length / 1MB), 2)
    Write-Host "[SUCCESS] Package ready: $outputZip ($sizeMb MB)" -ForegroundColor Green
}
