#!/usr/bin/env python3
"""
erp_sync_dolibarr.py — Синхронизация товаров из Dolibarr ERP в SR Lux каталог.
Запускается cron-ом каждые 30 минут:
  */30 * * * * /usr/bin/python3 /app/erp_sync_dolibarr.py >> /var/log/srlux_sync.log 2>&1
"""

import logging
import os
import sys
from decimal import Decimal

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("erp_sync")

DOLIBARR_URL = os.getenv("DOLIBARR_API_URL", "https://bollente.uz/api/index.php/").rstrip("/")
DOLIBARR_KEY = os.getenv("DOLIBARR_API_KEY", "")
BACKEND_URL = os.getenv("BACKEND_URL", "http://api:8000")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")

# Dolibarr prices are in USD — always convert to UZS
DOLIBARR_DEFAULT_CURRENCY = os.getenv("DOLIBARR_DEFAULT_CURRENCY", "USD")

# Базовый курс конвертации USD → UZS
USD_TO_UZS = Decimal(os.getenv("USD_TO_UZS_RATE", "12650"))

DOLIBARR_HEADERS = {"DOLAPIKEY": DOLIBARR_KEY}
PAGE_SIZE = 100


def fetch_all_products() -> list:
    """Забираем ВСЕ товары из Dolibarr с поддержкой пагинации."""
    all_products = []
    page = 0

    while True:
        try:
            resp = requests.get(
                f"{DOLIBARR_URL}/products",
                headers=DOLIBARR_HEADERS,
                params={
                    "limit": PAGE_SIZE,
                    "page": page,
                    "sortorder": "ASC",
                    "sortfield": "t.rowid",
                    "status": 1,  # только активные в Dolibarr
                },
                timeout=30,
            )
            resp.raise_for_status()
            batch = resp.json()
        except Exception as e:
            logger.error(f"Ошибка запроса Dolibarr (страница {page}): {e}")
            break

        if not isinstance(batch, list) or len(batch) == 0:
            break

        all_products.extend(batch)
        logger.info(f"  Получено {len(batch)} товаров (страница {page}), всего: {len(all_products)}")

        if len(batch) < PAGE_SIZE:
            break
        page += 1

    return all_products


def fetch_categories() -> dict:
    """Возвращает словарь {dolibarr_id: {'label': ..., 'id': ...}}"""
    try:
        resp = requests.get(
            f"{DOLIBARR_URL}/categories",
            headers=DOLIBARR_HEADERS,
            params={"type": "product", "limit": 500},
            timeout=15,
        )
        if resp.status_code == 200:
            cats = resp.json()
            return {int(c["id"]): c for c in cats if isinstance(c, dict) and c.get("id")}
    except Exception as e:
        logger.warning(f"Не удалось загрузить категории: {e}")
    return {}


def fetch_product_categories(products: list) -> dict:
    """
    Строит маппинг {product_dolibarr_id: category_dolibarr_id}.
    Для каждого товара запрашивает GET /categories?type=product&object_id={pid}.
    """
    product_to_cat: dict = {}
    total = len(products)
    for i, p in enumerate(products):
        pid = int(p.get("id", 0)) if p.get("id") else 0
        if not pid:
            continue
        try:
            resp = requests.get(
                f"{DOLIBARR_URL}/categories",
                headers=DOLIBARR_HEADERS,
                params={"type": "product", "object_id": pid, "limit": 1},
                timeout=10,
            )
            if resp.status_code == 200:
                cats = resp.json()
                if isinstance(cats, list) and cats:
                    cid = int(cats[0]["id"]) if cats[0].get("id") else 0
                    if cid:
                        product_to_cat[pid] = cid
        except Exception as e:
            logger.debug(f"Категория для товара {pid}: {e}")
        if (i + 1) % 50 == 0:
            logger.info(f"  Загрузка категорий товаров: {i + 1}/{total}...")

    logger.info(f"Маппинг товар→категория: {len(product_to_cat)} из {total} товаров")
    return product_to_cat


def wait_for_backend(max_attempts: int = 15, delay: float = 3.0) -> bool:
    """Ждёт пока бэкенд API не ответит на /health."""
    import time
    for i in range(max_attempts):
        try:
            resp = requests.get(f"{BACKEND_URL}/health", timeout=5)
            if resp.status_code == 200:
                return True
        except Exception:
            pass
        logger.info(f"Ожидание бэкенда... ({i + 1}/{max_attempts})")
        time.sleep(delay)
    return False


