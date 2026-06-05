#!/usr/bin/env python3
"""
smart_photo_processor.py — Умный обработчик фото товаров для srlux.uz

Использование:
  pip install Pillow anthropic
  export ANTHROPIC_API_KEY="sk-ant-..."
  python smart_photo_processor.py --input ./исходные --output ./готовые --sku GZ2

Что делает:
  - Анализирует каждое фото через Claude Vision
  - Определяет тип фото: основное (белый фон), деталь, лайфстайл
  - Применяет подходящую обработку для каждого типа
  - Называет файлы: GZ2_main.webp, GZ2_detail.webp, GZ2_lifestyle.jpg
"""

import argparse
import base64
import sys
from pathlib import Path

try:
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
except ImportError:
    print("Установите Pillow: pip install Pillow")
    sys.exit(1)

try:
    import anthropic
except ImportError:
    print("Установите anthropic: pip install anthropic")
    sys.exit(1)

# ─── Настройки обработки по типу фото ───────────────────────────────────────

PROFILES = {
    "main": {
        # Основное фото товара — квадрат 800×800 с белым фоном
        "size": 800,
        "padding_pct": 0.05,
        "brightness": 1.08,
        "contrast": 1.10,
        "sharpness": 1.25,
        "webp_quality": 88,
        "jpeg_quality": 90,
        "bg_color": (255, 255, 255),
        "suffix": "main",
        "description": "основное фото товара (каталог, карточка товара)",
    },
    "detail": {
        # Деталь/крупный план — 1200×900 с лёгким кропом
        "size": (1200, 900),
        "padding_pct": 0.03,
        "brightness": 1.05,
        "contrast": 1.12,
        "sharpness": 1.40,
        "webp_quality": 85,
        "jpeg_quality": 88,
        "bg_color": (255, 255, 255),
        "suffix": "detail",
        "description": "деталь/крупный план (галерея товара)",
    },
    "lifestyle": {
        # Лайфстайл/интерьер — 1600×900 (баннер/история)
        "size": (1600, 900),
        "padding_pct": 0.0,
        "brightness": 1.03,
        "contrast": 1.06,
        "sharpness": 1.10,
        "webp_quality": 82,
        "jpeg_quality": 85,
        "bg_color": (240, 240, 240),
        "suffix": "lifestyle",
        "description": "лайфстайл/интерьер (баннер, раздел 'в интерьере')",
    },
}

SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}

client = anthropic.Anthropic()


def analyze_photo(image_path: Path) -> str:
    """
    Отправляет фото в Claude Vision и получает тип: main / detail / lifestyle.
    """
    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")

    ext = image_path.suffix.lower()
    media_types = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp",
        ".bmp": "image/bmp", ".tiff": "image/tiff",
        ".gif": "image/gif",
    }
    media_type = media_types.get(ext, "image/jpeg")

    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=100,
        thinking={"type": "disabled"},
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "Это фото радиатора отопления для интернет-магазина srlux.uz. "
                            "Определи тип фото и ответь ТОЛЬКО одним словом:\n\n"
                            "- main — товар на белом/нейтральном фоне, вид целиком (для карточки товара)\n"
                            "- detail — крупный план, деталь товара, торец, секции (для галереи)\n"
                            "- lifestyle — товар в интерьере, в комнате, на фоне обстановки (для баннера)\n\n"
                            "Ответ (только одно слово: main, detail или lifestyle):"
                        ),
                    },
                ],
            }
        ],
    )

    answer = response.content[0].text.strip().lower()
    if answer not in PROFILES:
        answer = "main"
    return answer


