import json
import re
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import (
    CatalogPhoto, CatalogSettings, Category, Currency, Order, OrderItem,
    Product, ProductImage, ProductVariant,
)


# ── Slugify helper ─────────────────────────────────────────────────────────────

# Standard GOST-style Cyrillic→Latin map so slugs built from Russian names
# are readable ASCII. Without this, Cyrillic passed straight through the
# regex below untouched (\w matches Unicode word chars, not just ASCII),
# producing slugs like "вертикальные" instead of "vertikalnye".
_CYRILLIC_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def _translit(text: str) -> str:
    return "".join(_CYRILLIC_TRANSLIT.get(ch, ch) for ch in text)


def _slugify(text: str) -> str:
    text = _translit(text.lower().strip())
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
        .options(selectinload(Product.category), selectinload(Product.variants), selectinload(Product.images))
    )
    return result.scalar_one_or_none()


# ── Model cards (Variant 1) ────────────────────────────────────────────────────

async def get_model_cards(db: AsyncSession):
    # Grouped models (radiators, towel warmers, etc. — products that share a
    # parent_model, e.g. colour/size variants of the same physical item) are
    # unioned with genuinely standalone products (parent_model IS NULL — one-off
    # items like plumbing fittings or thermostats that aren't variants of
    # anything) so that every priced, active product is reachable from the
    # catalog, not just the ones that happen to belong to a recognised model.
    sql = text("""
        SELECT
            p.parent_model                                        AS code,
            MIN(p.sort_order)                                     AS sort_order,
            MIN(p.name_ru)                                        AS name_ru,
            MIN(p.name_uz)                                        AS name_uz,
            MIN(c.name_ru)                                        AS category_name,
            MIN(c.name_uz)                                        AS category_name_uz,
            MIN(c.id)                                             AS category_id,
            array_agg(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL) AS category_ids,
            -- G2T_1800-10G-БЕЛЫЙ / G3T_1800-6G-БЕЛЫЙ are paint-order
            -- placeholders, not real stocked SKUs: 0 stock, no height_mm/
            -- sections, and a manually-entered draft price that's well below
            -- the real painted price (confirmed 2026-07-13) — the actual
            -- sale price is written in by hand at time of sale, so they must
            -- not drag down the model's displayed "from" price. Falls back
            -- to the unfiltered MIN/MAX if a model's only variants happen to
            -- be excluded ones, so a price is never silently hidden.
            COALESCE(
                MIN(p.price_uzs) FILTER (WHERE p.sku NOT IN ('G2T_1800-10G-БЕЛЫЙ', 'G3T_1800-6G-БЕЛЫЙ')),
                MIN(p.price_uzs)
            )                                                      AS price_from,
            COALESCE(
                MAX(p.price_uzs) FILTER (WHERE p.sku NOT IN ('G2T_1800-10G-БЕЛЫЙ', 'G3T_1800-6G-БЕЛЫЙ')),
                MAX(p.price_uzs)
            )                                                      AS price_to,
            COALESCE(SUM(p.stock), 0)                             AS total_stock,
            array_agg(DISTINCT p.color)
                FILTER (WHERE p.color IS NOT NULL)                AS colors,
            COALESCE(
                MAX(p.image_url) FILTER (WHERE p.color = 'white' AND p.sku NOT IN ('JDC22-1200-400W')),
                MAX(p.image_url) FILTER (WHERE p.image_url IS NOT NULL AND p.sku NOT IN ('JDC22-1200-400W')),
                MAX(p.image_url) FILTER (WHERE p.image_url IS NOT NULL)
            )                                                     AS image_url,
            -- One representative photo per category branch the model spans,
            -- so a model sold in both a tall/vertical and a short/horizontal
            -- size (e.g. GZ2, GZ3) shows a photo matching whichever branch
            -- the customer is actually browsing, instead of one arbitrary
            -- cover photo that may show the wrong orientation. JDC22-1200-400W
            -- is excluded as a *cover* candidate: its own attached photo is a
            -- mismatched product shot (confirmed 2026-07-13), so picking it
            -- as the representative for its branch would show the wrong item
            -- — the SKU itself still displays its own (wrong) photo on its
            -- own product page until a correct one is uploaded in Dolibarr.
            COALESCE(
                jsonb_object_agg(c.id, p.image_url)
                    FILTER (WHERE c.id IS NOT NULL AND p.image_url IS NOT NULL AND p.sku NOT IN ('JDC22-1200-400W')),
                jsonb_object_agg(c.id, p.image_url)
                    FILTER (WHERE c.id IS NOT NULL AND p.image_url IS NOT NULL)
            )                                                     AS category_images
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = true AND p.parent_model IS NOT NULL
        GROUP BY p.parent_model

        UNION ALL

        SELECT
            p.sku                                                 AS code,
            p.sort_order                                           AS sort_order,
            p.name_ru                                              AS name_ru,
            p.name_uz                                              AS name_uz,
            c.name_ru                                              AS category_name,
            c.name_uz                                              AS category_name_uz,
            c.id                                                    AS category_id,
            CASE WHEN c.id IS NOT NULL THEN ARRAY[c.id] ELSE ARRAY[]::integer[] END AS category_ids,
            p.price_uzs                                            AS price_from,
            p.price_uzs                                            AS price_to,
            COALESCE(p.stock, 0)                                   AS total_stock,
            NULL                                                   AS colors,
            p.image_url                                            AS image_url,
            CASE WHEN c.id IS NOT NULL AND p.image_url IS NOT NULL
                 THEN jsonb_build_object(c.id::text, p.image_url)
                 ELSE '{}'::jsonb
            END                                                     AS category_images
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = true AND p.parent_model IS NULL AND p.price_uzs > 0

        ORDER BY sort_order, code
    """)
    result = await db.execute(sql)
    return result.mappings().all()


