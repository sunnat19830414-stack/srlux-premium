from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import crud
from database import get_db
from models import Category
from schemas import ModelCardOut, ModelDetailOut, ModelListOut, ModelVariantOut, RelatedModelsOut

router = APIRouter(prefix="/api/models", tags=["models"])

# Чистые названия моделей для каталога (канонические ref из Dolibarr)
MODEL_NAMES: dict[str, str] = {
    "AM65":    "AM65 — электрический полотенцесушитель",
    "BAODING": "Baoding — электрический радиатор",
    "BZ":      "BZ / BZV3 — чугунный декоративный",
    "CM":      "CM — электрический полотенцесушитель",
    "CM10":    "Вешалка — электр. полотенцесушитель",
    "CM20":    "Дуо круглая — электр. полотенцесушитель",
    "CM30":    "Трио круглая — электр. полотенцесушитель",
    "CM32":    "Трио Квадратная — электр. полотенцесушитель",
    "CM56":    "Квадро — электр. полотенцесушитель",
    "GM":      "Дуо Квадратная — электр. полотенцесушитель",
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
    "MAR660020": "Pure Guard — электр. полотенцесушитель",
    "MAR660021": "Solo Slim — электр. полотенцесушитель",
    "MAR660035": "Smart Frame — электр. полотенцесушитель",
    "MAR660065": "Side Edge — электр. полотенцесушитель",
    "MAR660067": "Quadra Stand — электр. полотенцесушитель",
    "MAR660076": "Mesh Lux — электр. полотенцесушитель",
    "MAR660078": "Carbon Peak — электр. полотенцесушитель",
    "NCR03":   "NCR03 — декоративный (бронза)",
    "WLD11":   "WLD11 — плоский (60×12 мм)",
}

MODEL_NAMES_UZ: dict[str, str] = {
    "AM65":    "AM65 — elektr sochiq isitgichi",
    "BAODING": "Baoding — elektr radiator",
    "BZ":      "BZ / BZV3 — dekorativ cho'yan",
    "CM":      "CM — elektr sochiq isitgichi",
    "CM10":    "Ilgak — elektr sochiq isitgichi",
    "CM20":    "Duo (dumaloq) — elektr sochiq isitgichi",
    "CM30":    "Trio (dumaloq) — elektr sochiq isitgichi",
    "CM32":    "Trio (kvadrat) — elektr sochiq isitgichi",
    "CM56":    "Kvadro — elektr sochiq isitgichi",
    "GM":      "Duo (kvadrat) — elektr sochiq isitgichi",
    "GZ2":     "GZ2 — 2 qatorli quvursimon",
    "GZ3":     "GZ3 — 3 qatorli quvursimon",
    "GZ4":     "GZ4 — 4 qatorli quvursimon",
    "JD3015":  "JD3015 — to'rtburchak (30×15 mm)",
    "JD3030":  "JD3030 — kvadrat (30×30 mm)",
    "JD5025":  "JD5025 — yassi (50×25 mm)",
    "JD6812":  "JD6812 — yassi (68×12 mm)",
    "JDC22":   "JDC22 — po'lat panelli",
    "JDGL6":   "JDGL6 — po'lat + alyuminiy",
    "MAR":     "MAR — elektr sochiq isitgichi",
    "MAR660020": "Pure Guard — elektr sochiq isitgichi",
    "MAR660021": "Solo Slim — elektr sochiq isitgichi",
    "MAR660035": "Smart Frame — elektr sochiq isitgichi",
    "MAR660065": "Side Edge — elektr sochiq isitgichi",
    "MAR660067": "Quadra Stand — elektr sochiq isitgichi",
    "MAR660076": "Mesh Lux — elektr sochiq isitgichi",
    "MAR660078": "Carbon Peak — elektr sochiq isitgichi",
    "NCR03":   "NCR03 — dekorativ (bronza)",
    "WLD11":   "WLD11 — yassi (60×12 mm)",
}


@router.get("", response_model=ModelListOut)
async def list_models(db: AsyncSession = Depends(get_db)):
    rows = await crud.get_model_cards(db)
    cards = [
        ModelCardOut(
            code=r["code"],
            name_ru=MODEL_NAMES.get(r["code"], r["name_ru"]),
            name_uz=MODEL_NAMES_UZ.get(r["code"], r["name_uz"]),
            category_name=r["category_name"],
            category_name_uz=r["category_name_uz"],
            category_id=r["category_id"],
            category_ids=list(r["category_ids"] or []),
            image_url=r["image_url"],
            category_images={str(k): v for k, v in (r["category_images"] or {}).items()},
            colors=sorted(r["colors"] or []),
            price_from=r["price_from"],
            price_to=r["price_to"],
            total_stock=int(r["total_stock"]),
        )
        for r in rows
    ]
    return ModelListOut(total=len(cards), models=cards)


