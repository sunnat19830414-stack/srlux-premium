#!/usr/bin/env python3
"""
smart_photo_processor.py — Умный обработчик фото товаров для srlux.uz

Использование:
  pip install Pillow anthropic numpy
  export ANTHROPIC_API_KEY="sk-ant-..."

  # Базовая обработка:
  python smart_photo_processor.py --input ./исходные --output ./готовые --sku GZ2

  # С генерацией цветовых вариантов (из белого фото):
  python smart_photo_processor.py --input ./исходные --output ./готовые --sku GZ2 --colors white,anthracite,black

Что делает:
  - Анализирует каждое фото через Claude Vision
  - Определяет тип фото: основное (белый фон), деталь, лайфстайл
  - Применяет подходящую обработку для каждого типа
  - Генерирует цветовые варианты: GZ2_white.webp, GZ2_anthracite.webp, GZ2_black.webp
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
    import numpy as np
except ImportError:
    print("Установите numpy: pip install numpy")
    sys.exit(1)

try:
    import anthropic
except ImportError:
    print("Установите anthropic: pip install anthropic")
    sys.exit(1)

# ─── Цветовые варианты ───────────────────────────────────────────────────────
# Каждый цвет задаётся как RGB максимальной яркости поверхности радиатора.
# Алгоритм: яркость пикселя × (target_color / 255) = цвет пикселя варианта.

COLOR_VARIANTS = {
    "white":      (255, 255, 255),   # Белый — оригинал (без изменений)
    "anthracite": (72,  74,  78),    # Антрацит — тёмно-серый (≈ RAL 7016)
    "black":      (28,  28,  30),    # Чёрный — очень тёмный
    "grey":       (155, 155, 158),   # Серый средний
    "cream":      (245, 236, 218),   # Кремовый / Ivory
    "bronze":     (120, 85,  55),    # Бронзовый
}

COLOR_LABELS = {
    "white":      "Белый",
    "anthracite": "Антрацит",
    "black":      "Чёрный",
    "grey":       "Серый",
    "cream":      "Кремовый",
    "bronze":     "Бронзовый",
}

# ─── Профили обработки по типу фото ─────────────────────────────────────────

PROFILES = {
    "main": {
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

SUPPORTED = {".jpg", ".jpeg", ".jfif", ".jpe", ".png", ".webp", ".bmp", ".tiff", ".tif", ".heic", ".heif"}

client = anthropic.Anthropic()


def analyze_photo(image_path: Path) -> str:
    """Отправляет фото в Claude Vision, возвращает тип: main / detail / lifestyle."""
    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")

    ext = image_path.suffix.lower()
    media_types = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".jfif": "image/jpeg", ".jpe": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp",
        ".bmp": "image/bmp", ".tiff": "image/tiff", ".tif": "image/tiff",
        ".heic": "image/jpeg", ".heif": "image/jpeg",
    }
    media_type = media_types.get(ext, "image/jpeg")

    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=100,
        thinking={"type": "disabled"},
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": image_data},
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
        }],
    )

    answer = response.content[0].text.strip().lower()
    return answer if answer in PROFILES else "main"


def process_image_main(img: Image.Image, profile: dict) -> Image.Image:
    """Квадрат 800×800 с белым фоном и автообрезкой."""
    size = profile["size"]
    bg_color = profile["bg_color"]

    background = Image.new("RGBA", img.size, (255, 255, 255, 255))
    if img.mode == "RGBA":
        background.paste(img, mask=img.split()[3])
    else:
        background.paste(img)
    img = background.convert("RGB")

    gray = img.convert("L")
    bbox = ImageOps.invert(gray).getbbox()
    if bbox:
        w, h = img.size
        pad = int(min(w, h) * profile["padding_pct"])
        img = img.crop((
            max(0, bbox[0] - pad), max(0, bbox[1] - pad),
            min(w, bbox[2] + pad), min(h, bbox[3] + pad),
        ))

    canvas = Image.new("RGB", (size, size), bg_color)
    img.thumbnail((size, size), Image.LANCZOS)
    offset = ((size - img.width) // 2, (size - img.height) // 2)
    canvas.paste(img, offset)
    return canvas


def process_image_rect(img: Image.Image, profile: dict) -> Image.Image:
    """Прямоугольный формат для detail / lifestyle."""
    target_w, target_h = profile["size"]
    bg_color = profile["bg_color"]

    background = Image.new("RGBA", img.size, (255, 255, 255, 255))
    if img.mode == "RGBA":
        background.paste(img, mask=img.split()[3])
    else:
        background.paste(img)
    img = background.convert("RGB")

    if profile["padding_pct"] > 0:
        gray = img.convert("L")
        bbox = ImageOps.invert(gray).getbbox()
        if bbox:
            w, h = img.size
            pad = int(min(w, h) * profile["padding_pct"])
            img = img.crop((
                max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                min(w, bbox[2] + pad), min(h, bbox[3] + pad),
            ))

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


def generate_color_variant(img: Image.Image, color_rgb: tuple, bg_threshold: int = 238) -> Image.Image:
    """
    Перекрашивает радиатор в заданный цвет, сохраняя белый фон.

    Алгоритм:
      1. Маска фона: пиксели где все каналы > bg_threshold
      2. Нормализация яркости пикселей радиатора в диапазон 0–1
         (работает с исходником ЛЮБОГО цвета: белый, антрацит, чёрный)
      3. Применяем целевой цвет: norm_яркость × target_color
      4. Фон восстанавливается белым
    """
    arr = np.array(img.convert("RGB"), dtype=np.float32)

    # Маска фона
    bg_mask = (arr[:, :, 0] > bg_threshold) & \
              (arr[:, :, 1] > bg_threshold) & \
              (arr[:, :, 2] > bg_threshold)

    # Яркость — среднее по каналам
    luminance = arr.mean(axis=2)

    # Нормализуем яркость только пикселей радиатора (не фона)
    product_lum = luminance[~bg_mask]
    if product_lum.size > 0:
        lum_min = product_lum.min()
        lum_max = product_lum.max()
        if lum_max > lum_min:
            norm = (luminance - lum_min) / (lum_max - lum_min)
        else:
            norm = luminance / 255.0
    else:
        norm = luminance / 255.0

    # Применяем целевой цвет
    result = np.zeros_like(arr)
    result[:, :, 0] = norm * color_rgb[0]
    result[:, :, 1] = norm * color_rgb[1]
    result[:, :, 2] = norm * color_rgb[2]

    # Восстанавливаем белый фон
    result[bg_mask] = [255.0, 255.0, 255.0]

    return Image.fromarray(result.clip(0, 255).astype(np.uint8), "RGB")


def save_image(img: Image.Image, dst_dir: Path, name: str, profile: dict) -> int:
    webp_path = dst_dir / f"{name}.webp"
    jpg_path = dst_dir / f"{name}.jpg"
    img.save(webp_path, "WEBP", quality=profile["webp_quality"], method=6)
    img.save(jpg_path, "JPEG", quality=profile["jpeg_quality"], optimize=True)
    return webp_path.stat().st_size // 1024


def process_photo(
    src: Path,
    dst_dir: Path,
    sku: str,
    index: int,
    colors: list[str] | None = None,
) -> tuple[str, str]:
    """Обрабатывает одно фото. Возвращает (photo_type, output_name)."""
    print(f"  🔍 Анализирую {src.name}...", end=" ", flush=True)
    photo_type = analyze_photo(src)
    profile = PROFILES[photo_type]
    print(f"тип: {photo_type} ({profile['description']})")

    img = Image.open(src).convert("RGBA")

    if isinstance(profile["size"], int):
        img = process_image_main(img, profile)
    else:
        img = process_image_rect(img, profile)

    img = enhance_image(img, profile)

    count_same = len(list(dst_dir.glob(f"{sku}_{profile['suffix']}*.webp")))
    output_name = f"{sku}_{profile['suffix']}" if count_same == 0 \
        else f"{sku}_{profile['suffix']}_{count_same + 1}"

    size_kb = save_image(img, dst_dir, output_name, profile)
    print(f"  ✅ → {output_name}.webp ({size_kb} KB)")

    # Цветовые варианты — только для основных фото (белый фон)
    if colors and photo_type == "main":
        print(f"  🎨 Генерирую цветовые варианты...")
        for color_name in colors:
            if color_name not in COLOR_VARIANTS:
                print(f"    ⚠️  Неизвестный цвет: {color_name}")
                continue
            color_rgb = COLOR_VARIANTS[color_name]
            label = COLOR_LABELS.get(color_name, color_name)

            if color_name == "white":
                # Белый — это уже обработанное фото
                colored = img
            else:
                colored = generate_color_variant(img, color_rgb)

            color_output = f"{sku}_{color_name}"
            ckb = save_image(colored, dst_dir, color_output, profile)
            print(f"    ✅ {color_output}.webp ({ckb} KB) — {label}")

    return photo_type, output_name


def print_sql(sku: str, colors: list[str]) -> None:
    """Выводит готовые SQL команды для обновления базы данных."""
    base_url = "https://srlux.uz/static/products"
    sku_upper = sku.upper()

    print(f"\n{'─' * 55}")
    print("📋 SQL для обновления базы данных (скопируйте на сервер):")
    print(f"{'─' * 55}")

    color_keywords = {
        "white":      ["White", "белый", "белая", "белое"],
        "anthracite": ["Anthracite", "антрацит"],
        "black":      ["Black", "черный", "чёрный"],
        "grey":       ["Grey", "Gray", "серый"],
        "cream":      ["Cream", "Ivory", "кремовый"],
        "bronze":     ["Bronze", "бронза"],
    }

    print("docker exec srlux-postgres psql -U srlux -d srlux_premium -c \"")
    for color_name in colors:
        keywords = color_keywords.get(color_name, [color_name])
        conditions = " OR ".join(f"sku ILIKE '%{kw}%'" for kw in keywords)
        print(f"UPDATE products SET image_url = '{base_url}/{sku_upper}_{color_name}.webp'")
        print(f"  WHERE sku LIKE '{sku_upper}%' AND ({conditions});")
    print("\"")


def main():
    parser = argparse.ArgumentParser(
        description="Умный обработчик фото для srlux.uz (Claude Vision + цветовые варианты)"
    )
    parser.add_argument("--input",  default="./исходные", help="Папка с исходными фото")
    parser.add_argument("--output", default="./готовые",  help="Папка для готовых фото")
    parser.add_argument("--sku",    required=True,         help="Артикул товара (напр. GZ2)")
    parser.add_argument(
        "--colors",
        default=None,
        help="Цветовые варианты через запятую: white,anthracite,black "
             f"(доступны: {', '.join(COLOR_VARIANTS)})",
    )
    args = parser.parse_args()

    src_dir = Path(args.input)
    dst_dir = Path(args.output)
    sku = args.sku.upper().strip()
    colors = [c.strip().lower() for c in args.colors.split(",")] if args.colors else None

    if not src_dir.exists():
        print(f"❌ Папка не найдена: {src_dir}")
        sys.exit(1)

    dst_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(f for f in src_dir.iterdir() if f.suffix.lower() in SUPPORTED)
    if not files:
        print(f"❌ В папке {src_dir} нет изображений")
        sys.exit(1)

    print(f"\n📸 Умная обработка {len(files)} фото для товара {sku}")
    if colors:
        labels = [COLOR_LABELS.get(c, c) for c in colors]
        print(f"   🎨 Цветовые варианты: {', '.join(labels)}")
    print(f"   Источник: {src_dir}  →  Результат: {dst_dir}\n")

    results = {"main": [], "detail": [], "lifestyle": []}
    errors = 0

    for i, f in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {f.name}")
        try:
            photo_type, output_name = process_photo(f, dst_dir, sku, i, colors)
            results[photo_type].append(output_name)
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            errors += 1

    print(f"\n{'=' * 55}")
    print(f"Товар: {sku} | Обработано: {len(files) - errors}/{len(files)}")
    if errors:
        print(f"Ошибок: {errors}")

    print("\n📋 Результат по типам:")
    for ptype, names in results.items():
        if names:
            print(f"  {ptype}: {', '.join(n + '.webp' for n in names)}")

    if colors:
        print(f"\n🎨 Цветовые варианты:")
        for color_name in colors:
            if color_name in COLOR_VARIANTS:
                print(f"  {sku}_{color_name}.webp — {COLOR_LABELS.get(color_name, color_name)}")
        print_sql(sku, colors)

    print(f"\n📁 Файлы: {dst_dir.resolve()}")


if __name__ == "__main__":
    main()
