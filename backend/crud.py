import json
import re
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select, text
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


# ── Model cards (Variant 1) ────────────────────────────────────────────────────

async def get_model_cards(db: AsyncSession):
    sql = text("""
        SELECT
            p.parent_model                                        AS code,
            MIN(p.name_ru)                                        AS name_ru,
            MIN(c.name_ru)                                        AS category_name,
            MIN(p.price_uzs)                                      AS price_from,
            MAX(p.price_uzs)                                      AS price_to,
            COALESCE(SUM(p.stock), 0)                             AS total_stock,
            array_agg(DISTINCT p.color)
                FILTER (WHERE p.color IS NOT NULL)                AS colors,
            COALESCE(
                MAX(p.image_url) FILTER (WHERE p.color = 'white'),
                MAX(p.image_url) FILTER (WHERE p.image_url IS NOT NULL)
            )                                                     AS image_url
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = true AND p.parent_model IS NOT NULL
        GROUP BY p.parent_model
        ORDER BY p.parent_model
    """)
    result = await db.execute(sql)
    return result.mappings().all()


async def get_model_detail(db: AsyncSession, code: str):
    result = await db.execute(
        select(Product)
        .where(Product.parent_model == code, Product.is_active == True)
        .options(selectinload(Product.category))
        .order_by(Product.color, Product.sections, Product.height_mm)
    )
    return result.scalars().all()


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
            # Never overwrite manually uploaded photos
            if not getattr(existing, 'image_manual', False):
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


# ── Admin: orders ──────────────────────────────────────────────────────────────

async def admin_list_orders(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    status: Optional[str] = None,
    search: Optional[str] = None,
):
    q = select(Order).options(selectinload(Order.items)).order_by(Order.created_at.desc())
    if search:
        t = f"%{search}%"
        q = q.where(
            Order.order_number.ilike(t)
            | Order.customer_name.ilike(t)
            | Order.customer_phone.ilike(t)
        )
    if status:
        q = q.where(Order.status == status)

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    result = await db.execute(q.offset((page - 1) * limit).limit(limit))
    orders = result.scalars().all()

    # Status counts (global, ignoring current filter)
    counts_raw = dict(
        (await db.execute(select(Order.status, func.count(Order.id)).group_by(Order.status))).all()
    )
    counts = {
        "pending": counts_raw.get("pending", 0),
        "processing": counts_raw.get("processing", 0),
        "completed": counts_raw.get("completed", 0),
        "cancelled": counts_raw.get("cancelled", 0),
        "total": sum(counts_raw.values()),
    }
    return total, orders, counts


async def admin_get_order(db: AsyncSession, order_id: int):
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items))
    )
    return result.scalar_one_or_none()


async def admin_update_order_status(db: AsyncSession, order_id: int, status: str):
    order = await db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        return None
    order.status = status
    await db.commit()
    result = await db.execute(
        select(Order).where(Order.id == order_id).options(selectinload(Order.items))
    )
    return result.scalar_one_or_none()


# ── Admin: products ────────────────────────────────────────────────────────────

async def admin_list_products(
    db: AsyncSession,
    page: int = 1,
    limit: int = 50,
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    category_id: Optional[int] = None,
    sort_by: str = "id",
    sort_dir: str = "asc",
):
    sort_col = {
        "name_ru": Product.name_ru,
        "price_uzs": Product.price_uzs,
        "stock": Product.stock,
        "sort_order": Product.sort_order,
        "id": Product.id,
    }.get(sort_by, Product.id)
    order = sort_col.desc() if sort_dir == "desc" else sort_col.asc()

    q = select(Product).order_by(order)
    if search:
        q = q.where(Product.name_ru.ilike(f"%{search}%") | Product.sku.ilike(f"%{search}%"))
    if is_active is not None:
        q = q.where(Product.is_active == is_active)
    if category_id is not None:
        q = q.where(Product.category_id == category_id)

    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    result = await db.execute(q.offset((page - 1) * limit).limit(limit))
    return total, result.scalars().all()


