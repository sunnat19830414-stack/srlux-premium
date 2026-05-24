import json
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import crud
from database import get_db
from schemas import ProductListOut, ProductOut

router = APIRouter(prefix="/api/products", tags=["products"])


def _serialize(obj):
    """JSON-safe serializer for Decimal."""
    from decimal import Decimal
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError


@router.get("", response_model=ProductListOut)
async def list_products(
    page: int = 1,
    limit: int = 20,
    category_id: Optional[int] = None,
    accept_language: str = Header(default="ru"),
    db: AsyncSession = Depends(get_db),
):
    if limit > 100:
        limit = 100
    total, products = await crud.get_products(db, page=page, limit=limit, category_id=category_id)
    return ProductListOut(total=total, page=page, limit=limit, products=products)


@router.get("/{slug}", response_model=ProductOut)
async def get_product(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    product = await crud.get_product_by_slug(db, slug)
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    return product
