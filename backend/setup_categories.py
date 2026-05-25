#!/usr/bin/env python3
"""
setup_categories.py — Создаёт 7 категорий для сайта и распределяет товары.
Запускается один раз вручную:
  docker exec srlux-api python setup_categories.py

Категории не привязаны к Dolibarr — используют отрицательные dolibarr_id
чтобы синхронизация не перезаписывала их.
"""
import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, init_db
from models import Category, Product

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("setup_cat")

# Пользовательские категории (dolibarr_id отрицательный = не из Dolibarr)
CUSTOM_CATEGORIES = [
    {"dolibarr_id": -1, "slug": "polotentsesushiteli",  "name_ru": "Полотенцесушители",  "name_uz": "Sochiq isitgichlar",    "icon": "Flame"},
    {"dolibarr_id": -2, "slug": "trubchatye-radiatory", "name_ru": "Трубчатые радиаторы", "name_uz": "Naysimon radiatorlar",  "icon": "Layers"},
    {"dolibarr_id": -3, "slug": "chugunnye-radiatory",  "name_ru": "Чугунные радиаторы",  "name_uz": "Cho'yan radiatorlar",   "icon": "Package"},
    {"dolibarr_id": -4, "slug": "termostaty",           "name_ru": "Термостаты",          "name_uz": "Termostatlar",          "icon": "Thermometer"},
    {"dolibarr_id": -5, "slug": "filtry",               "name_ru": "Фильтры",             "name_uz": "Filtrlar",              "icon": "Settings"},
    {"dolibarr_id": -6, "slug": "zapornaya-armatura",   "name_ru": "Запорная арматура",   "name_uz": "To'siq armatura",       "icon": "Wrench"},
    {"dolibarr_id": -7, "slug": "push-fitingi",          "name_ru": "Push фитинги",        "name_uz": "Push fitinglar",        "icon": "Zap"},
]


def detect_category(sku: str, name: str) -> int | None:
    """
    Возвращает dolibarr_id пользовательской категории (-1..-7)
    на основе артикула и названия товара.
    """
    s = sku.strip()
    n = name.strip().lower()

    # Полотенцесушители
    towel_skus = ("CM", "AM65", "MAR", "SRLux")
    towel_names = ("sr lux", "srlux", "carbon peak", "mesh lux", "pure guard",
                   "quadra stand", "side edge", "smart frame", "solo slim")
    if any(s.startswith(p) for p in towel_skus) or any(p in n for p in towel_names):
        return -1

    # Трубчатые радиаторы (Column / Flat / Rectangular / Square)
    tube_names = ("column", "flat 60", "flat 68", "rectangular", "square")
    if any(n.startswith(p) for p in tube_names):
        return -2

    # Чугунные и стальные радиаторы
    if s.startswith("BZ") or "чугун" in n or n.startswith("steel-aluminum"):
        return -3

    # Термостаты WIFI
    if s.startswith("HY") or "термостат" in n or "wifi" in n:
        return -4

    # Фильтры
    filter_skus = ("B22", "D28-SZG")
    if s in filter_skus or "filter model" in n or "фильтр" in n:
        return -5

    # Запорная арматура
    if "кран" in n or s.startswith("84818"):
        return -6

    # Трубы и фитинги PPR
    fitting_words = ("муфта", "тройник", "угол", "заглушка", "разделитель")
    if any(w in n for w in fitting_words):
        return -7

    return None


async def upsert_categories(db: AsyncSession) -> dict:
    """Создаёт или обновляет пользовательские категории, возвращает {dolibarr_id: Category}."""
    cat_map: dict = {}
    for c in CUSTOM_CATEGORIES:
        existing = await db.scalar(
            select(Category).where(Category.dolibarr_id == c["dolibarr_id"])
        )
        if existing:
            existing.name_ru = c["name_ru"]
            existing.name_uz = c["name_uz"]
            existing.icon = c["icon"]
            cat_map[c["dolibarr_id"]] = existing
            logger.info(f"  Обновлена: {c['name_ru']}")
        else:
            new_cat = Category(
                slug=c["slug"],
                name_ru=c["name_ru"],
                name_uz=c["name_uz"],
                icon=c["icon"],
                dolibarr_id=c["dolibarr_id"],
            )
            db.add(new_cat)
            await db.flush()
            cat_map[c["dolibarr_id"]] = new_cat
            logger.info(f"  Создана:   {c['name_ru']}")
    return cat_map


async def assign_products(db: AsyncSession, cat_map: dict) -> None:
    """Распределяет все товары по категориям на основе названия и артикула."""
    result = await db.execute(select(Product).where(Product.is_active == True))
    products = result.scalars().all()

    assigned = 0
    unmatched = []

    for product in products:
        cat_dolibarr_id = detect_category(product.sku or "", product.name_ru or "")
        if cat_dolibarr_id and cat_dolibarr_id in cat_map:
            product.category_id = cat_map[cat_dolibarr_id].id
            assigned += 1
        else:
            unmatched.append(f"  SKU={product.sku}  Имя={product.name_ru}")

    logger.info(f"Распределено: {assigned} из {len(products)} товаров")
    if unmatched:
        logger.warning(f"Не удалось определить категорию для {len(unmatched)} товаров:")
        for u in unmatched[:20]:
            logger.warning(u)


async def main() -> None:
    logger.info("=== Настройка категорий SR Lux ===")
    await init_db()

    async with AsyncSessionLocal() as db:
        logger.info("Создание категорий...")
        cat_map = await upsert_categories(db)

        logger.info("Распределение товаров по категориям...")
        await assign_products(db, cat_map)

        await db.commit()

    logger.info("=== Готово ===")


if __name__ == "__main__":
    asyncio.run(main())