async def admin_update_product(db: AsyncSession, product_id: int, updates: dict):
    product = await db.scalar(select(Product).where(Product.id == product_id))
    if not product:
        return None
    for key, value in updates.items():
        setattr(product, key, value)
    await db.commit()
    await db.refresh(product)
    return product


# ── Admin: categories ──────────────────────────────────────────────────────────

async def admin_list_categories(db: AsyncSession):
    result = await db.execute(
        select(
            Category,
            func.count(Product.id).label("product_count"),
        )
        .outerjoin(Product, Product.category_id == Category.id)
        .group_by(Category.id)
        .order_by(Category.sort_order, Category.name_ru)
    )
    return result.all()


async def admin_create_category(
    db: AsyncSession, name_ru: str, name_uz: str, icon: str,
    display_style: str = "grid", is_featured: bool = False, sort_order: int = 0,
):
    slug = _slugify(name_ru)
    slug = await _unique_slug(db, Category, slug)
    cat = Category(
        slug=slug, name_ru=name_ru, name_uz=name_uz, icon=icon,
        display_style=display_style, is_featured=is_featured, sort_order=sort_order,
        dolibarr_id=None,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


async def admin_update_category(db: AsyncSession, cat_id: int, updates: dict):
    cat = await db.scalar(select(Category).where(Category.id == cat_id))
    if not cat:
        return None
    for key, value in updates.items():
        setattr(cat, key, value)
    await db.commit()
    await db.refresh(cat)
    return cat


async def admin_delete_category(db: AsyncSession, cat_id: int) -> str:
    cat = await db.scalar(select(Category).where(Category.id == cat_id))
    if not cat:
        return "not_found"
    count = await db.scalar(
        select(func.count()).where(Product.category_id == cat_id)
    )
    if count and count > 0:
        return "has_products"
    await db.delete(cat)
    await db.commit()
    return "ok"


# ── Admin: stats ───────────────────────────────────────────────────────────────

async def admin_get_stats(db: AsyncSession) -> dict:
    from datetime import date, datetime, timedelta

    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    tomorrow_start = today_start + timedelta(days=1)
    week_start = today_start - timedelta(days=7)

    total_orders = await db.scalar(select(func.count()).select_from(Order)) or 0
    orders_today = (
        await db.scalar(
            select(func.count(Order.id)).where(
                Order.created_at >= today_start,
                Order.created_at < tomorrow_start,
            )
        )
        or 0
    )
    orders_week = (
        await db.scalar(
            select(func.count(Order.id)).where(Order.created_at >= week_start)
        )
        or 0
    )
    total_revenue = (
        await db.scalar(
            select(func.sum(Order.total_uzs)).where(Order.status != "cancelled")
        )
        or Decimal("0")
    )
    total_products = await db.scalar(select(func.count()).select_from(Product)) or 0
    active_products = (
        await db.scalar(select(func.count()).where(Product.is_active == True)) or 0
    )
    total_categories = (
        await db.scalar(select(func.count()).select_from(Category)) or 0
    )
    pending_orders = (
        await db.scalar(select(func.count()).where(Order.status == "pending")) or 0
    )

    # Recent orders
    recent_result = await db.execute(
        select(Order).order_by(Order.created_at.desc()).limit(8)
    )
    recent_orders = recent_result.scalars().all()

    # Low stock products (active, stock < 10)
    low_result = await db.execute(
        select(Product)
        .where(Product.is_active == True, Product.stock < 10)
        .order_by(Product.stock.asc())
        .limit(10)
    )
    low_stock = low_result.scalars().all()

    return {
        "total_orders": total_orders,
        "orders_today": orders_today,
        "orders_this_week": orders_week,
        "total_revenue": total_revenue,
        "total_products": total_products,
        "active_products": active_products,
        "total_categories": total_categories,
        "pending_orders": pending_orders,
        "recent_orders": recent_orders,
        "low_stock_products": low_stock,
    }


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
