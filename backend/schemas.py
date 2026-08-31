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
    sort_order: int
    parent_id: Optional[int] = None


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
    images: List[str] = []
    category: Optional[CategoryOut]
    variants: List[VariantOut] = []

    @field_validator("images", mode="before")
    @classmethod
    def _image_urls(cls, v):
        """Accepts either the raw ProductImage ORM relationship (from_attributes
        path) or an already-plain list of URL strings."""
        if v and not isinstance(v[0], str):
            return [img.image_url for img in v]
        return v or []


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
    name_uz: Optional[str] = None
    color: Optional[str]
    sections: Optional[int]
    height_mm: Optional[int]
    columns_count: Optional[int]
    connection_type: Optional[str] = None
    category_id: Optional[int] = None
    power_w_dt50: Optional[int] = None
    power_w_dt64_5: Optional[int] = None
    power_w_fcu45: Optional[int] = None
    power_w_fcu60: Optional[int] = None
    power_w_electric: Optional[int] = None
    price_uzs: Decimal
    stock: int
    image_url: Optional[str]
    images: List[str] = []
    description_ru: Optional[str] = None
    description_uz: Optional[str] = None
    weight: Optional[float] = None


class ModelCardOut(BaseModel):
    code: str
    name_ru: str
    name_uz: Optional[str] = None
    category_name: Optional[str]
    category_name_uz: Optional[str] = None
    category_id: Optional[int]
    category_ids: List[int] = []
    image_url: Optional[str]
    category_images: Dict[str, str] = {}
    colors: List[str]
    price_from: Decimal
    price_to: Decimal
    total_stock: int


class RelatedModelsOut(BaseModel):
    similar: List[ModelCardOut] = []
    complementary: List[ModelCardOut] = []


class ModelDetailOut(BaseModel):
    code: str
    name_ru: str
    name_uz: Optional[str] = None
    description_ru: Optional[str]
    description_uz: Optional[str] = None
    category_name: Optional[str]
    category_name_uz: Optional[str] = None
    color_images: Dict[str, Optional[str]]
    colors: List[str]
    sections_available: List[int]
    height_mm_available: List[int]
    connection_types_available: List[str] = []
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
    parent_dolibarr_id: Optional[int] = None


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
    price_usd: Optional[float] = None
    stock: int = 0
    weight: Optional[float] = None
    width_mm: Optional[int] = None
    depth_mm: Optional[int] = None
    image_url: Optional[str] = None
    images: List[str] = []
    is_active: bool = True
    category_dolibarr_id: Optional[int] = None
    category_name_ru: Optional[str] = None
    category_name_uz: Optional[str] = None
    parent_model: Optional[str] = None


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
    custom_ral_note: Optional[str] = Field(None, max_length=300)