async def get_catalog_models(db: AsyncSession, category_scope: Optional[list[int]] = None):
    """
    Model list for the admin-only PDF catalog generator. Same grouping as
    get_model_cards (parent_model groups + standalone products), but adds
    price_usd_from/price_usd_to (the raw Dolibarr retail price, never
    shown on the public site/API) and attaches each model's catalog-only
    photo overrides from catalog_photos — kept as a *separate* table/join
    rather than reusing Product.image_url so that fixing a photo for the
    printed catalog never touches what customers see on srlux.uz.

    Some Dolibarr "model" families (e.g. GZ2/GZ3 "Column" radiators) contain
    SKUs that live in genuinely different site categories — a tall vertical
    variant and a short horizontal one sharing the same model code. The
    per-category `category_images` map (same proven mechanism already used by
    the public get_model_cards/site catalog for this exact GZ2/GZ3 case,
    confirmed 2026-07-13) lets category_scope pick the photo matching whichever
    branch the caller is actually generating/previewing, instead of one
    arbitrary global cover photo that may show the wrong orientation.
    """
    sql = text("""
        SELECT
            p.parent_model                                        AS code,
            MIN(p.sort_order)                                     AS sort_order,
            MIN(p.name_ru)                                        AS name_ru,
            MIN(p.description_ru)                                 AS description_ru,
            MIN(c.name_ru)                                        AS category_name,
            MIN(c.id)                                             AS category_id,
            array_agg(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL) AS category_ids,
            array_agg(DISTINCT p.color) FILTER (WHERE p.color IS NOT NULL) AS colors,
            array_agg(DISTINCT p.sections) FILTER (WHERE p.sections IS NOT NULL) AS sections_list,
            array_agg(DISTINCT p.height_mm) FILTER (WHERE p.height_mm IS NOT NULL) AS height_mm_list,
            COALESCE(
                MAX(p.image_url) FILTER (WHERE p.color = 'white' AND p.sku NOT IN ('JDC22-1200-400W')),
                MAX(p.image_url) FILTER (WHERE p.image_url IS NOT NULL AND p.sku NOT IN ('JDC22-1200-400W')),
                MAX(p.image_url) FILTER (WHERE p.image_url IS NOT NULL)
            )                                                     AS image_url,
            COALESCE(
                jsonb_object_agg(c.id, p.image_url)
                    FILTER (WHERE c.id IS NOT NULL AND p.image_url IS NOT NULL AND p.sku NOT IN ('JDC22-1200-400W')),
                jsonb_object_agg(c.id, p.image_url)
                    FILTER (WHERE c.id IS NOT NULL AND p.image_url IS NOT NULL)
            )                                                     AS category_images,
            COALESCE(
                MIN(p.price_usd) FILTER (WHERE p.sku NOT IN ('G2T_1800-10G-БЕЛЫЙ', 'G3T_1800-6G-БЕЛЫЙ', 'G3T-300-32W') AND p.price_usd > 0),
                MIN(p.price_usd) FILTER (WHERE p.price_usd > 0)
            )                                                     AS price_usd_from,
            COALESCE(
                MAX(p.price_usd) FILTER (WHERE p.sku NOT IN ('G2T_1800-10G-БЕЛЫЙ', 'G3T_1800-6G-БЕЛЫЙ', 'G3T-300-32W') AND p.price_usd > 0),
                MAX(p.price_usd) FILTER (WHERE p.price_usd > 0)
            )                                                     AS price_usd_to,
            json_agg(
                json_build_object(
                    'height_mm', p.height_mm, 'sections', p.sections, 'price_usd', p.price_usd,
                    'weight', p.weight, 'power_w_dt50', p.power_w_dt50,
                    'width_mm', p.width_mm, 'depth_mm', p.depth_mm,
                    'color', p.color, 'category_id', c.id
                )
                ORDER BY p.height_mm NULLS FIRST, p.sections NULLS FIRST
            ) FILTER (WHERE p.sku NOT IN ('G2T_1800-10G-БЕЛЫЙ', 'G3T_1800-6G-БЕЛЫЙ', 'G3T-300-32W') AND p.price_usd > 0)
                                                                    AS variants_raw
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = true AND p.parent_model IS NOT NULL
        GROUP BY p.parent_model

        UNION ALL

        SELECT
            p.sku                                                 AS code,
            p.sort_order                                          AS sort_order,
            p.name_ru                                              AS name_ru,
            p.description_ru                                       AS description_ru,
            c.name_ru                                              AS category_name,
            c.id                                                    AS category_id,
            CASE WHEN c.id IS NOT NULL THEN ARRAY[c.id] ELSE ARRAY[]::integer[] END AS category_ids,
            CASE WHEN p.color IS NOT NULL THEN ARRAY[p.color] ELSE ARRAY[]::varchar[] END AS colors,
            CASE WHEN p.sections IS NOT NULL THEN ARRAY[p.sections] ELSE ARRAY[]::integer[] END AS sections_list,
            CASE WHEN p.height_mm IS NOT NULL THEN ARRAY[p.height_mm] ELSE ARRAY[]::integer[] END AS height_mm_list,
            p.image_url                                            AS image_url,
            CASE WHEN c.id IS NOT NULL AND p.image_url IS NOT NULL
                 THEN jsonb_build_object(c.id::text, p.image_url)
                 ELSE '{}'::jsonb
            END                                                     AS category_images,
            p.price_usd                                            AS price_usd_from,
            p.price_usd                                            AS price_usd_to,
            NULL::json                                             AS variants_raw
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = true AND p.parent_model IS NULL AND p.price_uzs > 0

        ORDER BY sort_order, code
    """)
    result = await db.execute(sql)
    rows = [dict(r) for r in result.mappings().all()]

    scope_set = set(category_scope) if category_scope else None
    for m in rows:
        images = m.get("category_images") or {}
        if scope_set and images:
            match = next((cid for cid in (m["category_ids"] or []) if cid in scope_set and str(cid) in images), None)
            if match is not None:
                m["image_url"] = images[str(match)]
        m.pop("category_images", None)

        # Colour doesn't affect price on this data (confirmed — e.g. GZ3's
        # 1800mm/8-section variant prices only differ by a rounding cent
        # across colours), so collapse the raw per-SKU rows down to one row
        # per (height_mm, sections, category_id) combo for the printed
        # variants table. category_id is part of the key because some model
        # families (GZ2/GZ3 "Column" radiators) have SKUs split across a
        # vertical and a horizontal category branch, and the table needs to
        # keep those separate rather than merge them.
        #
        # "raw"/грунт (unpainted primer-only) SKUs are excluded from weight/
        # width/depth/colour roll-ups by explicit request (2026-07-15) — they
        # aren't a sellable finish, and their weight in particular is
        # materially different from the painted colours at the same size
        # (e.g. GZ2's 1800mm/6-section "без краски" SKU weighs 10kg vs 25kg
        # painted), which would otherwise show a misleading "10–25" range for
        # what customers actually buy. Price is unaffected either way, so raw
        # SKUs still count toward it.
        # Some model families (confirmed on GZ2/GZ3 "Column" radiators) carry
        # duplicate SKUs for the same real product — a legacy code (e.g.
        # "GZ2T-12_1500W") sitting alongside its later, properly-structured
        # replacement ("GZ2-12_1500_White") — where the legacy SKU never got
        # height_mm/sections filled in at all. Grouped by (height_mm,
        # sections, category_id), a legacy SKU's own (None, None, cid) key
        # produces a separate row that's entirely dashes in the printed
        # table and explains nothing. height_mm is the one column every
        # variants-table row needs to be meaningful, so skip rows missing
        # it — the real, fully-structured duplicate already covers the same
        # size/price/colour elsewhere in the table.
        groups: dict[tuple, dict] = {}
        for v in m.pop("variants_raw", None) or []:
            if v.get("height_mm") is None:
                continue
            key = (v.get("height_mm"), v.get("sections"), v.get("category_id"))
            g = groups.get(key)
            if g is None:
                g = {
                    "height_mm": v.get("height_mm"),
                    "sections": v.get("sections"),
                    "category_id": v.get("category_id"),
                    "prices": [],
                    "weights": [],
                    "powers": [],
                    "widths": [],
                    "depths": [],
                    "colors": [],
                }
                groups[key] = g
            # Distinct SKUs sharing one (height_mm, sections, category_id) row
            # can have different prices (e.g. JDC22's width varies within one
            # row) — track every price seen, same as weight/power/etc, instead
            # of keeping whichever SKU happened to be first in json_agg's
            # order (that picked an arbitrary, sometimes-wrong price and made
            # the printed price shift between syncs — reported 2026-07-15).
            if v.get("price_usd") is not None:
                price_val = float(v["price_usd"])
                if price_val not in g["prices"]:
                    g["prices"].append(price_val)
            if v.get("color") == "raw":
                continue
            if v.get("weight") is not None and v["weight"] not in g["weights"]:
                g["weights"].append(v["weight"])
            if v.get("power_w_dt50") is not None and v["power_w_dt50"] not in g["powers"]:
                g["powers"].append(v["power_w_dt50"])
            if v.get("width_mm") is not None and v["width_mm"] not in g["widths"]:
                g["widths"].append(v["width_mm"])
            if v.get("depth_mm") is not None and v["depth_mm"] not in g["depths"]:
                g["depths"].append(v["depth_mm"])
            if v.get("color") and v["color"] not in g["colors"]:
                g["colors"].append(v["color"])
        m["variants"] = sorted(
            groups.values(),
            key=lambda v: (v.get("height_mm") is None, v.get("height_mm") or 0,
                            v.get("sections") is None, v.get("sections") or 0),
        )

    photos_result = await db.execute(
        text("SELECT id, model_code, image_url, sort_order FROM catalog_photos ORDER BY model_code, sort_order")
    )
    photos_by_model: dict[str, list[dict]] = {}
    for row in photos_result.mappings().all():
        photos_by_model.setdefault(row["model_code"], []).append(dict(row))

    for m in rows:
        m["photos"] = photos_by_model.get(m["code"], [])
        if m["photos"]:
            m["image_url"] = m["photos"][0]["image_url"]

    return rows


