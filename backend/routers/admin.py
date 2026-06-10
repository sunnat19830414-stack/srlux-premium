import logging
import os

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

import crud
from database import get_db
from schemas import BulkCategoriesIn, BulkCategoriesOut, BulkImportIn, BulkImportOut

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)

ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")
if not ADMIN_API_KEY:
    raise RuntimeError("ADMIN_API_KEY env var is required but not set")


def _require_api_key(request: Request, x_api_key: str = Header(...)):
    if x_api_key != ADMIN_API_KEY:
        logger.warning(
            "Admin auth failed: invalid key from IP %s",
            request.client.host if request.client else "unknown",
        )
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post(
    "/categories/bulk",
    response_model=BulkCategoriesOut,
    dependencies=[Depends(_require_api_key)],
)
async def bulk_import_categories(
    request: Request,
    data: BulkCategoriesIn,
    db: AsyncSession = Depends(get_db),
):
    result = await crud.bulk_upsert_categories(db, data.categories)
    logger.info(
        "Admin bulk categories: upserted=%d from IP %s",
        result["upserted"],
        request.client.host if request.client else "unknown",
    )
    return BulkCategoriesOut(**result)


@router.post(
    "/products/bulk",
    response_model=BulkImportOut,
    dependencies=[Depends(_require_api_key)],
)
async def bulk_import_products(
    request: Request,
    data: BulkImportIn,
    db: AsyncSession = Depends(get_db),
):
    result = await crud.bulk_upsert_products(db, data.products)
    logger.info(
        "Admin bulk products: upserted=%d skipped=%d from IP %s",
        result["upserted"],
        result["skipped"],
        request.client.host if request.client else "unknown",
    )
    return BulkImportOut(**result)
