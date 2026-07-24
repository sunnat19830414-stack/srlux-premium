import hashlib
import logging
import os
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

import crud
from database import get_db
from schemas import OrderIn, OrderOut

router = APIRouter(prefix="/api/orders", tags=["orders"])
logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# Project drawings attached at checkout (PDF/DWG/DXF) — designers and
# builders need to hand off a spec file alongside the order, per the
# engineering-audit checkout requirement.
UPLOAD_DIR = Path("/app/uploads/orders")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_EXTENSIONS = {".pdf", ".dwg", ".dxf"}
MAX_UPLOAD_SIZE = 25 * 1024 * 1024  # 25 MB, matches main.py's per-route body limit


async def _send_telegram(order: OrderOut):
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return
    items_text = "\n".join(
        f"  • {i.product_name_snapshot} × {i.quantity} = {float(i.unit_price_snapshot * i.quantity):,.0f} сум"
        + (f"\n    🎨 RAL по запросу: {i.custom_ral_note}" if i.custom_ral_note else "")
        for i in order.items
    )
    file_line = (
        f"\n📎 Файл проекта: {order.project_file_url}"
        if order.project_file_url else ""
    )
    text = (
        f"🛒 *Новый заказ #{order.order_number}*\n\n"
        f"👤 {order.customer_name}\n"
        f"📞 {order.customer_phone}\n\n"
        f"*Товары:*\n{items_text}\n\n"
        f"💰 *Итого: {float(order.total_uzs):,.0f} сум*"
        f"{file_line}"
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
    except Exception:
        logger.warning("Telegram notification failed (token/network error)")


@router.post("/upload-file")
async def upload_project_file(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Допустимые форматы: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="Файл больше 25 МБ")
    if not raw:
        raise HTTPException(status_code=400, detail="Пустой файл")

    content_hash = hashlib.md5(raw).hexdigest()[:12]
    stored_name = f"{content_hash}{ext}"
    (UPLOAD_DIR / stored_name).write_bytes(raw)

    return {
        "url": f"/static/uploads/orders/{stored_name}",
        "filename": file.filename,
    }


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