def process_image_main(img: Image.Image, profile: dict) -> Image.Image:
    """Обрабатывает фото как основное (квадрат с белым фоном)."""
    size = profile["size"]
    padding_pct = profile["padding_pct"]
    bg_color = profile["bg_color"]

    # Белый фон для RGBA
    background = Image.new("RGBA", img.size, (255, 255, 255, 255))
    if img.mode == "RGBA":
        background.paste(img, mask=img.split()[3])
    else:
        background.paste(img)
    img = background.convert("RGB")

    # Автообрезка пустых полей
    gray = img.convert("L")
    bbox = ImageOps.invert(gray).getbbox()
    if bbox:
        w, h = img.size
        pad_x = int(w * padding_pct)
        pad_y = int(h * padding_pct)
        x1 = max(0, bbox[0] - pad_x)
        y1 = max(0, bbox[1] - pad_y)
        x2 = min(w, bbox[2] + pad_x)
        y2 = min(h, bbox[3] + pad_y)
        img = img.crop((x1, y1, x2, y2))

    # Квадратный канвас
    canvas = Image.new("RGB", (size, size), bg_color)
    img.thumbnail((size, size), Image.LANCZOS)
    offset = ((size - img.width) // 2, (size - img.height) // 2)
    canvas.paste(img, offset)
    return canvas


def process_image_rect(img: Image.Image, profile: dict) -> Image.Image:
    """Обрабатывает фото как прямоугольное (detail / lifestyle)."""
    target_w, target_h = profile["size"]
    bg_color = profile["bg_color"]
    padding_pct = profile["padding_pct"]

    # Белый фон
    background = Image.new("RGBA", img.size, (255, 255, 255, 255))
    if img.mode == "RGBA":
        background.paste(img, mask=img.split()[3])
    else:
        background.paste(img)
    img = background.convert("RGB")

    if padding_pct > 0:
        gray = img.convert("L")
        bbox = ImageOps.invert(gray).getbbox()
        if bbox:
            w, h = img.size
            pad_x = int(w * padding_pct)
            pad_y = int(h * padding_pct)
            img = img.crop((
                max(0, bbox[0] - pad_x),
                max(0, bbox[1] - pad_y),
                min(w, bbox[2] + pad_x),
                min(h, bbox[3] + pad_y),
            ))

    # Вписываем в целевой прямоугольник с сохранением пропорций
    canvas = Image.new("RGB", (target_w, target_h), bg_color)
    img.thumbnail((target_w, target_h), Image.LANCZOS)
    offset = ((target_w - img.width) // 2, (target_h - img.height) // 2)
    canvas.paste(img, offset)
    return canvas


def enhance_image(img: Image.Image, profile: dict) -> Image.Image:
    img = ImageEnhance.Brightness(img).enhance(profile["brightness"])
    img = ImageEnhance.Contrast(img).enhance(profile["contrast"])
    img = ImageEnhance.Sharpness(img).enhance(profile["sharpness"])
    return img


def save_image(img: Image.Image, dst_dir: Path, name: str, profile: dict) -> int:
    """Сохраняет WebP (основной) и JPEG (запасной). Возвращает размер WebP в KB."""
    webp_path = dst_dir / f"{name}.webp"
    jpg_path = dst_dir / f"{name}.jpg"
    img.save(webp_path, "WEBP", quality=profile["webp_quality"], method=6)
    img.save(jpg_path, "JPEG", quality=profile["jpeg_quality"], optimize=True)
    return webp_path.stat().st_size // 1024


def process_photo(src: Path, dst_dir: Path, sku: str, index: int) -> tuple[str, str]:
    """
    Обрабатывает одно фото.
    Возвращает (photo_type, output_name).
    """
    # 1. Анализ
    print(f"  🔍 Анализирую {src.name}...", end=" ", flush=True)
    photo_type = analyze_photo(src)
    profile = PROFILES[photo_type]
    print(f"тип: {photo_type} ({profile['description']})")

    # 2. Загрузка
    img = Image.open(src).convert("RGBA")

    # 3. Геометрия
    if isinstance(profile["size"], int):
        img = process_image_main(img, profile)
    else:
        img = process_image_rect(img, profile)

    # 4. Улучшение
    img = enhance_image(img, profile)

    # 5. Имя файла: SKU_тип[_N].webp
    count_same = len(list(dst_dir.glob(f"{sku}_{profile['suffix']}*.webp")))
    if count_same == 0:
        output_name = f"{sku}_{profile['suffix']}"
    else:
        output_name = f"{sku}_{profile['suffix']}_{count_same + 1}"

    # 6. Сохранение
    size_kb = save_image(img, dst_dir, output_name, profile)
    print(f"  ✅ → {output_name}.webp ({size_kb} KB)")

    return photo_type, output_name


def main():
    parser = argparse.ArgumentParser(
        description="Умный обработчик фото для srlux.uz (использует Claude Vision)"
    )
    parser.add_argument("--input",  default="./исходные", help="Папка с исходными фото")
    parser.add_argument("--output", default="./готовые",  help="Папка для готовых фото")
    parser.add_argument("--sku",    required=True,         help="Артикул товара (напр. GZ2)")
    args = parser.parse_args()

    src_dir = Path(args.input)
    dst_dir = Path(args.output)
    sku = args.sku.upper().strip()

    if not src_dir.exists():
        print(f"❌ Папка не найдена: {src_dir}")
        sys.exit(1)

    dst_dir.mkdir(parents=True, exist_ok=True)

    files = sorted(f for f in src_dir.iterdir() if f.suffix.lower() in SUPPORTED)
    if not files:
        print(f"❌ В папке {src_dir} нет изображений")
        sys.exit(1)

    print(f"\n📸 Умная обработка {len(files)} фото для товара {sku}")
    print(f"   Источник: {src_dir}  →  Результат: {dst_dir}\n")

    results = {"main": [], "detail": [], "lifestyle": []}
    errors = 0

    for i, f in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {f.name}")
        try:
            photo_type, output_name = process_photo(f, dst_dir, sku, i)
            results[photo_type].append(output_name)
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            errors += 1

    # Итоговый отчёт
    print(f"\n{'=' * 50}")
    print(f"Товар: {sku}")
    print(f"Обработано: {len(files) - errors} из {len(files)}")
    if errors:
        print(f"Ошибок: {errors}")

    print("\n📋 Результат по типам:")
    for ptype, names in results.items():
        if names:
            label = PROFILES[ptype]["description"]
            print(f"  {ptype}: {', '.join(n + '.webp' for n in names)}")
            print(f"        → {label}")

    print(f"\n📁 Файлы в папке: {dst_dir.resolve()}")
    print("\n💡 Следующий шаг: загрузите файлы в карточку товара Dolibarr")
    print(f"   Основное фото для каталога: {sku}_main.webp")


if __name__ == "__main__":
    main()