async def add_catalog_photo(db: AsyncSession, model_code: str, image_url: str):
    max_sort = await db.scalar(
        text("SELECT COALESCE(MAX(sort_order), -1) FROM catalog_photos WHERE model_code = :code"),
        {"code": model_code},
    )
    photo = CatalogPhoto(model_code=model_code, image_url=image_url, sort_order=max_sort + 1)
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return photo


async def set_catalog_photo_primary(db: AsyncSession, photo_id: int):
    photo = await db.get(CatalogPhoto, photo_id)
    if not photo:
        return None
    others = (await db.execute(
        select(CatalogPhoto)
        .where(CatalogPhoto.model_code == photo.model_code, CatalogPhoto.id != photo_id)
        .order_by(CatalogPhoto.sort_order)
    )).scalars().all()
    photo.sort_order = 0
    for i, other in enumerate(others, start=1):
        other.sort_order = i
    await db.commit()
    return photo


async def delete_catalog_photo(db: AsyncSession, photo_id: int) -> bool:
    photo = await db.get(CatalogPhoto, photo_id)
    if not photo:
        return False
    await db.delete(photo)
    await db.commit()
    return True


async def get_catalog_settings(db: AsyncSession):
    settings = await db.get(CatalogSettings, 1)
    if not settings:
        settings = CatalogSettings(id=1)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


