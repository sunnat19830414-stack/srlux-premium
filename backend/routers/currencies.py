from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import crud
from database import get_db
from schemas import CurrencyOut

router = APIRouter(prefix="/api/currencies", tags=["currencies"])


@router.get("/{code}", response_model=CurrencyOut)
async def get_currency(code: str, db: AsyncSession = Depends(get_db)):
    currency = await crud.get_currency(db, code.upper())
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    return currency
