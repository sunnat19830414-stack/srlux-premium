from datetime import datetime
import uuid

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, Numeric, String, Text,
)
from sqlalchemy.orm import backref, relationship

from database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(200), unique=True, nullable=False, index=True)
    name_ru = Column(String(500), nullable=False)
    name_uz = Column(String(500), nullable=False)
    icon = Column(String(100), default="Package")  # lucide-react icon name
    dolibarr_id = Column(Integer, unique=True, nullable=True)
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True, index=True)
    sort_order = Column(Integer, default=0, nullable=False)
    display_style = Column(String(50), default="grid", nullable=False)
    is_featured = Column(Boolean, default=False, nullable=False)

    products = relationship("Product", back_populates="category")
    children = relationship("Category", backref=backref("parent", remote_side=[id]))


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String(200), unique=True, nullable=False, index=True)
    slug = Column(String(500), unique=True, nullable=False, index=True)
    name_ru = Column(String(500), nullable=False)
    name_uz = Column(String(500), nullable=True)
    description_ru = Column(Text, nullable=True)
    description_uz = Column(Text, nullable=True)
    price_uzs = Column(Numeric(15, 2), nullable=False)
    price_usd = Column(Numeric(12, 2), nullable=True)
    stock = Column(Integer, default=0)
    weight = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    image_url = Column(String(1000), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    dolibarr_id = Column(Integer, unique=True, nullable=True, index=True)
    sort_order = Column(Integer, default=0, nullable=False)
    is_featured = Column(Boolean, default=False, nullable=False)
    image_manual = Column(Boolean, default=False, nullable=False)
    parent_model = Column(String(100), nullable=True, index=True)
    color = Column(String(50), nullable=True)
    height_mm = Column(Integer, nullable=True)
    width_mm = Column(Integer, nullable=True)
    depth_mm = Column(Integer, nullable=True)
    sections = Column(Integer, nullable=True)
    columns_count = Column(Integer, nullable=True)
    connection_type = Column(String(20), nullable=True)
    power_w_dt50 = Column(Integer, nullable=True)
    power_w_dt64_5 = Column(Integer, nullable=True)
    power_w_fcu45 = Column(Integer, nullable=True)
    power_w_fcu60 = Column(Integer, nullable=True)
    power_w_electric = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("Category", back_populates="products")
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")
    order_items = relationship("OrderItem", back_populates="product")
    images = relationship(
        "ProductImage", back_populates="product",
        cascade="all, delete-orphan", order_by="ProductImage.sort_order",
    )


class ProductImage(Base):
    """Additional gallery photos (angles/views) for a product, beyond the
    single primary `Product.image_url` cover image used in listings."""
    __tablename__ = "product_images"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    image_url = Column(String(1000), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product", back_populates="images")


class CatalogPhoto(Base):
    """Photo override used only by the PDF catalog generator (admin tool) —
    intentionally separate from Product.image_url/ProductImage so editing a
    catalog photo never changes what customers see on the live site."""
    __tablename__ = "catalog_photos"

    id = Column(Integer, primary_key=True, index=True)
    model_code = Column(String(100), nullable=False, index=True)
    image_url = Column(String(1000), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class CatalogSettings(Base):
    """Singleton row (id always 1) holding the PDF catalog's own branding."""
    __tablename__ = "catalog_settings"

    id = Column(Integer, primary_key=True, default=1)
    company_name = Column(String(200), nullable=False, default="SR Lux")
    catalog_title = Column(String(200), nullable=False, default="Каталог продукции")
    logo_url = Column(String(1000), nullable=True)


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    name_ru = Column(String(500), nullable=False)
    name_uz = Column(String(500), nullable=True)
    price_modifier = Column(Numeric(15, 2), default=0)

    product = relationship("Product", back_populates="variants")


class Currency(Base):
    __tablename__ = "currencies"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), unique=True, nullable=False)
    rate_to_uzs = Column(Numeric(15, 4), nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(50), unique=True, nullable=False, index=True)
    customer_name = Column(String(500), nullable=False)
    customer_phone = Column(String(50), nullable=False)
    customer_address = Column(Text, nullable=True)
    # Optional — only collected so we can trigger the Google Customer
    # Reviews opt-in survey on the confirmation screen; checkout stays
    # phone/WhatsApp-first, so this is never required.
    customer_email = Column(String(255), nullable=True)
    total_uzs = Column(Numeric(15, 2), nullable=False)
    status = Column(String(50), default="pending")
    project_file_url = Column(String(500), nullable=True)
    project_file_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    unit_price_snapshot = Column(Numeric(15, 2), nullable=False)
    product_name_snapshot = Column(String(500), nullable=False)
    custom_ral_note = Column(String(300), nullable=True)

    order = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")
