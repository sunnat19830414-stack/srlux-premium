#!/usr/bin/env python3
"""
smart_photo_processor.py — Умный обработчик фото товаров для srlux.uz

Использование:
  pip install Pillow anthropic numpy requests
  export ANTHROPIC_API_KEY="sk-ant-..."
  export CLAID_API_KEY="90f366..."         # ключ Claid.AI (для AI-перекраски)

  # Базовая обработка:
  python smart_photo_processor.py --input ./исходные --output ./готовые --sku GZ2

  # С локальной перекраской (numpy, быстро, бесплатно):
  python smart_photo_processor.py --input ./исходные --output ./готовые --sku GZ2 --colors white,anthracite,black

  # С AI-перекраской через Claid.AI (фотореалистично, ~4 кредита/фото):
  python smart_photo_processor.py --input ./исходные --output ./готовые --sku GZ2 --colors white,anthracite,black --claid

Что делает:
  - Анализирует каждое фото через Claude Vision
  - Определяет тип фото: основное (белый фон), деталь, лайфстайл
  - Применяет подходящую обработку для каждого типа
  - Генерирует цветовые варианты: GZ2_white.webp, GZ2_anthracite.webp, GZ2_black.webp
"""

import argparse
import base64
import io
import os
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

try:
    import requests as _requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# ─── Claid.AI ────────────────────────────────────────────────────────────────

CLAID_BASE = "https://api.claid.ai"

CLAID_PROMPTS = {
    "white": (
        "Change the color of the radiator to pure white (RAL 9010). "
        "Keep identical shape, section structure, metallic sheen, highlights, shadows, and lighting. "
        "The background must remain pure white. Do not change anything except the color."
    ),
    "anthracite": (
        "Change the color of the radiator to dark anthracite gray (RAL 7016 charcoal). "
        "Keep identical shape, section structure, metallic sheen, highlights, shadows, and lighting. "
        "The background must remain pure white. Do not change anything except the color."
    ),
    "black": (
        "Change the color of the radiator to deep matte black (RAL 9005). "
        "Keep identical shape, section structure, metallic sheen, highlights, shadows, and lighting. "
        "The background must remain pure white. Do not change anything except the color."
    ),
    "chrome": (
        "Change the color of the radiator to polished chrome / brushed silver. "
        "Keep identical shape, section structure, reflections, highlights, shadows, and lighting. "
        "The background must remain pure white. Do not change anything except the finish."
    ),
    "gold": (
        "Change the color of the radiator to brushed gold (warm champagne metallic). "
        "Keep identical shape, section structure, metallic sheen, highlights, shadows, and lighting. "
        "The background must remain pure white. Do not change anything except the color."
    ),
}

# ─── Цветовые варианты (локальный numpy — быстро, бесплатно) ─────────────────

COLOR_VARIANTS = {
    "white":      (255, 255, 255),
    "anthracite": (72,  74,  78),
    "black":      (28,  28,  30),
    "grey":       (155, 155, 158),
    "cream":      (245, 236, 218),
    "bronze":     (120, 85,  55),
    "chrome":     (192, 192, 192),
    "gold":       (201, 162, 39),
}