def sync_categories_to_backend(categories_map: dict) -> None:
    """Создаёт/обновляет все категории Dolibarr в базе данных SR Lux."""
    if not categories_map:
        return

    cats = []
    for dolibarr_id, cat_data in categories_map.items():
        name_ru = str(cat_data.get("label") or "Категория").strip()
        if name_ru:
            cats.append({
                "dolibarr_id": dolibarr_id,
                "name_ru": name_ru,
                "name_uz": None,
                "icon": None,
            })

    try:
        resp = requests.post(
            f"{BACKEND_URL}/api/admin/categories/bulk",
            json={"categories": cats},
            headers={"X-Api-Key": ADMIN_API_KEY, "Content-Type": "application/json"},
            timeout=30,
        )
        if resp.status_code == 200:
            result = resp.json()
            logger.info(f"✅ Категории синхронизированы: upserted={result['upserted']}")
        else:
            logger.error(f"Ошибка синхронизации категорий: {resp.status_code} — {resp.text[:200]}")
    except Exception as e:
        logger.error(f"Не удалось синхронизировать категории: {e}")


def get_usd_rate() -> Decimal:
    """Пытается получить актуальный курс из бэкенда, fallback — константа."""
    try:
        resp = requests.get(f"{BACKEND_URL}/api/currencies/USD", timeout=5)
        if resp.status_code == 200:
            rate = resp.json().get("rate_to_uzs")
            if rate:
                return Decimal(str(rate))
    except Exception:
        pass
    return USD_TO_UZS


def convert_price(raw_price, currency: str, usd_rate: Decimal) -> Decimal:
    """Конвертирует цену в UZS."""
    try:
        price = Decimal(str(raw_price))
    except Exception:
        return Decimal("0")

    if price <= 0:
        return Decimal("0")

    currency = (currency or "").upper()
    if currency in ("USD", "US"):
        return (price * usd_rate).quantize(Decimal("1"))
    # Считаем UZS / сумы по умолчанию
    return price.quantize(Decimal("1"))


def build_parent_map(raw_products: list) -> dict:
    """
    Строит словарь {dolibarr_id: product_data} для родительских товаров.
    Родительский товар — тот, у которого fk_product_parent пустой или 0.
    """
    parent_map = {}
    for p in raw_products:
        parent_id = p.get("fk_product_parent")
        is_child = parent_id and str(parent_id) not in ("0", "", "null", "None")
        if not is_child:
            pid = int(p.get("id", 0))
            if pid:
                parent_map[pid] = p
    logger.info(f"Родительских товаров (модели): {len(parent_map)}, дочерних: {len(raw_products) - len(parent_map)}")
    return parent_map


def _get_photos(p: dict) -> str | None:
    """Извлекает первый URL фото из поля photos товара."""
    # Пробуем разные поля — разные версии Dolibarr используют разные имена
    for field in ("photos", "photo", "images"):
        photos = p.get(field) or []
        if isinstance(photos, list) and photos:
            item = photos[0]
            url = item.get("photo_url") or item.get("url") or item.get("src")
            if url:
                return url
        elif isinstance(photos, str) and photos:
            return photos
    return None


DOLIBARR_BASE_URL = DOLIBARR_URL.replace("/api/index.php", "").rstrip("/")
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

UPLOADS_DIR = Path("/app/uploads")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Кэш: product_id -> local_url (чтобы не скачивать дважды за один запуск)
_photo_cache: dict[int, str | None] = {}


def _download_dolibarr_photo(product_id: int, viewimage_url: str, filename_hint: str) -> str | None:
    """Скачивает фото из Dolibarr с API-ключом и сохраняет локально."""
    from pathlib import Path as _P
    ext = _P(filename_hint).suffix.lower().lstrip(".")
    if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
        ext = "jpg"
    if ext == "jpeg":
        ext = "jpg"
    local_name = f"dol_{product_id}.{ext}"
    local_path = UPLOADS_DIR / local_name
    try:
        resp = requests.get(viewimage_url, headers=DOLIBARR_HEADERS, timeout=30)
        if resp.status_code == 200 and len(resp.content) > 500:
            local_path.write_bytes(resp.content)
            return f"/static/uploads/{local_name}"
    except Exception as e:
        logger.debug(f"Скачивание фото {product_id}: {e}")
    return None


