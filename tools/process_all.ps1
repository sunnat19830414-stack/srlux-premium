# process_all.ps1 - Batch photo processing for srlux.uz
# Run from PowerShell:
#   cd C:\srlux_photos
#   $env:ANTHROPIC_API_KEY = "sk-ant-..."
#   .\process_all.ps1

$ScriptDir     = "C:\srlux_photos"
$ProcessorPath = "C:\srlux_photos\smart_photo_processor.py"

if (-not $env:ANTHROPIC_API_KEY) {
    $key = Read-Host "Enter ANTHROPIC_API_KEY"
    $env:ANTHROPIC_API_KEY = $key
}

$Models = [ordered]@{
    "3015"     = "white,anthracite,black"
    "3030"     = "white,anthracite,black"
    "5025"     = "white,anthracite,black"
    "6012"     = "white,anthracite,black"
    "6812"     = "white,anthracite,black"
    "GLF7575A" = "white,anthracite,black"
    "GZ2"      = "white,anthracite,black"
    "GZ3"      = "white,anthracite,black"
    "GZ4"      = "white,anthracite,black"
    "JDC22"    = "white,anthracite,black"
}

$Total  = $Models.Count
$Done   = 0
$Errors = @()

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  srlux.uz - batch photo processing" -ForegroundColor Cyan
Write-Host "  Models: $Total" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($SKU in $Models.Keys) {
    $Colors = $Models[$SKU]
    $Input  = "$ScriptDir\ishodnye\$SKU"
    $Output = "$ScriptDir\gotovye\$SKU"

    # Try Russian folder names as well
    $InputRu = "$ScriptDir\исходные\$SKU"
    $OutputRu = "$ScriptDir\готовые\$SKU"

    if (Test-Path $InputRu) {
        $Input  = $InputRu
        $Output = $OutputRu
    }

    Write-Host "-----------------------------------------" -ForegroundColor DarkGray
    Write-Host "[$($Done+1)/$Total] SKU: $SKU | Colors: $Colors" -ForegroundColor Yellow
    Write-Host "  Input : $Input"
    Write-Host "  Output: $Output"
    Write-Host ""

    if (-not (Test-Path $Input)) {
        Write-Host "  [SKIP] Folder not found: $Input" -ForegroundColor DarkYellow
        $Done++
        continue
    }

    $Files = Get-ChildItem $Input -File | Where-Object { $_.Extension -match '\.(jpg|jpeg|png|webp|bmp)$' }
    if ($Files.Count -eq 0) {
        Write-Host "  [SKIP] No images in folder" -ForegroundColor DarkYellow
        $Done++
        continue
    }
    Write-Host "  Files: $($Files.Count)" -ForegroundColor Green

    $Start = Get-Date
    python $ProcessorPath --input $Input --output $Output --sku $SKU --colors $Colors
    $Exit = $LASTEXITCODE
    $Elapsed = [math]::Round(((Get-Date) - $Start).TotalSeconds)

    if ($Exit -eq 0) {
        Write-Host ""
        Write-Host "  [OK] Done in ${Elapsed}s" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "  [ERROR] Exit code: $Exit" -ForegroundColor Red
        $Errors += $SKU
    }

    $Done++
    Write-Host ""
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  DONE: $($Done - $Errors.Count)/$Total models processed" -ForegroundColor Cyan
if ($Errors.Count -gt 0) {
    Write-Host "  Errors: $($Errors -join ', ')" -ForegroundColor Red
}
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next step - copy to server:" -ForegroundColor White
Write-Host '  scp -r C:\srlux_photos\gotovye\ root@srlux.uz:/var/www/srlux-premium/static/products/' -ForegroundColor Gray
Write-Host ""