COLOR_LABELS = {
    "white":      "Белый",
    "anthracite": "Антрацит",
    "black":      "Чёрный",
    "grey":       "Серый",
    "cream":      "Кремовый",
    "bronze":     "Бронзовый",
    "chrome":     "Хром",
    "gold":       "Золото",
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


# ─── Claid.AI AI-перекраска ───────────────────────────────────────────────────

def _claid_upload_image(image_bytes: bytes, claid_key: str) -> str:
    """Загружает файл в Claid.AI и возвращает URL для дальнейших операций."""
    resp = _requests.post(
        f"{CLAID_BASE}/v1-beta1/assets",
        headers={"Authorization": f"Bearer {claid_key}"},
        files={"file": ("photo.jpg", image_bytes, "image/jpeg")},
        timeout=60,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Claid upload error {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    # Claid.AI возвращает {"id": "...", "url": "..."}
    return data.get("url") or data.get("tmp_url") or data["id"]


def _claid_ai_photoshoot(input_url: str, prompt: str, claid_key: str) -> bytes:
    """Вызывает AI Photoshoot и возвращает байты результирующего изображения."""
    payload = {
        "input": input_url,
        "output": {
            "format": {"type": "jpeg", "quality": 92},
        },
        "operations": {
            "ai_photoshoot": {
                "prompt": prompt,
            }
        },
    }
    resp = _requests.post(
        f"{CLAID_BASE}/v1-beta1/image/edit",
        headers={
            "Authorization": f"Bearer {claid_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=180,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Claid edit error {resp.status_code}: {resp.text[:400]}")

    result = resp.json()
    # Claid возвращает {"output": {"tmp_url": "..."}} или {"tmp_url": "..."}
    output = result.get("output") or result
    result_url = output.get("tmp_url") or output.get("url")
    if not result_url:
        raise RuntimeError(f"Claid.AI: no output URL in response: {result}")

    img_resp = _requests.get(result_url, timeout=60)
    img_resp.raise_for_status()
    return img_resp.content


def generate_color_variant_claid(
    src_path: Path,
    color_name: str,
    claid_key: str,
) -> Image.Image | None:
    """
    AI-перекраска через Claid.AI.
    Возвращает PIL Image или None при ошибке (тогда используется numpy-метод).
    """
    if not HAS_REQUESTS:
        print("    ⚠️  Установите requests: pip install requests")
        return None

    prompt = CLAID_PROMPTS.get(color_name)
    if not prompt:
        print(f"    ⚠️  Нет AI-промпта для цвета '{color_name}', используется локальный метод")
        return None

    with open(src_path, "rb") as f:
        image_bytes = f.read()

    print(f"    🤖 Claid.AI: загружаю фото...", end=" ", flush=True)
    input_url = _claid_upload_image(image_bytes, claid_key)
    print(f"загружено. Генерирую {COLOR_LABELS.get(color_name, color_name)}...", end=" ", flush=True)

    result_bytes = _claid_ai_photoshoot(input_url, prompt, claid_key)
    img = Image.open(io.BytesIO(result_bytes)).convert("RGB")
    print("готово.")
    return img


# ─── Локальная numpy-перекраска ───────────────────────────────────────────────

def generate_color_variant(img: Image.Image, color_rgb: tuple, bg_threshold: int = 238) -> Image.Image:
    """
    Перекрашивает радиатор в заданный цвет, сохраняя белый фон.

    Алгоритм:
      1. Маска фона: пиксели где все каналы > bg_threshold
      2. Нормализация яркости пикселей радиатора в диапазон 0–1
      3. Применяем целевой цвет: norm_яркость × target_color
      4. Фон восстанавливается белым
    """
    arr = np.array(img.convert("RGB"), dtype=np.float32)

    bg_mask = (arr[:, :, 0] > bg_threshold) & \
              (arr[:, :, 1] > bg_threshold) & \
              (arr[:, :, 2] > bg_threshold)

    luminance = arr.mean(axis=2)

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

    result = np.zeros_like(arr)
    result[:, :, 0] = norm * color_rgb[0]
    result[:, :, 1] = norm * color_rgb[1]
    result[:, :, 2] = norm * color_rgb[2]

    result[bg_mask] = [255.0, 255.0, 255.0]

    return Image.fromarray(result.clip(0, 255).astype(np.uint8), "RGB")


# ─── Анализ фото через Claude Vision ─────────────────────────────────────────

def analyze_photo(image_path: Path) -> str:
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


# ─── Обработка изображений ────────────────────────────────────────────────────

def process_image_main(img: Image.Image, profile: dict) -> Image.Image:
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
    use_claid: bool = False,
    claid_key: str | None = None,
    force_main: bool = False,
) -> tuple[str, str]:
    if force_main:
        photo_type = "main"
        profile = PROFILES["main"]
        print(f"  📌 {src.name} → тип принудительно: main")
    else:
        print(f"  🔍 Анализирую {src.name}...", end=" ", flush=True)
        photo_type = analyze_photo(src)
        profile = PROFILES[photo_type]
        print(f"тип: {photo_type} ({profile['description']})")

    img = Image.open(src).convert("RGBA")

    if isinstance(profile["size"], int):
        processed = process_image_main(img, profile)
    else:
        processed = process_image_rect(img, profile)

    processed = enhance_image(processed, profile)

    count_same = len(list(dst_dir.glob(f"{sku}_{profile['suffix']}*.webp")))
    output_name = f"{sku}_{profile['suffix']}" if count_same == 0 \
        else f"{sku}_{profile['suffix']}_{count_same + 1}"

    size_kb = save_image(processed, dst_dir, output_name, profile)
    print(f"  ✅ → {output_name}.webp ({size_kb} KB)")

    # Цветовые варианты — только для основных фото (белый фон)
    if colors and photo_type == "main":
        method = "Claid.AI" if (use_claid and claid_key) else "numpy"
        print(f"  🎨 Генерирую цветовые варианты ({method})...")

        for color_name in colors:
            label = COLOR_LABELS.get(color_name, color_name)

            if use_claid and claid_key and color_name in CLAID_PROMPTS:
                try:
                    colored = generate_color_variant_claid(src, color_name, claid_key)
                    if colored is None:
                        raise ValueError("Claid вернул None")
                    # Приводим к тому же размеру что и processed
                    colored = colored.resize(processed.size, Image.LANCZOS)
                except Exception as e:
                    print(f"    ⚠️  Claid.AI не сработал ({e}), использую numpy")
                    colored = generate_color_variant(processed, COLOR_VARIANTS.get(color_name, (128, 128, 128)))
            else:
                if color_name not in COLOR_VARIANTS:
                    print(f"    ⚠️  Неизвестный цвет: {color_name}")
                    continue
                colored = generate_color_variant(processed, COLOR_VARIANTS[color_name])

            color_output = f"{sku}_{color_name}"
            ckb = save_image(colored, dst_dir, color_output, profile)
            print(f"    ✅ {color_output}.webp ({ckb} KB) — {label}")

    return photo_type, output_name


# ─── SQL helper ───────────────────────────────────────────────────────────────

def print_sql(sku: str, colors: list[str]) -> None:
    base_url = "https://srlux.uz/static/products"
    sku_upper = sku.upper()

    print(f"\n{'─' * 60}")
    print("📋 SQL для обновления базы данных (скопируйте на сервер):")
    print(f"{'─' * 60}")

    color_keywords = {
        "white":      ["White", "белый", "белая", "белое"],
        "anthracite": ["Anthracite", "антрацит"],
        "black":      ["Black", "черный", "чёрный"],
        "grey":       ["Grey", "Gray", "серый"],
        "cream":      ["Cream", "Ivory", "кремовый"],
        "bronze":     ["Bronze", "бронза"],
        "chrome":     ["Chrome", "хром"],
        "gold":       ["Gold", "золото"],
    }

    print('docker exec srlux-postgres psql -U srlux -d srlux_premium -c "')
    for color_name in colors:
        keywords = color_keywords.get(color_name, [color_name])
        conditions = " OR ".join(f"sku ILIKE '%{kw}%'" for kw in keywords)
        print(f"UPDATE products SET image_url = '{base_url}/{sku_upper}/{sku_upper}_{color_name}.webp'")
        print(f"  WHERE sku LIKE '{sku_upper}%' AND ({conditions});")
    print('"')


# ─── Точка входа ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Умный обработчик фото для srlux.uz (Claude Vision + Claid.AI / numpy)"
    )
    parser.add_argument("--input",  default="./исходные", help="Папка с исходными фото")
    parser.add_argument("--output", default="./готовые",  help="Папка для готовых фото")
    parser.add_argument("--sku",    required=True,        help="Артикул товара (напр. GZ2)")
    parser.add_argument(
        "--colors",
        default=None,
        help=(
            "Цветовые варианты через запятую: white,anthracite,black "
            f"(доступны: {', '.join(COLOR_VARIANTS)})"
        ),
    )
    parser.add_argument(
        "--force-main",
        action="store_true",
        help="Принудительно обрабатывать все фото как тип 'main' (пропустить Claude Vision анализ) и генерировать цветовые варианты.",
    )
    parser.add_argument(
        "--claid",
        action="store_true",
        help=(
            "Использовать Claid.AI для фотореалистичной AI-перекраски "
            "(требует CLAID_API_KEY в env, ~4 кредита/цвет). "
            "Без этого флага — быстрый локальный numpy-метод."
        ),
    )
    args = parser.parse_args()

    src_dir = Path(args.input)
    dst_dir = Path(args.output)
    sku = args.sku.upper().strip()
    colors = [c.strip().lower() for c in args.colors.split(",")] if args.colors else None

    claid_key: str | None = None
    if args.claid:
        claid_key = os.environ.get("CLAID_API_KEY", "").strip()
        if not claid_key:
            print("❌ --claid указан, но CLAID_API_KEY не задан в env.")
            print("   Задайте: export CLAID_API_KEY='ваш_ключ'")
            sys.exit(1)
        if not HAS_REQUESTS:
            print("❌ Для --claid нужен requests: pip install requests")
            sys.exit(1)

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
        method = "Claid.AI (AI)" if args.claid else "numpy (локально)"
        print(f"   🎨 Цветовые варианты: {', '.join(labels)}  [{method}]")
    print(f"   Источник: {src_dir}  →  Результат: {dst_dir}\n")

    results = {"main": [], "detail": [], "lifestyle": []}
    errors = 0

    for i, f in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {f.name}")
        try:
            photo_type, output_name = process_photo(
                f, dst_dir, sku, i, colors,
                use_claid=args.claid,
                claid_key=claid_key,
                force_main=args.force_main,
            )
            results[photo_type].append(output_name)
        except Exception as e:
            print(f"  ❌ Ошибка: {e}")
            errors += 1

    print(f"\n{'=' * 60}")
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
            if color_name in COLOR_VARIANTS or color_name == "white":
                print(f"  {sku}_{color_name}.webp — {COLOR_LABELS.get(color_name, color_name)}")
        print_sql(sku, colors)

    print(f"\n📁 Файлы: {dst_dir.resolve()}")


if __name__ == "__main__":
    main()