def fetch_document_photo(product_id: int, product_ref: str) -> str | None:
    """
    Скачивает первое изображение из Dolibarr Documents, сохраняет локально,
    возвращает /static/uploads/... URL.
    """
    if product_id in _photo_cache:
        return _photo_cache[product_id]

    # Если файл уже скачан в этот запуск — используем его
    for ext in ("jpg", "png", "webp", "gif"):
        cached = UPLOADS_DIR / f"dol_{product_id}.{ext}"
        if cached.exists() and cached.stat().st_size > 500:
            url = f"/static/uploads/dol_{product_id}.{ext}"
            _photo_cache[product_id] = url
            return url

    url = None
    try:
        resp = requests.get(
            f"{DOLIBARR_URL}/documents",
            headers=DOLIBARR_HEADERS,
            params={"modulepart": "product", "id": product_id},
            timeout=10,
        )
        if resp.status_code == 200:
            docs = resp.json()
            if isinstance(docs, list):
                for doc in docs:
                    name = str(doc.get("name") or "").lower()
                    if any(name.endswith(ext) for ext in IMAGE_EXTENSIONS):
                        relative = doc.get("relativename") or doc.get("name")
                        if relative:
                            viewimage_url = (
                                f"{DOLIBARR_BASE_URL}/viewimage.php"
                                f"?modulepart=product&file={relative}&cache=1"
                            )
                            url = _download_dolibarr_photo(product_id, viewimage_url, name)
                            break
    except Exception as e:
        logger.debug(f"Документы для товара {product_id}: {e}")

    _photo_cache[product_id] = url
    return url


def build_payload(
    raw_products: list,
    categories_map: dict,
    product_to_cat: dict,
    usd_rate: Decimal,
    parent_map: dict | None = None,
) -> list:
    """Превращает ответ Dolibarr в список для bulk-import."""
    payload = []
    skipped = 0
    parent_map = parent_map or {}
    inherited_photo = 0
    inherited_desc = 0

    # Log first product keys once for debugging
    if raw_products:
        logger.info(f"Поля первого товара: {list(raw_products[0].keys())}")
        logger.info(f"photos/photo поля: photos={raw_products[0].get('photos')}, photo={raw_products[0].get('photo')}")

    for p in raw_products:
        try:
            dolibarr_id = int(p.get("id", 0))
            sku = str(p.get("ref") or p.get("id") or "").strip()
            name_ru = str(p.get("label") or "").strip()

            if not sku or not name_ru:
                skipped += 1
                continue

            # Цена: Dolibarr хранит товары в USD — всегда конвертируем в UZS
            raw_price = p.get("price_ttc") or p.get("price") or 0
            price_uzs = convert_price(raw_price, DOLIBARR_DEFAULT_CURRENCY, usd_rate)

            if price_uzs <= 0:
                skipped += 1
                logger.debug(f"Пропущен (нулевая цена): {sku} — {name_ru}")
                continue

            stock = int(float(p.get("stock_reel") or 0))
            weight_raw = p.get("weight")
            weight = float(weight_raw) if weight_raw not in (None, "", "0") else None

            description_ru = str(p.get("description") or "").strip() or None

            # Определяем родителя для этого товара
            fk_parent_raw = p.get("fk_product_parent")
            fk_parent = None
            if fk_parent_raw and str(fk_parent_raw) not in ("0", "", "null", "None"):
                try:
                    fk_parent = int(fk_parent_raw)
                except (ValueError, TypeError):
                    pass

            parent = parent_map.get(fk_parent) if fk_parent else None

            # Фото: сначала своё поле, потом документы Dolibarr, потом с родителя
            image_url = _get_photos(p)
            if not image_url:
                image_url = fetch_document_photo(dolibarr_id, sku)
            if not image_url and parent:
                parent_pid = int(parent.get("id", 0))
                parent_ref = str(parent.get("ref") or "")
                image_url = _get_photos(parent) or fetch_document_photo(parent_pid, parent_ref)
                if image_url:
                    inherited_photo += 1

            # Описание: сначала своё, fallback — с родителя
            if not description_ru and parent:
                description_ru = str(parent.get("description") or "").strip() or None
                if description_ru:
                    inherited_desc += 1

            # Категория: сначала из поля товара, потом из маппинга product→category
            cat_dolibarr_id = None
            cat_name_ru = None

            cat_ids = p.get("category_ids") or p.get("categories") or []
            if isinstance(cat_ids, (str, int)):
                cat_ids = [cat_ids]
            if isinstance(cat_ids, list) and cat_ids:
                first_cat_id = int(cat_ids[0])
                if first_cat_id in categories_map:
                    cat_dolibarr_id = first_cat_id
                    cat_name_ru = str(categories_map[first_cat_id].get("label") or "Прочее")

            # Fallback: маппинг из fetch_product_categories()
            if cat_dolibarr_id is None and dolibarr_id in product_to_cat:
                fallback_id = product_to_cat[dolibarr_id]
                if fallback_id in categories_map:
                    cat_dolibarr_id = fallback_id
                    cat_name_ru = str(categories_map[fallback_id].get("label") or "Прочее")

            payload.append({
                "dolibarr_id": dolibarr_id,
                "sku": sku,
                "name_ru": name_ru,
                "name_uz": None,
                "description_ru": description_ru,
                "description_uz": None,
                "price_uzs": float(price_uzs),
                "stock": stock,
                "weight": weight,
                "image_url": image_url,
                "is_active": True,
                "category_dolibarr_id": cat_dolibarr_id,
                "category_name_ru": cat_name_ru,
                "category_name_uz": None,
            })
        except Exception as e:
            logger.warning(f"Ошибка обработки товара {p.get('id')}: {e}")
            skipped += 1

    logger.info(
        f"Подготовлено к импорту: {len(payload)}, пропущено: {skipped} | "
        f"Фото унаследовано от родителя: {inherited_photo}, описание: {inherited_desc}"
    )
    return payload


