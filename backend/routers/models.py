from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import crud
from database import get_db
from schemas import ModelCardOut, ModelDetailOut, ModelListOut, ModelVariantOut

router = APIRouter(prefix="/api/models", tags=["models"])

# Чистые названия моделей для каталога (канонические ref из Dolibarr)
MODEL_NAMES: dict[str, str] = {
    "AM65":    "AM65 — электрический полотенцесушитель",
    "BAODING": "Baoding — электрический радиатор",
    "BZ":      "BZ / BZV3 — чугунный декоративный",
    "CM":      "CM — электрический полотенцесушитель",
    "GM":      "GM — электрический полотенцесушитель",
    "GZ2":     "GZ2 — трубчатый 2-колонный",
    "GZ3":     "GZ3 — трубчатый 3-колонный",
    "GZ4":     "GZ4 — трубчатый 4-колонный",
    "JD3015":  "JD3015 — прямоугольный (30×15 мм)",
    "JD3030":  "JD3030 — квадратный (30×30 мм)",
    "JD5025":  "JD5025 — плоский (50×25 мм)",
    "JD6812":  "JD6812 — плоский (68×12 мм)",
    "JDC22":   "JDC22 — панельный стальной",
    "JDGL6":   "JDGL6 — сталь + алюминий",
    "MAR":     "MAR — электрический полотенцесушитель",
    "NCR03":   "NCR03 — декоративный (бронза)",
    "WLD11":   "WLD11 — плоский (60×12 мм)",
}


@router.get("", response_model=ModelListOut)
async def list_models(db: AsyncSession = Depends(get_db)):
    rows = await crud.get_model_cards(db)
    cards = [
        ModelCardOut(
            code=r["code"],
            name_ru=MODEL_NAMES.get(r["code"], r["name_ru"]),
            category_name=r["category_name"],
            image_url=r["image_url"],
            colors=sorted(r["colors"] or []),
            price_from=r["price_from"],
            price_to=r["price_to"],
            total_stock=int(r["total_stock"]),
        )
        for r in rows
    ]
    return ModelListOut(total=len(cards), models=cards)


@router.get("/{code}", response_model=ModelDetailOut)
async def get_model(code: str, db: AsyncSession = Depends(get_db)):
    products = await crud.get_model_detail(db, code)
    if not products:
        raise HTTPException(status_code=404, detail="Модель не найдена")

    color_images: dict = {}
    colors: set = set()
    sections_set: set = set()
    heights_set: set = set()
    category_name: str | None = None
    description_ru: str | None = None

    for p in products:
        if p.color:
            colors.add(p.color)
            if p.image_url:
                color_images.setdefault(p.color, p.image_url)
        if p.sections:
            sections_set.add(p.sections)
        if p.height_mm:
            heights_set.add(p.height_mm)
        if p.category and not category_name:
            category_name = p.category.name_ru
        if p.description_ru and not description_ru:
            description_ru = p.description_ru

    variants = [
        ModelVariantOut(
            id=p.id,
            sku=p.sku,
            slug=p.slug,
            name_ru=p.name_ru,
            color=p.color,
            sections=p.sections,
            height_mm=p.height_mm,
            columns_count=p.columns_count,
            price_uzs=p.price_uzs,
            stock=p.stock,
            image_url=p.image_url,
        )
        for p in products
    ]

    return ModelDetailOut(
        code=code,
        name_ru=MODEL_NAMES.get(code, products[0].name_ru),
        description_ru=description_ru,
        category_name=category_name,
        color_images=color_images,
        colors=sorted(colors),
        sections_available=sorted(sections_set),
        height_mm_available=sorted(heights_set),
        variants=variants,
    )
