"""
SR Lux Premium — FastAPI backend
"""

import logging
from contextlib import asynccontextmanager
from datetime import datetime

from xml.sax.saxutils import escape

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from database import get_db, init_db
from routers import admin, categories, catalog, currencies, orders, products
from routers import models as models_router
from fastapi import Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
import crud

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Database tables ready")
    yield
    logger.info("Shutdown")


app = FastAPI(
    title="SR Lux Premium API",
    description="Premium heating & HVAC catalogue with Dolibarr ERP integration",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# Request body size limit: 10 MB (25 MB on the project-file upload route,
# since PDF/DWG project drawings from designers routinely exceed 10 MB)
MAX_BODY_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_UPLOAD_BODY_SIZE = 25 * 1024 * 1024  # 25 MB


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH"):
        limit = MAX_UPLOAD_BODY_SIZE if request.url.path == "/api/orders/upload-file" else MAX_BODY_SIZE
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > limit:
            return JSONResponse(status_code=413, content={"detail": "Request body too large"})
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://srlux.uz",
        "https://www.srlux.uz",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Api-Key", "Accept-Language"],
)

app.include_router(products.router)
app.include_router(categories.router)
app.include_router(orders.router)
app.include_router(admin.router)
app.include_router(models_router.router)
app.include_router(catalog.router)
app.include_router(currencies.router)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok"}


STATIC_SITEMAP_PATHS = ["", "about", "contacts", "delivery", "returns"]


@app.api_route("/sitemap.xml", methods=["GET", "HEAD"], tags=["system"])
async def sitemap(db: AsyncSession = Depends(get_db)):
    base = "https://srlux.uz"
    urls = [f"{base}/{p}" if p else f"{base}/" for p in STATIC_SITEMAP_PATHS]

    rows = await crud.get_model_cards(db)
    urls += [f"{base}/model/{r['code']}" for r in rows]

    categories = await crud.get_categories(db)
    urls += [f"{base}/catalog/{c.slug}" for c in categories]

    body = ['<?xml version="1.0" encoding="UTF-8"?>']
    body.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    for u in urls:
        body.append(f"<url><loc>{u}</loc></url>")
    body.append("</urlset>")

    return Response(content="\n".join(body), media_type="application/xml")


# ── Google Merchant Center product feed ────────────────────────────────────
#
# One <item> per model card (same grouping/data source as the public catalog
# and sitemap — crud.get_model_cards), since that's exactly what "link"
# below points to: every colour/size variant of a model lives on one
# /model/<code> page with no per-SKU URL, so a single feed item using the
# model's "from" price is the accurate offer for that landing page, not a
# compromise. Items without a real image or a positive price are skipped —
# Merchant Center rejects those outright anyway.
#
# google_product_category is deliberately omitted: guessing a Google
# taxonomy string/ID without verifying it against Google's own list risks
# miscategorising every product, and Merchant Center can auto-assign this
# from title/description well enough for the free-listings tier. Revisit
# only if the user wants to map it deliberately per Google's taxonomy file.
@app.api_route("/products.xml", methods=["GET", "HEAD"], tags=["system"])
async def merchant_feed(db: AsyncSession = Depends(get_db)):
    base = "https://srlux.uz"
    rows = await crud.get_model_cards(db)

    body = ['<?xml version="1.0" encoding="UTF-8"?>']
    body.append('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">')
    body.append("<channel>")
    body.append("<title>SR Lux</title>")
    body.append(f"<link>{base}</link>")
    body.append("<description>Премиальные радиаторы, полотенцесушители и климат-контроль — SR Lux, Ташкент</description>")

    skipped_no_image = 0
    skipped_no_price = 0
    for r in rows:
        image_url = r["image_url"]
        price_from = r["price_from"]
        if not image_url:
            skipped_no_image += 1
            continue
        if not price_from or price_from <= 0:
            skipped_no_price += 1
            continue

        image_link = image_url if image_url.startswith("http") else f"{base}{image_url}"
        link = f"{base}/model/{r['code']}"
        name = escape(r["name_ru"] or r["code"])
        category_name = r["category_name"] or ""
        description = escape(
            f"{r['name_ru'] or r['code']}. Категория: {category_name}. "
            f"Премиальное отопительное оборудование SR Lux, склад в Ташкенте."
        )
        availability = "in_stock" if (r["total_stock"] or 0) > 0 else "out_of_stock"
        price = f"{int(price_from)} UZS"

        body.append("<item>")
        body.append(f"<g:id>{escape(r['code'])}</g:id>")
        body.append(f"<title>{name}</title>")
        body.append(f"<description>{description}</description>")
        body.append(f"<link>{escape(link)}</link>")
        body.append(f"<g:image_link>{escape(image_link)}</g:image_link>")
        body.append(f"<g:availability>{availability}</g:availability>")
        body.append(f"<g:price>{price}</g:price>")
        body.append("<g:brand>SR Lux</g:brand>")
        body.append("<g:condition>new</g:condition>")
        body.append("<g:identifier_exists>false</g:identifier_exists>")
        if category_name:
            body.append(f"<g:product_type>{escape(category_name)}</g:product_type>")
        body.append("</item>")

    logger.info(
        f"Merchant-фид: отдано {len(rows) - skipped_no_image - skipped_no_price} товаров, "
        f"пропущено без фото={skipped_no_image}, без цены={skipped_no_price}"
    )

    body.append("</channel>")
    body.append("</rss>")

    return Response(content="\n".join(body), media_type="application/xml")


