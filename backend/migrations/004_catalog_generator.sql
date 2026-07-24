-- Migration 004: PDF catalog generator (admin tool) — retail USD price,
-- catalog-only photo overrides, catalog branding settings.
-- Apply: docker exec -i srlux-postgres psql -U srlux -d srlux_premium < backend/migrations/004_catalog_generator.sql

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS price_usd NUMERIC(12,2);

CREATE TABLE IF NOT EXISTS catalog_photos (
    id SERIAL PRIMARY KEY,
    model_code VARCHAR(100) NOT NULL,
    image_url VARCHAR(1000) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_catalog_photos_model_code ON catalog_photos(model_code);

CREATE TABLE IF NOT EXISTS catalog_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    company_name VARCHAR(200) NOT NULL DEFAULT 'SR Lux',
    catalog_title VARCHAR(200) NOT NULL DEFAULT 'Каталог продукции',
    logo_url VARCHAR(1000),
    CONSTRAINT catalog_settings_singleton CHECK (id = 1)
);
INSERT INTO catalog_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
