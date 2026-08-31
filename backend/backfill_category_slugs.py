#!/usr/bin/env python3
"""
backfill_category_slugs.py — Пересчитывает slug всех категорий через
обновлённую (с транслитерацией) _slugify(). Одноразовый скрипт для перехода
на читаемые URL категорий (/catalog/<slug>).

Запускается один раз вручную:
  docker exec srlux-api python backfill_category_slugs.py

Коллизии (например обе "2-колонные" под разными родителями дают одинаковый
базовый slug) разруливаются в памяти до записи в БД — _unique_slug() из
crud.py тут не годится: она сравнивает новый slug с уже сохранёнными
строками, включая саму обновляемую запись, и даст ложный "уже занято" для
категории, чей новый slug совпадает со старым.
"""
import asyncio
import logging

from sqlalchemy import select

from crud import _slugify
from database import AsyncSessionLocal, init_db
from models import Category

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("backfill_slugs")


async def main() -> None:
    logger.info("=== Пересчёт slug категорий ===")
    await init_db()

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Category).order_by(Category.id))
        categories = result.scalars().all()

        used_slugs: set[str] = set()
        changed = 0
        for cat in categories:
            base = _slugify(cat.name_ru or "category") or "category"
            slug = base
            n = 2
            while slug in used_slugs:
                slug = f"{base}-{n}"
                n += 1
            used_slugs.add(slug)
            if slug != cat.slug:
                logger.info(f"id={cat.id}: '{cat.slug}' -> '{slug}'")
                cat.slug = slug
                changed += 1

        await db.commit()
        logger.info(f"=== Готово: изменено {changed} из {len(categories)} категорий ===")


if __name__ == "__main__":
    asyncio.run(main())