async def update_catalog_settings(db: AsyncSession, updates: dict):
    settings = await get_catalog_settings(db)
    for key, value in updates.items():
        if value is not None:
            setattr(settings, key, value)
    await db.commit()
    await db.refresh(settings)
    return settings


# ── Currencies (public display-rate + admin-editable) ──────────────────────────

async def get_currency(db: AsyncSession, code: str):
    return await db.scalar(select(Currency).where(Currency.code == code))


async def upsert_currency_rate(db: AsyncSession, code: str, rate_to_uzs):
    currency = await get_currency(db, code)
    if currency:
        currency.rate_to_uzs = rate_to_uzs
    else:
        currency = Currency(code=code, rate_to_uzs=rate_to_uzs)
        db.add(currency)
    await db.commit()
    await db.refresh(currency)
    return currency


async def get_model_detail(db: AsyncSession, code: str):
    result = await db.execute(
        select(Product)
        .where(Product.parent_model == code, Product.is_active == True)
        .options(selectinload(Product.category), selectinload(Product.images))
        .order_by(Product.color, Product.sections, Product.height_mm)
    )
    products = result.scalars().all()
    if products:
        return products
    # Fallback: `code` may be a standalone product's own SKU (no parent_model)
    result = await db.execute(
        select(Product)
        .where(Product.sku == code, Product.is_active == True)
        .options(selectinload(Product.category), selectinload(Product.images))
    )
    return result.scalars().all()


