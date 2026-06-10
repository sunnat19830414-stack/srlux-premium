from __future__ import annotations
import re
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    slug: str
    name_ru: str
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
    product_id: int = Field(..., gt=0)
    variant_id: Optional[int] = Field(None, gt=0)
    quantity: int = Field(1, gt=0, le=1000)


_PHONE_RE = re.compile(r"^\+?[\d\s\-()]{5,30}$")


class OrderIn(BaseModel):
    customer_name: str = Field(..., min_length=2, max_length=200)
    customer_phone: str = Field(..., min_length=5, max_length=30)
    customer_address: Optional[str] = Field(None, max_length=500)
    items: List[OrderItemIn] = Field(..., min_length=1, max_length=100)

    @field_validator("customer_phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not _PHONE_RE.match(v):
            raise ValueError("Некорректный номер телефона")
        return v


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


# ── Admin panel ────────────────────────────────────────────────────────────────

class AdminOrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    product_name_snapshot: str
    quantity: int
    unit_price_snapshot: Decimal


class AdminOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    order_number: str
    customer_name: str
    customer_phone: str
    customer_address: Optional[str]
    total_uzs: Decimal
    status: str
    created_at: datetime
    items: List[AdminOrderItemOut] = []


class AdminOrderListOut(BaseModel):
    total: int
    page: int
    limit: int
    orders: List[AdminOrderOut]


class OrderStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|processing|completed|cancelled)$")


class AdminProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sku: str
    name_ru: str
    price_uzs: Decimal
    stock: int
    is_active: bool
    image_url: Optional[str]
    category_id: Optional[int]
    parent_model: Optional[str]
    color: Optional[str]


class AdminProductListOut(BaseModel):
    total: int
    page: int
    limit: int
    products: List[AdminProductOut]


class ProductUpdateIn(BaseModel):
    name_ru: Optional[str] = Field(None, min_length=1, max_length=500)
    description_ru: Optional[str] = Field(None, max_length=10000)
    price_uzs: Optional[Decimal] = Field(None, gt=0)
    image_url: Optional[str] = Field(None, max_length=1000)
    is_active: Optional[bool] = None
    category_id: Optional[int] = Field(None, gt=0)


class AdminCategoryOut(BaseModel):
    id: int
    slug: str
    name_ru: str
    name_uz: str
    icon: str
    dolibarr_id: Optional[int]
    product_count: int


class CategoryCreateIn(BaseModel):
    name_ru: str = Field(..., min_length=1, max_length=500)
    name_uz: str = Field(..., min_length=1, max_length=500)
    icon: str = Field("Package", max_length=100)


class CategoryUpdateIn(BaseModel):
    name_ru: Optional[str] = Field(None, min_length=1, max_length=500)
    name_uz: Optional[str] = Field(None, min_length=1, max_length=500)
    icon: Optional[str] = Field(None, max_length=100)


class AdminStatsOut(BaseModel):
    total_orders: int
    orders_today: int
    orders_this_week: int
    total_revenue: Decimal
    total_products: int
    active_products: int
    total_categories: int
    pending_orders: int


class SyncStatusOut(BaseModel):
    running: bool
    last_run: Optional[str]
    last_result: Optional[str]
    last_success: bool
