import os

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import crud
from database import get_db
from schemas import BulkImportIn, BulkImportOut

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "srlux_admin_secret_key")


def _require_api_key(x_api_key: str = Header(...)):
    if x_api_key != ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Недействительный API-ключ")


@router.post(
    "/products/bulk",
    response_model=BulkImportOut,
    dependencies=[Depends(_require_api_key)],
)
async def bulk_import_products(
    data: BulkImportIn,
    db: AsyncSession = Depends(get_db),
):
    result = await crud.bulk_upsert_products(db, data.products)
    return BulkImportOut(**result)