# ── Categories ─────────────────────────────────────────────────────────────────

async def get_categories(db: AsyncSession):
    # Categories with at least one active product, plus every ancestor of
    # those (so parent nodes like "Радиаторы" > "Вертикальные" show up in the
    # tree even though products are only ever linked to the leaf category).
    all_cats = (await db.execute(select(Category))).scalars().all()
    direct_ids = set((await db.execute(
        select(Product.category_id)
        .where(Product.is_active == True, Product.category_id.isnot(None))
        .distinct()
    )).scalars().all())

    by_id = {c.id: c for c in all_cats}
    included: set[int] = set()
    for cid in direct_ids:
        cur = by_id.get(cid)
        while cur and cur.id not in included:
            included.add(cur.id)
            cur = by_id.get(cur.parent_id) if cur.parent_id else None

    result = [c for c in all_cats if c.id in included]
    result.sort(key=lambda c: (c.sort_order, c.name_ru))
    return result


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
    await db.flush()

    # Second pass: resolve parent_dolibarr_id -> parent_id now that every
    # category in this batch has been created and has an id.
    for item in items:
        if not item.parent_dolibarr_id:
            continue
        cat = await db.scalar(select(Category).where(Category.dolibarr_id == item.dolibarr_id))
        parent = await db.scalar(select(Category).where(Category.dolibarr_id == item.parent_dolibarr_id))
        if cat and parent:
            cat.parent_id = parent.id

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
            .options(selectinload(Product.images))
        )
        if not existing:
            existing = await db.scalar(
                select(Product).where(Product.sku == item.sku)
                .options(selectinload(Product.images))
            )

        if existing:
            # Keep sku in sync with Dolibarr's ref — otherwise a rename in
            # Dolibarr leaves the site showing the old ref forever, since
            # products are matched by dolibarr_id (stable) not sku.
            if item.sku and item.sku != existing.sku:
                existing.sku = item.sku
            existing.name_ru = item.name_ru
            # Dolibarr has no working multilang API in this install (verified:
            # writes silently don't persist) — uz translations are maintained
            # directly on the site instead, so never let a sync's blank
            # name_uz/description_uz (Dolibarr always sends None for these)
            # wipe out a translation that's already been filled in.
            if item.name_uz:
                existing.name_uz = item.name_uz
            # Same reasoning applies to description_ru: entity=1 products
            # without a Dolibarr description send None here, and entity=2
            # ("Трап") products only started sending a real value once
            # export.php was extended to include it — a still-blank source
            # description must not wipe out a description filled in by hand
            # or already synced from a previous pass.
            if item.description_ru:
                existing.description_ru = item.description_ru
            if item.description_uz:
                existing.description_uz = item.description_uz
            existing.price_uzs = item.price_uzs
            existing.price_usd = item.price_usd
            existing.stock = item.stock
            existing.weight = item.weight
            existing.width_mm = item.width_mm
            existing.depth_mm = item.depth_mm
            # Never overwrite manually uploaded photos
            if not getattr(existing, 'image_manual', False):
                if item.image_url or not existing.image_url:
                    existing.image_url = item.image_url
                # Gallery photos come entirely from Dolibarr — always mirror
                # whatever is currently attached there (replace-all).
                existing.images = [
                    ProductImage(image_url=url, sort_order=i)
                    for i, url in enumerate(item.images)
                ]
            existing.is_active = item.is_active
            existing.parent_model = item.parent_model
            # Dolibarr is the source of truth for category assignment — always
            # mirror it, so re-categorizing a product there (e.g. moving it
            # between sub-categories) actually takes effect on resync instead
            # of being stuck on whatever category it first synced under.
            if category_id:
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
                price_usd=item.price_usd,
                stock=item.stock,
                weight=item.weight,
                width_mm=item.width_mm,
                depth_mm=item.depth_mm,
                image_url=item.image_url,
                parent_model=item.parent_model,
                is_active=item.is_active,
                category_id=category_id,
                images=[
                    ProductImage(image_url=url, sort_order=i)
                    for i, url in enumerate(item.images)
                ],
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

    q = select(Product).options(selectinload(Product.images)).order_by(order)
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
    product = await db.scalar(
        select(Product).options(selectinload(Product.images)).where(Product.id == product_id)
    )
    if not product:
        return None
    for key, value in updates.items():
        setattr(product, key, value)
    await db.commit()
    # commit() expires every attribute on the object (including relationships
    # that were selectinload'd above) — refresh() only reloads the plain
    # columns unless a relationship is explicitly named too, so both calls
    # are needed or `images` would trigger an unawaited lazy-load later
    # during response serialization.
    await db.refresh(product)
    await db.refresh(product, attribute_names=["images"])
    return product


