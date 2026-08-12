import asyncio
import logging
import os
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

UPLOADS_DIR = Path("/app/uploads")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB

import crud
from database import get_db
from schemas import (
    AdminCategoryOut,
    AdminOrderListOut,
    AdminOrderOut,
    AdminProductListOut,
    AdminProductOut,
    AdminStatsOut,
    BulkCategoriesIn,
    BulkCategoriesOut,
    BulkImportIn,
    BulkImportOut,
    CategoryCreateIn,
    CategoryUpdateIn,
    CurrencyOut,
    CurrencyUpdateIn,
    OrderStatusUpdate,
    ProductCreateIn,
    ProductPhotoOut,
    ProductUpdateIn,
    SyncStatusOut,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)

ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")
if not ADMIN_API_KEY:
    raise RuntimeError("ADMIN_API_KEY env var is required but not set")

# In-memory sync state (resets on restart — acceptable for single instance)
_sync_state: dict = {"running": False, "last_run": None, "last_result": None, "last_success": True}


def _require_api_key(request: Request, x_api_key: str = Header(...)):
    if x_api_key != ADMIN_API_KEY:
        logger.warning(
            "Admin auth failed from IP %s",
            request.client.host if request.client else "unknown",
        )
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── Legacy bulk import (used by Dolibarr sync cron) ───────────────────────────

@router.post("/categories/bulk", response_model=BulkCategoriesOut, dependencies=[Depends(_require_api_key)])
async def bulk_import_categories(request: Request, data: BulkCategoriesIn, db: AsyncSession = Depends(get_db)):
    result = await crud.bulk_upsert_categories(db, data.categories)
    logger.info("Admin bulk categories: upserted=%d from IP %s", result["upserted"], request.client.host if request.client else "unknown")
    return BulkCategoriesOut(**result)


@router.post("/products/bulk", response_model=BulkImportOut, dependencies=[Depends(_require_api_key)])
async def bulk_import_products(request: Request, data: BulkImportIn, db: AsyncSession = Depends(get_db)):
    result = await crud.bulk_upsert_products(db, data.products)
    logger.info("Admin bulk products: upserted=%d skipped=%d from IP %s", result["upserted"], result["skipped"], request.client.host if request.client else "unknown")
    return BulkImportOut(**result)


# ── Admin panel: stats ─────────────────────────────────────────────────────────

@router.get("/stats", response_model=AdminStatsOut, dependencies=[Depends(_require_api_key)])
async def get_stats(db: AsyncSession = Depends(get_db)):
    return await crud.admin_get_stats(db)


# ── Admin panel: orders ────────────────────────────────────────────────────────

