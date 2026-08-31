-- Migration 003: track manually uploaded product images
-- Apply: docker exec -i srlux-postgres psql -U srlux -d srlux_premium < backend/migrations/003_product_image_manual.sql

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS image_manual BOOLEAN NOT NULL DEFAULT FALSE;