async def admin_create_product(db: AsyncSession, data: dict):
    """Manually-added product (dolibarr_id left NULL) — for items sourced
    ad-hoc from other suppliers that don't live in Dolibarr at all. Since the
    ERP sync only ever touches rows it recognises by dolibarr_id/sku, a NULL
    dolibarr_id row is permanently outside its reach and safe from being
    overwritten or hidden by a future sync pass. Returns None on a duplicate
    SKU so the router can turn that into a 409 instead of a raw DB error."""
    existing = await db.scalar(select(Product).where(Product.sku == data["sku"]))
    if existing:
        return None
    slug = _slugify(data["name_ru"])
    slug = await _unique_slug(db, Product, slug)
    product = Product(
        dolibarr_id=None,
        sku=data["sku"],
        slug=slug,
        name_ru=data["name_ru"],
        name_uz=data.get("name_uz"),
        description_ru=data.get("description_ru"),
        description_uz=data.get("description_uz"),
        price_uzs=data["price_uzs"],
        stock=data.get("stock", 0),
        category_id=data.get("category_id"),
        is_active=data.get("is_active", True),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    await db.refresh(product, attribute_names=["images"])
    return product


# ── Admin: product photo gallery ────────────────────────────────────────────────

async def add_product_photo(db: AsyncSession, product_id: int, image_url: str):
    """Appends a gallery photo and, per the image_manual convention already
    used by the single-cover endpoint, marks the product's photos as
    manually managed so the Dolibarr sync (which otherwise mirrors its own
    document list onto Product.images wholesale) never overwrites them."""
    max_sort = await db.scalar(
        text("SELECT COALESCE(MAX(sort_order), -1) FROM product_images WHERE product_id = :pid"),
        {"pid": product_id},
    )
    photo = ProductImage(product_id=product_id, image_url=image_url, sort_order=max_sort + 1)
    db.add(photo)
    product = await db.get(Product, product_id)
    if product:
        product.image_manual = True
        if not product.image_url:
            product.image_url = image_url
    await db.commit()
    await db.refresh(photo)
    return photo


async def set_product_photo_primary(db: AsyncSession, photo_id: int):
    photo = await db.get(ProductImage, photo_id)
    if not photo:
        return None
    others = (await db.execute(
        select(ProductImage)
        .where(ProductImage.product_id == photo.product_id, ProductImage.id != photo_id)
        .order_by(ProductImage.sort_order)
    )).scalars().all()
    photo.sort_order = 0
    for i, other in enumerate(others, start=1):
        other.sort_order = i
    product = await db.get(Product, photo.product_id)
    if product:
        product.image_url = photo.image_url
        product.image_manual = True
    await db.commit()
    return photo


async def delete_product_photo(db: AsyncSession, photo_id: int) -> bool:
    photo = await db.get(ProductImage, photo_id)
    if not photo:
        return False
    product = await db.get(Product, photo.product_id)
    was_cover = bool(product and product.image_url == photo.image_url)
    await db.delete(photo)
    await db.flush()
    if was_cover and product:
        product.image_url = await db.scalar(
            select(ProductImage.image_url)
            .where(ProductImage.product_id == photo.product_id)
            .order_by(ProductImage.sort_order)
            .limit(1)
        )
    await db.commit()
    return True


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
            "custom_ral_note": getattr(item_in, "custom_ral_note", None),
        })

    order_number = f"ORD-{uuid.uuid4().hex[:8].upper()}"
    order = Order(
        order_number=order_number,
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        customer_address=data.customer_address,
        customer_email=getattr(data, "customer_email", None),
        total_uzs=total,
        status="pending",
        project_file_url=getattr(data, "project_file_url", None),
        project_file_name=getattr(data, "project_file_name", None),
    )
    db.add(order)
    await db.flush()

    for ri in resolved_items:
        db.add(OrderItem(order_id=order.id, **ri))

    await db.commit()
    await db.refresh(order)
    return order