@router.get("/orders", response_model=AdminOrderListOut, dependencies=[Depends(_require_api_key)])
async def list_orders(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    from schemas import OrderStatusCounts
    total, orders, counts = await crud.admin_list_orders(db, page=page, limit=limit, status=status, search=search)
    return AdminOrderListOut(total=total, page=page, limit=limit, orders=orders, counts=OrderStatusCounts(**counts))


@router.get("/orders/{order_id}", response_model=AdminOrderOut, dependencies=[Depends(_require_api_key)])
async def get_order(order_id: int, db: AsyncSession = Depends(get_db)):
    order = await crud.admin_get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.patch("/orders/{order_id}/status", response_model=AdminOrderOut, dependencies=[Depends(_require_api_key)])
async def update_order_status(order_id: int, data: OrderStatusUpdate, db: AsyncSession = Depends(get_db)):
    order = await crud.admin_update_order_status(db, order_id, data.status)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    logger.info("Order %d status → %s", order_id, data.status)
    return order


# ── Admin panel: products ──────────────────────────────────────────────────────

@router.get("/products", response_model=AdminProductListOut, dependencies=[Depends(_require_api_key)])
async def list_products_admin(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None, max_length=200),
    is_active: Optional[bool] = Query(None),
    category_id: Optional[int] = Query(None, ge=1),
    sort_by: str = Query("id", pattern="^(id|name_ru|price_uzs|stock|sort_order)$"),
    sort_dir: str = Query("asc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
):
    total, products = await crud.admin_list_products(
        db, page=page, limit=limit, search=search,
        is_active=is_active, category_id=category_id,
        sort_by=sort_by, sort_dir=sort_dir,
    )
    return AdminProductListOut(total=total, page=page, limit=limit, products=products)


@router.post("/products", response_model=AdminProductOut, status_code=201, dependencies=[Depends(_require_api_key)])
async def create_product(data: ProductCreateIn, db: AsyncSession = Depends(get_db)):
    product = await crud.admin_create_product(db, data.model_dump())
    if not product:
        raise HTTPException(status_code=409, detail="Товар с таким SKU уже существует")
    logger.info("Product created manually: %s (%s)", product.sku, product.name_ru)
    return product


@router.patch("/products/{product_id}", response_model=AdminProductOut, dependencies=[Depends(_require_api_key)])
async def update_product(product_id: int, data: ProductUpdateIn, db: AsyncSession = Depends(get_db)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    product = await crud.admin_update_product(db, product_id, updates)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    logger.info("Product %d updated: %s", product_id, list(updates.keys()))
    return product


@router.post("/products/{product_id}/image", response_model=AdminProductOut, dependencies=[Depends(_require_api_key)])
async def upload_product_image(product_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Разрешены только изображения (JPEG, PNG, WebP, GIF)")
    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Файл слишком большой (макс. 5 МБ)")
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}.get(file.content_type, "jpg")
    filename = f"{uuid.uuid4().hex}.{ext}"
    (UPLOADS_DIR / filename).write_bytes(data)
    image_url = f"/static/uploads/{filename}"
    product = await crud.admin_update_product(db, product_id, {"image_url": image_url, "image_manual": True})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    logger.info("Product %d image uploaded: %s", product_id, filename)
    return product


# ── Admin panel: product photo gallery (multiple photos per product) ───────────

@router.post("/products/{product_id}/images", response_model=ProductPhotoOut, dependencies=[Depends(_require_api_key)])
async def add_product_photo(product_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Разрешены только изображения (JPEG, PNG, WebP, GIF)")
    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Файл слишком большой (макс. 5 МБ)")
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}.get(file.content_type, "jpg")
    filename = f"{uuid.uuid4().hex}.{ext}"
    (UPLOADS_DIR / filename).write_bytes(data)
    photo = await crud.add_product_photo(db, product_id, f"/static/uploads/{filename}")
    logger.info("Product %d gallery photo added: %s", product_id, filename)
    return photo


@router.patch("/products/images/{photo_id}/primary", response_model=ProductPhotoOut, dependencies=[Depends(_require_api_key)])
async def set_product_photo_primary(photo_id: int, db: AsyncSession = Depends(get_db)):
    photo = await crud.set_product_photo_primary(db, photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return photo


@router.delete("/products/images/{photo_id}", dependencies=[Depends(_require_api_key)])
async def delete_product_photo(photo_id: int, db: AsyncSession = Depends(get_db)):
    ok = await crud.delete_product_photo(db, photo_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Photo not found")
    return {"ok": True}


# ── Admin panel: categories ────────────────────────────────────────────────────

@router.get("/categories-list", response_model=list[AdminCategoryOut], dependencies=[Depends(_require_api_key)])
async def list_categories_admin(db: AsyncSession = Depends(get_db)):
    rows = await crud.admin_list_categories(db)
    return [
        AdminCategoryOut(
            id=cat.id,
            slug=cat.slug,
            name_ru=cat.name_ru,
            name_uz=cat.name_uz,
            icon=cat.icon,
            dolibarr_id=cat.dolibarr_id,
            product_count=count,
            sort_order=cat.sort_order,
            display_style=cat.display_style,
            is_featured=cat.is_featured,
        )
        for cat, count in rows
    ]


@router.post("/categories-list", response_model=AdminCategoryOut, dependencies=[Depends(_require_api_key)])
async def create_category(data: CategoryCreateIn, db: AsyncSession = Depends(get_db)):
    cat = await crud.admin_create_category(
        db, data.name_ru, data.name_uz, data.icon,
        display_style=data.display_style, is_featured=data.is_featured, sort_order=data.sort_order,
    )
    return AdminCategoryOut(
        id=cat.id, slug=cat.slug, name_ru=cat.name_ru, name_uz=cat.name_uz,
        icon=cat.icon, dolibarr_id=cat.dolibarr_id, product_count=0,
        sort_order=cat.sort_order, display_style=cat.display_style, is_featured=cat.is_featured,
    )


@router.patch("/categories-list/{cat_id}", response_model=AdminCategoryOut, dependencies=[Depends(_require_api_key)])
async def update_category(cat_id: int, data: CategoryUpdateIn, db: AsyncSession = Depends(get_db)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    cat = await crud.admin_update_category(db, cat_id, updates)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    rows = await crud.admin_list_categories(db)
    count = next((c for cat2, c in rows if cat2.id == cat_id), 0)
    return AdminCategoryOut(
        id=cat.id, slug=cat.slug, name_ru=cat.name_ru, name_uz=cat.name_uz,
        icon=cat.icon, dolibarr_id=cat.dolibarr_id, product_count=count,
        sort_order=cat.sort_order, display_style=cat.display_style, is_featured=cat.is_featured,
    )


@router.delete("/categories-list/{cat_id}", dependencies=[Depends(_require_api_key)])
async def delete_category(cat_id: int, db: AsyncSession = Depends(get_db)):
    result = await crud.admin_delete_category(db, cat_id)
    if result == "not_found":
        raise HTTPException(status_code=404, detail="Category not found")
    if result == "has_products":
        raise HTTPException(status_code=409, detail="Cannot delete category with products")
    logger.info("Category %d deleted", cat_id)
    return {"ok": True}


# ── Admin panel: sync ──────────────────────────────────────────────────────────

@router.get("/sync/status", response_model=SyncStatusOut, dependencies=[Depends(_require_api_key)])
async def sync_status():
    return SyncStatusOut(**_sync_state)


@router.post("/sync/trigger", response_model=SyncStatusOut, dependencies=[Depends(_require_api_key)])
async def trigger_sync():
    if _sync_state["running"]:
        return SyncStatusOut(**_sync_state)

    async def _run():
        _sync_state["running"] = True
        _sync_state["last_run"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        try:
            proc = await asyncio.create_subprocess_exec(
                "python3", "/app/erp_sync_dolibarr.py",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=300)
            output = stdout.decode()[-500:] if stdout else ""
            success = proc.returncode == 0
            _sync_state["last_result"] = output
            _sync_state["last_success"] = success
            logger.info("Sync finished: returncode=%d", proc.returncode)
        except Exception as e:
            _sync_state["last_result"] = str(e)[:300]
            _sync_state["last_success"] = False
            logger.error("Sync error: %s", e)
        finally:
            _sync_state["running"] = False

    asyncio.create_task(_run())
    return SyncStatusOut(**_sync_state)


# ── Admin panel: currency display rate ──────────────────────────────────────────
# Public GET is in routers/currencies.py — this is the only write path, used
# both by the site's UZS/USD price-display toggle and (per get_usd_rate() in
# erp_sync_dolibarr.py) by the ERP sync's own price conversion, so editing it
# here immediately affects both.

@router.patch("/currencies/{code}", response_model=CurrencyOut, dependencies=[Depends(_require_api_key)])
async def update_currency_rate(code: str, data: CurrencyUpdateIn, db: AsyncSession = Depends(get_db)):
    return await crud.upsert_currency_rate(db, code.upper(), data.rate_to_uzs)