# Which category a model belongs to determines what's offered alongside it
# on the product page ("С этим покупают") — curated by hand rather than
# derived from real order history, since the site has only a handful of
# orders so far, nowhere near enough to compute genuine co-purchase stats.
# Keyed by the *root* category id (Радиаторы=1, Фанкойлы=13, ...), value is
# the leaf category id(s) to pull complementary products from. This is the
# *general* pool — valve kits/thermostats that fit any ordinary radiator.
COMPLEMENTARY_ROOT_TO_LEAVES: dict[int, list[int]] = {
    1: [21, 52],   # Радиаторы → Радиаторные краны, Датчики (для водяного отопления)
    13: [51],      # Фанкойлы → Датчики (для фанкойлов)
}

# Cast-iron (14) and decorative bronze (26) radiators use different fitting
# threads than the modern tube/panel lines — the general valve-kit pool
# physically doesn't fit them, so they're excluded from it entirely and get
# only their own dedicated accessory below instead of a wrong recommendation.
COMPLEMENTARY_GENERAL_EXCLUDE_LEAVES = {14, 26}

# Accessories that only fit one specific radiator line (not interchangeable
# across the whole Радиаторы tree) — keyed by the *leaf* category id(s) of
# the radiator(s) they're compatible with. These are never offered outside
# that specific line, even though they physically live in a broader
# category (e.g. the cast-iron valve sits in "Радиаторные краны" alongside
# valves for ordinary radiators, but only actually fits cast-iron/NCR03).
PRODUCT_SPECIFIC_COMPLEMENTS: dict[int, list[str]] = {
    14: ["radiator_valve_kit"],   # Чугунные радиаторы
    26: ["radiator_valve_kit"],   # NCR03 — Радиатор стальной Антик Бронза
    49: ["VENTILATOR-RAD"],       # Стальной панельный / JDC22 (Вертикальные)
    50: ["VENTILATOR-RAD"],       # Стальной панельный / JDC22 (Горизонтальные)
}

# Codes above must never leak into the *general* pool for unrelated radiators
# (e.g. GZ2 shouldn't suggest the cast-iron-only valve just because it also
# happens to sit in "Радиаторные краны").
_SPECIFIC_ONLY_CODES = {c for codes in PRODUCT_SPECIFIC_COMPLEMENTS.values() for c in codes}


def _root_category_id(cat_id: int, parent_of: dict[int, int | None]) -> int:
    cur = cat_id
    while parent_of.get(cur) is not None:
        cur = parent_of[cur]
    return cur


@router.get("/{code}/related", response_model=RelatedModelsOut)
async def get_related(code: str, db: AsyncSession = Depends(get_db)):
    rows = await crud.get_model_cards(db)
    cards: dict[str, ModelCardOut] = {}
    for r in rows:
        cards[r["code"]] = ModelCardOut(
            code=r["code"],
            name_ru=MODEL_NAMES.get(r["code"], r["name_ru"]),
            name_uz=MODEL_NAMES_UZ.get(r["code"], r["name_uz"]),
            category_name=r["category_name"],
            category_name_uz=r["category_name_uz"],
            category_id=r["category_id"],
            category_ids=list(r["category_ids"] or []),
            image_url=r["image_url"],
            category_images={str(k): v for k, v in (r["category_images"] or {}).items()},
            colors=sorted(r["colors"] or []),
            price_from=r["price_from"],
            price_to=r["price_to"],
            total_stock=int(r["total_stock"]),
        )

    target = cards.get(code)
    if not target:
        raise HTTPException(status_code=404, detail="Модель не найдена")

    all_cats = (await db.execute(select(Category))).scalars().all()
    parent_of = {c.id: c.parent_id for c in all_cats}

    # "Similar" = other models that share a parent category with any of this
    # model's own categories (e.g. GZ2 sits under Вертикальные/Горизонтальные
    # → every other radiator line filed under either branch counts as similar;
    # a decorative cast-iron radiator under a different branch doesn't).
    sibling_parents = {parent_of.get(cid) for cid in target.category_ids if parent_of.get(cid) is not None}
    sibling_leaves = {c.id for c in all_cats if c.parent_id in sibling_parents}
    similar = [
        c for cd, c in cards.items()
        if cd != code and any(cid in sibling_leaves for cid in c.category_ids)
    ]
    similar.sort(key=lambda c: (c.total_stock <= 0, c.code))

    # Product-specific accessories (only fit this exact radiator line).
    specific_codes: list[str] = []
    for cid in target.category_ids:
        for c in PRODUCT_SPECIFIC_COMPLEMENTS.get(cid, []):
            if c not in specific_codes:
                specific_codes.append(c)
    specific_complementary = [cards[c] for c in specific_codes if c in cards and c != code]

    # General pool (valve kits/thermostats that fit any ordinary radiator),
    # skipped entirely for lines that use incompatible fittings.
    general_complementary: list[ModelCardOut] = []
    if not (set(target.category_ids) & COMPLEMENTARY_GENERAL_EXCLUDE_LEAVES):
        roots = {_root_category_id(cid, parent_of) for cid in target.category_ids}
        comp_leaf_ids: set[int] = set()
        for root in roots:
            comp_leaf_ids.update(COMPLEMENTARY_ROOT_TO_LEAVES.get(root, []))
        general_complementary = [
            c for cd, c in cards.items()
            if cd != code
            and cd not in _SPECIFIC_ONLY_CODES
            and any(cid in comp_leaf_ids for cid in c.category_ids)
        ]
        general_complementary.sort(key=lambda c: (c.total_stock <= 0, c.code))

    complementary = specific_complementary + general_complementary

    return RelatedModelsOut(similar=similar[:8], complementary=complementary[:8])