# ── Yandex Market / Yandex Direct product feed (YML) ────────────────────────
#
# Same data source and same skip rules as the Google feed above
# (crud.get_model_cards; skip items with no image or no positive price), so
# the two feeds never disagree about which products are listed. UZS is a
# supported YML currency id — confirmed against Yandex's published currency
# list (yandex.ru/support/direct/en/feeds/requirements-yml) rather than
# assumed — so prices pass through as plain UZS, no conversion.
#
# categoryId on each offer must reference an id present in <categories>;
# crud.get_categories already returns every ancestor of a product's leaf
# category, so r["category_id"] is always resolvable there. No DOCTYPE
# (shops.dtd) is emitted — Yandex's own feed generators omit it too, and it
# only invites external-DTD-fetch complications for no compliance benefit.
@app.api_route("/market.yml", methods=["GET", "HEAD"], tags=["system"])
async def yandex_market_feed(db: AsyncSession = Depends(get_db)):
    base = "https://srlux.uz"
    rows = await crud.get_model_cards(db)
    cats = await crud.get_categories(db)

    body = ['<?xml version="1.0" encoding="UTF-8"?>']
    body.append(f'<yml_catalog date="{datetime.now().strftime("%Y-%m-%d %H:%M")}">')
    body.append("<shop>")
    body.append("<name>SR Lux</name>")
    body.append("<company>SR Lux</company>")
    body.append(f"<url>{base}</url>")
    body.append('<currencies><currency id="UZS" rate="1"/></currencies>')

    body.append("<categories>")
    for c in cats:
        if c.parent_id:
            body.append(f'<category id="{c.id}" parentId="{c.parent_id}">{escape(c.name_ru)}</category>')
        else:
            body.append(f'<category id="{c.id}">{escape(c.name_ru)}</category>')
    body.append("</categories>")

    body.append("<offers>")
    skipped_no_image = 0
    skipped_no_price = 0
    skipped_no_category = 0
    for r in rows:
        image_url = r["image_url"]
        price_from = r["price_from"]
        if not image_url:
            skipped_no_image += 1
            continue
        if not price_from or price_from <= 0:
            skipped_no_price += 1
            continue
        if not r["category_id"]:
            skipped_no_category += 1
            continue

        image_link = image_url if image_url.startswith("http") else f"{base}{image_url}"
        link = f"{base}/model/{r['code']}"
        name = escape(r["name_ru"] or r["code"])
        category_name = r["category_name"] or ""
        description = escape(
            f"{r['name_ru'] or r['code']}. Категория: {category_name}. "
            f"Премиальное отопительное оборудование SR Lux, склад в Ташкенте."
        )
        available = "true" if (r["total_stock"] or 0) > 0 else "false"

        body.append(f'<offer id="{escape(r["code"])}" available="{available}">')
        body.append(f"<url>{escape(link)}</url>")
        body.append(f"<price>{int(price_from)}</price>")
        body.append("<currencyId>UZS</currencyId>")
        body.append(f"<categoryId>{r['category_id']}</categoryId>")
        body.append(f"<picture>{escape(image_link)}</picture>")
        body.append(f"<name>{name}</name>")
        body.append(f"<description>{description}</description>")
        body.append("<vendor>SR Lux</vendor>")
        body.append("</offer>")

    logger.info(
        f"Yandex YML-фид: отдано {len(rows) - skipped_no_image - skipped_no_price - skipped_no_category} товаров, "
        f"пропущено без фото={skipped_no_image}, без цены={skipped_no_price}, без категории={skipped_no_category}"
    )

    body.append("</offers>")
    body.append("</shop>")
    body.append("</yml_catalog>")

    return Response(content="\n".join(body), media_type="application/xml")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
