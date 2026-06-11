from datetime import datetime
import uuid

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, Numeric, String, Text,
)
from sqlalchemy.orm import relationship

from database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(200), unique=True, nullable=False, index=True)
    name_ru = Column(String(500), nullable=False)
    name_uz = Column(String(500), nullable=False)
    icon = Column(String(100), default="Package")  # lucide-react icon name
    dolibarr_id = Column(Integer, unique=True, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    display_style = Column(String(50), default="grid", nullable=False)
    is_featured = Column(Boolean, default=False, nullable=False)

    products = relationship("Product", back_populates="category")


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
    sections = Column(Integer, nullable=True)
    columns_count = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("Category", back_populates="products")
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")
    order_items = relationship("OrderItem", back_populates="product")


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
    total_uzs = Column(Numeric(15, 2), nullable=False)
    status = Column(String(50), default="pending")
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

    order = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")