def send_to_backend(payload: list) -> None:
    """Отправляет payload в /api/admin/products/bulk."""
    if not payload:
        logger.info("Нечего отправлять.")
        return

    try:
        resp = requests.post(
            f"{BACKEND_URL}/api/admin/products/bulk",
            json={"products": payload},
            headers={"X-Api-Key": ADMIN_API_KEY, "Content-Type": "application/json"},
            timeout=120,
        )
        if resp.status_code == 200:
            result = resp.json()
            logger.info(f"✅ Импорт завершён: upserted={result['upserted']}, skipped={result['skipped']}")
        else:
            logger.error(f"Ошибка ответа бэкенда: {resp.status_code} — {resp.text[:300]}")
            sys.exit(1)
    except Exception as e:
        logger.error(f"Не удалось отправить данные на бэкенд: {e}")
        sys.exit(1)


def main():
    logger.info("=== Запуск синхронизации SR Lux ↔ Dolibarr ===")
    logger.info(f"Валюта Dolibarr: {DOLIBARR_DEFAULT_CURRENCY}")

    if not wait_for_backend():
        logger.error("Бэкенд недоступен. Прерываем синхронизацию.")
        sys.exit(1)

    usd_rate = get_usd_rate()
    logger.info(f"Курс USD/UZS: {usd_rate}")

    # 1. Синхронизируем категории — они должны быть в DB до товаров
    categories_map = fetch_categories()
    logger.info(f"Загружено категорий из Dolibarr: {len(categories_map)}")
    sync_categories_to_backend(categories_map)

    # 2. Загружаем все товары
    raw_products = fetch_all_products()
    logger.info(f"Итого товаров из Dolibarr: {len(raw_products)}")

    if not raw_products:
        logger.warning("Dolibarr вернул 0 товаров. Прерываем синхронизацию.")
        return

    # 3. Строим карту родительских товаров для fallback фото/описания
    parent_map = build_parent_map(raw_products)

    # 4. Импортируем товары (категории управляются через setup_categories.py)
    payload = build_payload(raw_products, categories_map, {}, usd_rate, parent_map)
    send_to_backend(payload)

    logger.info("=== Синхронизация завершена ===")


if __name__ == "__main__":
    main()
