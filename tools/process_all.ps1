# ─────────────────────────────────────────────────────────────────
# process_all.ps1 — Пакетная обработка фото для всех моделей srlux.uz
#
# Запуск из PowerShell:
#   cd C:\srlux_photos
#   .\process_all.ps1
#
# Требования:
#   pip install Pillow anthropic numpy
#   $env:ANTHROPIC_API_KEY = "sk-ant-..."
# ─────────────────────────────────────────────────────────────────

# ── Настройки ─────────────────────────────────────────────────────
$ScriptDir   = "C:\srlux_photos"          # Папка с исходными / готовые
$ProcessorPath = "C:\srlux_photos\smart_photo_processor.py"  # Скрипт

# Проверяем API ключ
if (-not $env:ANTHROPIC_API_KEY) {
    $key = Read-Host "Введите ANTHROPIC_API_KEY"
    $env:ANTHROPIC_API_KEY = $key
}

# ── Модели для обработки ──────────────────────────────────────────
# Формат: SKU = "список цветов"
# Уберите # в начале строки чтобы включить модель

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

# ── Запуск ────────────────────────────────────────────────────────
$Total   = $Models.Count
$Done    = 0
$Errors  = @()

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  srlux.uz — пакетная обработка фото" -ForegroundColor Cyan
Write-Host "  Моделей: $Total" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($SKU in $Models.Keys) {
    $Colors  = $Models[$SKU]
    $Input   = "$ScriptDir\исходные\$SKU"
    $Output  = "$ScriptDir\готовые\$SKU"

    Write-Host "─────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "[$($Done+1)/$Total] Модель: $SKU | Цвета: $Colors" -ForegroundColor Yellow
    Write-Host "  Источник : $Input"
    Write-Host "  Результат: $Output"
    Write-Host ""

    # Проверяем что папка с исходниками существует
    if (-not (Test-Path $Input)) {
        Write-Host "  ⚠️  Папка не найдена, пропускаю: $Input" -ForegroundColor DarkYellow
        $Done++
        continue
    }

    # Считаем файлы в папке
    $Files = Get-ChildItem $Input -File -Include "*.jpg","*.jpeg","*.png","*.webp","*.bmp"
    if ($Files.Count -eq 0) {
        Write-Host "  ⚠️  Нет изображений в папке, пропускаю" -ForegroundColor DarkYellow
        $Done++
        continue
    }
    Write-Host "  Файлов: $($Files.Count)" -ForegroundColor Green

    # Запускаем обработчик
    $Start = Get-Date
    python $ProcessorPath --input $Input --output $Output --sku $SKU --colors $Colors
    $Exit = $LASTEXITCODE
    $Elapsed = [math]::Round(((Get-Date) - $Start).TotalSeconds)

    if ($Exit -eq 0) {
        Write-Host ""
        Write-Host "  Готово за ${Elapsed}с" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "  ОШИБКА (код $Exit)" -ForegroundColor Red
        $Errors += $SKU
    }

    $Done++
    Write-Host ""
}

# ── Итог ──────────────────────────────────────────────────────────
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  ИТОГ: обработано $($Done - $Errors.Count)/$Total моделей" -ForegroundColor Cyan
if ($Errors.Count -gt 0) {
    Write-Host "  Ошибки: $($Errors -join ', ')" -ForegroundColor Red
}
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Следующий шаг:" -ForegroundColor White
Write-Host "  1. Скопируйте папку готовые\ на сервер:" -ForegroundColor White
Write-Host "     scp -r C:\srlux_photos\готовые\ root@srlux.uz:/var/www/srlux-premium/static/products/" -ForegroundColor Gray
Write-Host "  2. Запустите SQL команды из вывода скрипта для обновления БД" -ForegroundColor White
Write-Host ""
Read-Host "Нажмите Enter для выхода"
