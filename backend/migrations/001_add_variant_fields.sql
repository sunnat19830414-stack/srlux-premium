-- Migration 001: add variant fields to products table
-- Apply: docker exec -i srlux-postgres psql -U srlux -d srlux_premium < backend/migrations/001_add_variant_fields.sql

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS parent_model VARCHAR(100),
  ADD COLUMN IF NOT EXISTS color        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS height_mm    INTEGER,
  ADD COLUMN IF NOT EXISTS sections     INTEGER,
  ADD COLUMN IF NOT EXISTS columns_count INTEGER;

CREATE INDEX IF NOT EXISTS ix_products_parent_model ON products(parent_model);
CREATE INDEX IF NOT EXISTS ix_products_color        ON products(color);
