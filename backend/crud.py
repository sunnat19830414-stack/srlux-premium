import json
import re
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import Category, Order, OrderItem, Product, ProductVariant


# ── Slugify helper ─────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text


# ── Products ───────────────────────────────────────────────────────────────────

async def get_products(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    category_id: Optional[int] = None,
):
    q = (
        select(Product)
        .where(Product.is_active == True)
        .options(selectinload(Product.category), selectinload(Product.variants))
        .order_by(Product.id)
    )
    if category_id:
        q = q.where(Product.category_id == category_id)

    total_q = select(func.count()).select_from(
        select(Product.id).where(Product.is_active == True)
        .filter(Product.category_id == category_id if category_id else True)
        .subquery()
    )
    total = await db.scalar(total_q) or 0

    result = await db.execute(q.offset((page - 1) * limit).limit(limit))
    products = result.scalars().all()
    return total, products


async def get_product_by_slug(db: AsyncSession, slug: str):
    result = await db.execute(
        select(Product)
        .where(Product.slug == slug, Product.is_active == True)
        .options(selectinload(Product.category), selectinload(Product.variants))
    )
    return result.scalar_one_or_none()


# ── Categories ─────────────────────────────────────────────────────────────────

async def get_categories(db: AsyncSession):
    # Only categories that have at least one active product
    stmt = (
        select(Category)
        .where(
            Category.id.in_(
                select(Product.category_id)
                .where(Product.is_active == True, Product.category_id.isnot(None))
                .distinct()
            )
        )
        .order_by(Category.name_ru)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_or_create_category(
    db: AsyncSession,
    dolibarr_id: Optional[int],
    name_ru: str,
    name_uz: Optional[str],
) -> Optional[Category]:
    if dolibarr_id:
        result = await db.execute(
            select(Category).where(Category.dolibarr_id == dolibarr_id)
        )
        cat = result.scalar_one_or_none()
        if cat:
            return cat

    slug = _slugify(name_ru or "category")
    slug = await _unique_slug(db, Category, slug)
    cat = Category(
        slug=slug,
        name_ru=name_ru or "Категория",
        name_uz=name_uz or name_ru or "Kategoriya",
        dolibarr_id=dolibarr_id,
    )
    db.add(cat)
    await db.flush()
    return cat


async def _unique_slug(db: AsyncSession, model, slug: str) -> str:
    base = slug
    n = 1
    while True:
        exists = await db.scalar(
            select(func.count()).where(model.slug == slug)
        )
        if not exists:
            return slug
        slug = f"{base}-{n}"
        n += 1


# ── Bulk upsert categories ────────────────────────────────────────────────────

async def bulk_upsert_categories(db: AsyncSession, items: list) -> dict:
    upserted = 0
    for item in items:
        existing = await db.scalar(
            select(Category).where(Category.dolibarr_id == item.dolibarr_id)
        )
        if existing:
            existing.name_ru = item.name_ru
            if item.name_uz:
                existing.name_uz = item.name_uz
            if item.icon:
                existing.icon = item.icon
        else:
            slug = _slugify(item.name_ru or "category")
            slug = await _unique_slug(db, Category, slug)
            cat = Category(
                slug=slug,
                name_ru=item.name_ru,
                name_uz=item.name_uz or item.name_ru,
                dolibarr_id=item.dolibarr_id,
                icon=item.icon or "Package",
            )
            db.add(cat)
        upserted += 1
    await db.commit()
    return {"upserted": upserted}


# ── Bulk upsert (admin import) ─────────────────────────────────────────────────

async def bulk_upsert_products(db: AsyncSession, items: list) -> dict:
    upserted = 0
    skipped = 0

    for item in items:
        if item.price_uzs <= 0:
            skipped += 1
            continue

        # Resolve category
        category_id = None
        if item.category_dolibarr_id or item.category_name_ru:
            cat = await get_or_create_category(
                db,
                item.category_dolibarr_id,
                item.category_name_ru or "Прочее",
                item.category_name_uz,
            )
            category_id = cat.id

        # Try find existing by dolibarr_id or sku
        existing = await db.scalar(
            select(Product).where(Product.dolibarr_id == item.dolibarr_id)
        )
        if not existing:
            existing = await db.scalar(
                select(Product).where(Product.sku == item.sku)
            )

        if existing:
            existing.name_ru = item.name_ru
            existing.name_uz = item.name_uz
            existing.description_ru = item.description_ru
            existing.description_uz = item.description_uz
            existing.price_uzs = item.price_uzs
            existing.stock = item.stock
            existing.weight = item.weight
            # Не затираем вручную установленное фото если синхронизация не нашла новое
            if item.image_url or not existing.image_url:
                existing.image_url = item.image_url
            existing.is_active = item.is_active
            # Preserve manually set categories (negative dolibarr_id = custom)
            if category_id and existing.category_id is None:
                existing.category_id = category_id
        else:
            slug = _slugify(item.name_ru)
            slug = await _unique_slug(db, Product, slug)
            product = Product(
                dolibarr_id=item.dolibarr_id,
                sku=item.sku,
                slug=slug,
                name_ru=item.name_ru,
                name_uz=item.name_uz,
                description_ru=item.description_ru,
                description_uz=item.description_uz,
                price_uzs=item.price_uzs,
                stock=item.stock,
                weight=item.weight,
                image_url=item.image_url,
                is_active=item.is_active,
                category_id=category_id,
            )
            db.add(product)

        upserted += 1

    await db.commit()
    return {"upserted": upserted, "skipped": skipped}


# ── Orders ─────────────────────────────────────────────────────────────────────

import uuid


async def create_order(db: AsyncSession, data, items_data: list):
    total = Decimal("0")
    resolved_items = []

    for item_in in items_data:
        product = await db.scalar(
            select(Product).where(Product.id == item_in.product_id, Product.is_active == True)
        )
        if not product:
            continue

        unit_price = Decimal(str(product.price_uzs))
        if item_in.variant_id:
            variant = await db.scalar(
                select(ProductVariant).where(ProductVariant.id == item_in.variant_id)
            )
            if variant:
                unit_price += Decimal(str(variant.price_modifier))

        subtotal = unit_price * item_in.quantity
        total += subtotal
        resolved_items.append({
            "product_id": product.id,
            "variant_id": item_in.variant_id,
            "quantity": item_in.quantity,
            "unit_price_snapshot": unit_price,
            "product_name_snapshot": product.name_ru,
        })

    order_number = f"ORD-{uuid.uuid4().hex[:8].upper()}"
    order = Order(
        order_number=order_number,
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        customer_address=data.customer_address,
        total_uzs=total,
        status="pending",
    )
    db.add(order)
    await db.flush()

    for ri in resolved_items:
        db.add(OrderItem(order_id=order.id, **ri))

    await db.commit()
    await db.refresh(order)
    return order
