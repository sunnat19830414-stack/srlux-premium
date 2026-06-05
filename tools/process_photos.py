#!/usr/bin/env python3
"""
process_photos.py — Пакетная обработка фото товаров для srlux.uz
Использование:
  pip install Pillow
  python process_photos.py --input ./исходные --output ./готовые

Что делает:
  - Приводит к квадрату 800×800 px с белым фоном
  - Небольшие отступы вокруг товара (5%)
  - Лёгкое улучшение яркости и чёткости
  - Сохраняет в WebP (лёгкий формат) и JPEG (запасной)
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
except ImportError:
    print("Установите Pillow: pip install Pillow")
    sys.exit(1)

OUTPUT_SIZE = 800          # px — итоговый размер квадрата
PADDING_PCT = 0.05         # 5% отступ вокруг товара
BRIGHTNESS = 1.05          # лёгкое осветление (1.0 = без изменений)
CONTRAST = 1.08            # лёгкое увеличение контраста
SHARPNESS = 1.2            # лёгкое увеличение чёткости
WEBP_QUALITY = 88          # качество WebP (1-100)
JPEG_QUALITY = 90          # качество JPEG (1-100)

SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}


def process_image(src: Path, dst_dir: Path) -> None:
    img = Image.open(src).convert("RGBA")

    # Если PNG с прозрачностью — компонуем на белый фон
    background = Image.new("RGBA", img.size, (255, 255, 255, 255))
    background.paste(img, mask=img.split()[3] if img.mode == "RGBA" else None)
    img = background.convert("RGB")

    # Автообрезка пустых полей (белый/светлый фон вокруг товара)
    gray = img.convert("L")
    bbox = ImageOps.invert(gray).getbbox()
    if bbox:
        # Расширяем bbox на padding
        w, h = img.size
        pad_x = int(w * PADDING_PCT)
        pad_y = int(h * PADDING_PCT)
        x1 = max(0, bbox[0] - pad_x)
        y1 = max(0, bbox[1] - pad_y)
        x2 = min(w, bbox[2] + pad_x)
        y2 = min(h, bbox[3] + pad_y)
        img = img.crop((x1, y1, x2, y2))

    # Приводим к квадрату с белым фоном
    canvas = Image.new("RGB", (OUTPUT_SIZE, OUTPUT_SIZE), (255, 255, 255))
    img.thumbnail((OUTPUT_SIZE, OUTPUT_SIZE), Image.LANCZOS)
    offset = (
        (OUTPUT_SIZE - img.width) // 2,
        (OUTPUT_SIZE - img.height) // 2,
    )
    canvas.paste(img, offset)
    img = canvas

    # Улучшение качества
    img = ImageEnhance.Brightness(img).enhance(BRIGHTNESS)
    img = ImageEnhance.Contrast(img).enhance(CONTRAST)
    img = ImageEnhance.Sharpness(img).enhance(SHARPNESS)

    # Сохраняем WebP + JPEG
    name = src.stem
    img.save(dst_dir / f"{name}.webp", "WEBP", quality=WEBP_QUALITY, method=6)
    img.save(dst_dir / f"{name}.jpg",  "JPEG", quality=JPEG_QUALITY, optimize=True)

    size_kb = (dst_dir / f"{name}.webp").stat().st_size // 1024
    print(f"  ✅ {src.name} → {name}.webp ({size_kb} KB)")


def main():
    parser = argparse.ArgumentParser(description="Обработка фото для srlux.uz")
    parser.add_argument("--input",  default="./исходные", help="Папка с исходными фото")
    parser.add_argument("--output", default="./готовые",  help="Папка для готовых фото")
    args = parser.parse_args()

    src_dir = Path(args.input)
    dst_dir = Path(args.output)

    if not src_dir.exists():
        print(f"❌ Папка не найдена: {src_dir}")
        sys.exit(1)

    dst_dir.mkdir(parents=True, exist_ok=True)

    files = [f for f in src_dir.iterdir() if f.suffix.lower() in SUPPORTED]
    if not files:
        print(f"❌ В папке {src_dir} нет изображений")
        sys.exit(1)

    print(f"📂 Обрабатываю {len(files)} фото из {src_dir} → {dst_dir}")
    print(f"   Размер: {OUTPUT_SIZE}×{OUTPUT_SIZE} px | Фон: белый\n")

    errors = 0
    for f in sorted(files):
        try:
            process_image(f, dst_dir)
        except Exception as e:
            print(f"  ❌ {f.name}: {e}")
            errors += 1

    print(f"\n{'='*40}")
    print(f"Готово: {len(files) - errors} фото обработано")
    if errors:
        print(f"Ошибок: {errors}")
    print(f"Результат в папке: {dst_dir.resolve()}")


if __name__ == "__main__":
    main()
