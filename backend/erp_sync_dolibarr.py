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
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "srlux_admin_secret_key")

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


def fetch_product_categories(categories_map: dict) -> dict:
    """
    Строит обратный маппинг {product_dolibarr_id: category_dolibarr_id}.
    Для каждой категории запрашивает список её товаров через
    GET /categories/{id}/objects/product.
    """
    product_to_cat: dict = {}
    for cat_id in categories_map:
        try:
            resp = requests.get(
                f"{DOLIBARR_URL}/categories/{cat_id}/objects/product",
                headers=DOLIBARR_HEADERS,
                params={"limit": 500},
                timeout=15,
            )
            if resp.status_code == 200:
                products_in_cat = resp.json()
                if isinstance(products_in_cat, list):
                    for prod in products_in_cat:
                        pid = int(prod["id"]) if prod.get("id") else 0
                        if pid and pid not in product_to_cat:
                            product_to_cat[pid] = cat_id
        except Exception as e:
            logger.warning(f"Не удалось загрузить товары категории {cat_id}: {e}")
    logger.info(f"Маппинг товар→категория: {len(product_to_cat)} записей")
    return product_to_cat


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


def build_payload(
    raw_products: list,
    categories_map: dict,
    product_to_cat: dict,
    usd_rate: Decimal,
) -> list:
    """Превращает ответ Dolibarr в список для bulk-import."""
    payload = []
    skipped = 0

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

            # Категория: сначала из поля товара, потом из маппинга category→products
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

            # Fallback: обратный маппинг из fetch_product_categories()
            if cat_dolibarr_id is None and dolibarr_id in product_to_cat:
                fallback_id = product_to_cat[dolibarr_id]
                if fallback_id in categories_map:
                    cat_dolibarr_id = fallback_id
                    cat_name_ru = str(categories_map[fallback_id].get("label") or "Прочее")

            # Фото
            image_url = None
            photos = p.get("photos") or []
            if isinstance(photos, list) and photos:
                image_url = photos[0].get("photo_url") or photos[0].get("url")

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

    logger.info(f"Подготовлено к импорту: {len(payload)}, пропущено: {skipped}")
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

    usd_rate = get_usd_rate()
    logger.info(f"Курс USD/UZS: {usd_rate}")

    categories_map = fetch_categories()
    logger.info(f"Загружено категорий: {len(categories_map)}")

    product_to_cat = fetch_product_categories(categories_map)

    raw_products = fetch_all_products()
    logger.info(f"Итого товаров из Dolibarr: {len(raw_products)}")

    if not raw_products:
        logger.warning("Dolibarr вернул 0 товаров. Прерываем синхронизацию.")
        return

    payload = build_payload(raw_products, categories_map, product_to_cat, usd_rate)
    send_to_backend(payload)

    logger.info("=== Синхронизация завершена ===")


if __name__ == "__main__":
    main()