@router.get("/{code}", response_model=ModelDetailOut)
async def get_model(code: str, db: AsyncSession = Depends(get_db)):
    products = await crud.get_model_detail(db, code)
    if not products:
        raise HTTPException(status_code=404, detail="Модель не найдена")

    color_images: dict = {}
    colors: set = set()
    sections_set: set = set()
    heights_set: set = set()
    conn_types_set: set = set()
    category_name: str | None = None
    category_name_uz: str | None = None
    description_ru: str | None = None
    description_uz: str | None = None
    # Fallback photo for variants that have none of their own — better to show
    # a different colour of the same model than a blank "no photo" tile.
    fallback_image = next((p.image_url for p in products if p.image_url), None)

    for p in products:
        if p.color:
            colors.add(p.color)
            if p.image_url:
                color_images.setdefault(p.color, p.image_url)
        if p.sections:
            sections_set.add(p.sections)
        if p.height_mm:
            heights_set.add(p.height_mm)
        if p.connection_type:
            conn_types_set.add(p.connection_type)
        if p.category and not category_name:
            category_name = p.category.name_ru
            category_name_uz = p.category.name_uz
        if p.description_ru and not description_ru:
            description_ru = p.description_ru
        if p.description_uz and not description_uz:
            description_uz = p.description_uz

    variants = [
        ModelVariantOut(
            id=p.id,
            sku=p.sku,
            slug=p.slug,
            name_ru=p.name_ru,
            name_uz=p.name_uz,
            color=p.color,
            sections=p.sections,
            height_mm=p.height_mm,
            columns_count=p.columns_count,
            connection_type=p.connection_type,
            category_id=p.category_id,
            power_w_dt50=p.power_w_dt50,
            power_w_dt64_5=p.power_w_dt64_5,
            power_w_fcu45=p.power_w_fcu45,
            power_w_fcu60=p.power_w_fcu60,
            power_w_electric=p.power_w_electric,
            price_uzs=p.price_uzs,
            stock=p.stock,
            image_url=p.image_url or fallback_image,
            images=[img.image_url for img in sorted(p.images, key=lambda i: i.sort_order)] or ([p.image_url] if p.image_url else ([fallback_image] if fallback_image else [])),
            description_ru=p.description_ru,
            description_uz=p.description_uz,
            weight=p.weight,
        )
        for p in products
    ]

    return ModelDetailOut(
        code=code,
        name_ru=MODEL_NAMES.get(code, products[0].name_ru),
        name_uz=MODEL_NAMES_UZ.get(code, products[0].name_uz),
        description_ru=description_ru,
        description_uz=description_uz,
        category_name=category_name,
        category_name_uz=category_name_uz,
        color_images=color_images,
        colors=sorted(colors),
        sections_available=sorted(sections_set),
        height_mm_available=sorted(heights_set),
        connection_types_available=sorted(conn_types_set),
        variants=variants,
    )