_PHONE_RE = re.compile(r"^\+?[\d\s\-()]{5,30}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class OrderIn(BaseModel):
    customer_name: str = Field(..., min_length=2, max_length=200)
    customer_phone: str = Field(..., min_length=5, max_length=30)
    customer_address: Optional[str] = Field(None, max_length=500)
    # Optional — only used to trigger the Google Customer Reviews opt-in
    # survey after checkout; never required to place an order.
    customer_email: Optional[str] = Field(None, max_length=255)
    items: List[OrderItemIn] = Field(..., min_length=1, max_length=100)
    project_file_url: Optional[str] = Field(None, max_length=500)
    project_file_name: Optional[str] = Field(None, max_length=255)

    @field_validator("customer_phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not _PHONE_RE.match(v):
            raise ValueError("Некорректный номер телефона")
        return v

    @field_validator("customer_email")
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v and not _EMAIL_RE.match(v):
            raise ValueError("Некорректный email")
        return v


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_name_snapshot: str
    quantity: int
    unit_price_snapshot: Decimal
    custom_ral_note: Optional[str] = None


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_number: str
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = None
    total_uzs: Decimal
    status: str
    project_file_url: Optional[str] = None
    project_file_name: Optional[str] = None
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
    customer_email: Optional[str] = None
    total_uzs: Decimal
    status: str
    created_at: datetime
    items: List[AdminOrderItemOut] = []


class OrderStatusCounts(BaseModel):
    pending: int = 0
    processing: int = 0
    completed: int = 0
    cancelled: int = 0
    total: int = 0


class AdminOrderListOut(BaseModel):
    total: int
    page: int
    limit: int
    orders: List[AdminOrderOut]
    counts: OrderStatusCounts = OrderStatusCounts()


class OrderStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|processing|completed|cancelled)$")


class ProductPhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    image_url: str
    sort_order: int


class AdminProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sku: str
    name_ru: str
    price_uzs: Decimal
    stock: int
    is_active: bool
    is_featured: bool = False
    sort_order: int = 0
    image_url: Optional[str]
    images: List[ProductPhotoOut] = []
    category_id: Optional[int]
    parent_model: Optional[str]
    color: Optional[str]


class AdminProductListOut(BaseModel):
    total: int
    page: int
    limit: int
    products: List[AdminProductOut]


class ProductCreateIn(BaseModel):
    sku: str = Field(..., min_length=1, max_length=200)
    name_ru: str = Field(..., min_length=1, max_length=500)
    name_uz: Optional[str] = Field(None, max_length=500)
    description_ru: Optional[str] = Field(None, max_length=10000)
    description_uz: Optional[str] = Field(None, max_length=10000)
    price_uzs: Decimal = Field(..., gt=0)
    stock: int = Field(0, ge=0)
    category_id: Optional[int] = Field(None, gt=0)
    is_active: bool = True


class ProductUpdateIn(BaseModel):
    name_ru: Optional[str] = Field(None, min_length=1, max_length=500)
    description_ru: Optional[str] = Field(None, max_length=10000)
    price_uzs: Optional[Decimal] = Field(None, gt=0)
    image_url: Optional[str] = Field(None, max_length=1000)
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
    sort_order: Optional[int] = Field(None, ge=0)
    category_id: Optional[int] = Field(None, gt=0)


class AdminCategoryOut(BaseModel):
    id: int
    slug: str
    name_ru: str
    name_uz: str
    icon: str
    dolibarr_id: Optional[int]
    product_count: int
    sort_order: int = 0
    display_style: str = "grid"
    is_featured: bool = False


class CategoryCreateIn(BaseModel):
    name_ru: str = Field(..., min_length=1, max_length=500)
    name_uz: str = Field(..., min_length=1, max_length=500)
    icon: str = Field("Package", max_length=100)
    display_style: str = Field("grid", pattern="^(grid|large-grid|list|featured)$")
    is_featured: bool = False
    sort_order: int = Field(0, ge=0)


class CategoryUpdateIn(BaseModel):
    name_ru: Optional[str] = Field(None, min_length=1, max_length=500)
    name_uz: Optional[str] = Field(None, min_length=1, max_length=500)
    icon: Optional[str] = Field(None, max_length=100)
    display_style: Optional[str] = Field(None, pattern="^(grid|large-grid|list|featured)$")
    is_featured: Optional[bool] = None
    sort_order: Optional[int] = Field(None, ge=0)


class RecentOrderMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    order_number: str
    customer_name: str
    total_uzs: Decimal
    status: str
    created_at: datetime


class LowStockProduct(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sku: str
    name_ru: str
    stock: int


class AdminStatsOut(BaseModel):
    total_orders: int
    orders_today: int
    orders_this_week: int
    total_revenue: Decimal
    total_products: int
    active_products: int
    total_categories: int
    pending_orders: int
    recent_orders: List[RecentOrderMini] = []
    low_stock_products: List[LowStockProduct] = []


class SyncStatusOut(BaseModel):
    running: bool
    last_run: Optional[str]
    last_result: Optional[str]
    last_success: bool


# ── Catalog PDF generator (admin-only) ─────────────────────────────────────────

class CatalogPhotoOut(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    id: int
    model_code: str
    image_url: str
    sort_order: int


class CatalogVariantOut(BaseModel):
    height_mm: Optional[int] = None
    sections: Optional[int] = None
    prices: List[float] = []
    weights: List[float] = []
    powers: List[int] = []
    widths: List[int] = []
    depths: List[int] = []
    colors: List[str] = []
    category_id: Optional[int] = None


class CatalogModelOut(BaseModel):
    code: str
    name_ru: str
    description_ru: Optional[str] = None
    category_name: Optional[str]
    category_id: Optional[int]
    category_ids: List[int] = []
    colors: List[str] = []
    sections_list: List[int] = []
    height_mm_list: List[int] = []
    image_url: Optional[str]
    price_usd_from: Optional[Decimal] = None
    price_usd_to: Optional[Decimal] = None
    photos: List[CatalogPhotoOut] = []
    variants: List[CatalogVariantOut] = []


class CatalogModelListOut(BaseModel):
    total: int
    models: List[CatalogModelOut]


class CatalogSettingsOut(BaseModel):
    company_name: str
    catalog_title: str
    logo_url: Optional[str] = None


class CatalogSettingsUpdateIn(BaseModel):
    company_name: Optional[str] = Field(None, min_length=1, max_length=200)
    catalog_title: Optional[str] = Field(None, min_length=1, max_length=200)


class CurrencyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    code: str
    rate_to_uzs: Decimal


class CurrencyUpdateIn(BaseModel):
    rate_to_uzs: Decimal = Field(..., gt=0)


class CatalogGenerateIn(BaseModel):
    category_ids: Optional[List[int]] = None
    cards_per_row: int = Field(2, ge=1, le=4)
