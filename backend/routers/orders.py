import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import crud
from database import get_db
from schemas import OrderIn, OrderOut

router = APIRouter(prefix="/api/orders", tags=["orders"])
logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")


async def _send_telegram(order: OrderOut):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return
    items_text = "\n".join(
        f"  • {i.product_name_snapshot} × {i.quantity} = {float(i.unit_price_snapshot * i.quantity):,.0f} сум"
        for i in order.items
    )
    text = (
        f"🛒 *Новый заказ #{order.order_number}*\n\n"
        f"👤 {order.customer_name}\n"
        f"📞 {order.customer_phone}\n\n"
        f"*Товары:*\n{items_text}\n\n"
        f"💰 *Итого: {float(order.total_uzs):,.0f} сум*"
    )
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={
                    "chat_id": TELEGRAM_CHAT_ID,
                    "text": text,
                    "parse_mode": "Markdown",
                },
            )
    except Exception as e:
        logger.warning(f"Telegram notification failed: {e}")


@router.post("", response_model=OrderOut, status_code=201)
async def create_order(
    data: OrderIn,
    db: AsyncSession = Depends(get_db),
):
    if not data.items:
        raise HTTPException(status_code=400, detail="Корзина пуста")

    order = await crud.create_order(db, data, data.items)

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from models import Order

    refreshed = await db.execute(
        select(Order)
        .where(Order.id == order.id)
        .options(selectinload(Order.items))
    )
    order_obj = refreshed.scalar_one()
    out = OrderOut.model_validate(order_obj)
    await _send_telegram(out)
    return out
