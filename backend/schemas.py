from __future__ import annotations
from decimal import Decimal
from typing import Dict, List, Optional
from pydantic import BaseModel, ConfigDict


# ── Category ──────────────────────────────────────────────────────────────────

class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name_ru: str
    name_uz: str
    icon: str


# ── Product Variant ────────────────────────────────────────────────────────────

class VariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name_ru: str
    name_uz: Optional[str]
    price_modifier: Decimal


# ── Product ────────────────────────────────────────────────────────────────────

class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku: str
    slug: str
    name_ru: str
    name_uz: Optional[str]
    description_ru: Optional[str]
    description_uz: Optional[str]
    price_uzs: Decimal
    stock: int
    weight: Optional[float]
    image_url: Optional[str]
    category: Optional[CategoryOut]
    variants: List[VariantOut] = []


class ProductListOut(BaseModel):
    total: int
    page: int
    limit: int
    products: List[ProductOut]


# ── Model cards (Variant 1 catalog) ───────────────────────────────────────────

class ModelVariantOut(BaseModel):
    id: int
    sku: str
    color: Optional[str]
    sections: Optional[int]
    height_mm: Optional[int]
    columns_count: Optional[int]
    price_uzs: Decimal
    stock: int
    image_url: Optional[str]


class ModelCardOut(BaseModel):
    code: str
    name_ru: str
    category_name: Optional[str]
    image_url: Optional[str]
    colors: List[str]
    price_from: Decimal
    price_to: Decimal
    total_stock: int


class ModelDetailOut(BaseModel):
    code: str
    name_ru: str
    description_ru: Optional[str]
    category_name: Optional[str]
    color_images: Dict[str, Optional[str]]
    colors: List[str]
    sections_available: List[int]
    height_mm_available: List[int]
    variants: List[ModelVariantOut]


class ModelListOut(BaseModel):
    total: int
    models: List[ModelCardOut]


# ── Admin bulk import — categories ────────────────────────────────────────────

class CategoryBulkItem(BaseModel):
    dolibarr_id: int
    name_ru: str
    name_uz: Optional[str] = None
    icon: Optional[str] = None


class BulkCategoriesIn(BaseModel):
    categories: List[CategoryBulkItem]


class BulkCategoriesOut(BaseModel):
    upserted: int


# ── Admin bulk import — products ───────────────────────────────────────────────

class ProductBulkItem(BaseModel):
    dolibarr_id: int
    sku: str
    name_ru: str
    name_uz: Optional[str] = None
    description_ru: Optional[str] = None
    description_uz: Optional[str] = None
    price_uzs: Decimal
    stock: int = 0
    weight: Optional[float] = None
    image_url: Optional[str] = None
    is_active: bool = True
    category_dolibarr_id: Optional[int] = None
    category_name_ru: Optional[str] = None
    category_name_uz: Optional[str] = None


class BulkImportIn(BaseModel):
    products: List[ProductBulkItem]


class BulkImportOut(BaseModel):
    upserted: int
    skipped: int


# ── Orders ─────────────────────────────────────────────────────────────────────

class OrderItemIn(BaseModel):
    product_id: int
    variant_id: Optional[int] = None
    quantity: int = 1


class OrderIn(BaseModel):
    customer_name: str
    customer_phone: str
    customer_address: Optional[str] = None
    items: List[OrderItemIn]


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_name_snapshot: str
    quantity: int
    unit_price_snapshot: Decimal


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_number: str
    customer_name: str
    customer_phone: str
    total_uzs: Decimal
    status: str
    items: List[OrderItemOut] = []
