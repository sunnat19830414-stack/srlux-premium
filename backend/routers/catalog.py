import logging
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

import crud
from database import get_db
from routers.admin import _require_api_key
from schemas import (
    CatalogGenerateIn,
    CatalogModelListOut,
    CatalogModelOut,
    CatalogPhotoOut,
    CatalogSettingsOut,
    CatalogSettingsUpdateIn,
    CatalogVariantOut,
)

router = APIRouter(prefix="/api/admin/catalog", tags=["catalog"])
logger = logging.getLogger(__name__)


def _resolve_scope(categories: list, category_id: Optional[int]) -> Optional[set[int]]:
    """All descendant category ids (inclusive) of category_id, or None if no filter."""
    if category_id is None:
        return None
    children_of: dict[int, list[int]] = {}
    for c in categories:
        if c.parent_id is not None:
            children_of.setdefault(c.parent_id, []).append(c.id)
    scope = {category_id}
    stack = [category_id]
    while stack:
        cur = stack.pop()
        for child in children_of.get(cur, []):
            if child not in scope:
                scope.add(child)
                stack.append(child)
    return scope

UPLOADS_DIR = Path("/app/uploads")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 MB
_EXT_BY_TYPE = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}


async def _save_upload(file: UploadFile) -> str:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Разрешены только изображения (JPEG, PNG, WebP, GIF)")
    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Файл слишком большой (макс. 5 МБ)")
    ext = _EXT_BY_TYPE.get(file.content_type, "jpg")
    filename = f"{uuid.uuid4().hex}.{ext}"
    (UPLOADS_DIR / filename).write_bytes(data)
    return f"/static/uploads/{filename}"


# ── Models (with retail USD price + catalog-only photos) ──────────────────────

@router.get("/models", response_model=CatalogModelListOut, dependencies=[Depends(_require_api_key)])
async def list_catalog_models(category_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db)):
    scope = None
    if category_id is not None:
        categories = await crud.get_categories(db)
        scope = _resolve_scope(categories, category_id)
    rows = await crud.get_catalog_models(db, category_scope=list(scope) if scope else None)
    models = [
        CatalogModelOut(
            code=r["code"],
            name_ru=r["name_ru"],
            description_ru=r.get("description_ru"),
            category_name=r["category_name"],
            category_id=r["category_id"],
            category_ids=r["category_ids"] or [],
            colors=r.get("colors") or [],
            sections_list=r.get("sections_list") or [],
            height_mm_list=r.get("height_mm_list") or [],
            image_url=r["image_url"],
            price_usd_from=r["price_usd_from"],
            price_usd_to=r["price_usd_to"],
            photos=[CatalogPhotoOut(**p) for p in r["photos"]],
            variants=[CatalogVariantOut(**v) for v in r.get("variants") or []],
        )
        for r in rows
    ]
    return CatalogModelListOut(total=len(models), models=models)


# ── Catalog-only photo overrides ───────────────────────────────────────────────

@router.post("/photos/{model_code}", response_model=CatalogPhotoOut, dependencies=[Depends(_require_api_key)])
async def upload_catalog_photo(model_code: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    image_url = await _save_upload(file)
    photo = await crud.add_catalog_photo(db, model_code, image_url)
    logger.info("Catalog photo added for %s: %s", model_code, image_url)
    return CatalogPhotoOut(id=photo.id, model_code=photo.model_code, image_url=photo.image_url, sort_order=photo.sort_order)


@router.patch("/photos/{photo_id}/primary", response_model=CatalogPhotoOut, dependencies=[Depends(_require_api_key)])
async def set_catalog_photo_primary(photo_id: int, db: AsyncSession = Depends(get_db)):
    photo = await crud.set_catalog_photo_primary(db, photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return CatalogPhotoOut(id=photo.id, model_code=photo.model_code, image_url=photo.image_url, sort_order=photo.sort_order)


@router.delete("/photos/{photo_id}", dependencies=[Depends(_require_api_key)])
async def delete_catalog_photo(photo_id: int, db: AsyncSession = Depends(get_db)):
    ok = await crud.delete_catalog_photo(db, photo_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Photo not found")
    return {"ok": True}


# ── Branding settings ───────────────────────────────────────────────────────────

@router.get("/settings", response_model=CatalogSettingsOut, dependencies=[Depends(_require_api_key)])
async def get_catalog_settings(db: AsyncSession = Depends(get_db)):
    return await crud.get_catalog_settings(db)


@router.patch("/settings", response_model=CatalogSettingsOut, dependencies=[Depends(_require_api_key)])
async def update_catalog_settings(data: CatalogSettingsUpdateIn, db: AsyncSession = Depends(get_db)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    return await crud.update_catalog_settings(db, updates)


@router.post("/logo", response_model=CatalogSettingsOut, dependencies=[Depends(_require_api_key)])
async def upload_catalog_logo(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    logo_url = await _save_upload(file)
    settings = await crud.update_catalog_settings(db, {"logo_url": logo_url})
    logger.info("Catalog logo updated: %s", logo_url)
    return settings


# ── PDF generation ──────────────────────────────────────────────────────────────

@router.post("/generate", dependencies=[Depends(_require_api_key)])
async def generate_catalog(data: CatalogGenerateIn, db: AsyncSession = Depends(get_db)):
    from catalog_pdf import render_catalog_pdf

    categories = await crud.get_categories(db)
    settings = await crud.get_catalog_settings(db)
    scope = _resolve_scope(categories, data.category_id)

    models = await crud.get_catalog_models(db, category_scope=list(scope) if scope else None)
    if scope is not None:
        models = [m for m in models if scope.intersection(m["category_ids"] or [])]

    if not models:
        raise HTTPException(status_code=400, detail="Нет моделей для выбранной категории")

    pdf_bytes = await render_catalog_pdf(models, categories, settings, cards_per_row=data.cards_per_row)
    filename = "catalog.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
