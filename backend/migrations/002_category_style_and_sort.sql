-- Migration 002: category display styles, sort order, featured flags
-- Apply: docker exec -i srlux-postgres psql -U srlux -d srlux_premium < backend/migrations/002_category_style_and_sort.sql

ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS sort_order    INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS display_style VARCHAR(50)  NOT NULL DEFAULT 'grid',
    ADD COLUMN IF NOT EXISTS is_featured   BOOLEAN      NOT NULL DEFAULT FALSE;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS sort_order  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed category sort_order from current alphabetical order
UPDATE categories
SET sort_order = sub.rn
FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY name_ru) - 1 AS rn FROM categories
) sub
WHERE categories.id = sub.id;

CREATE INDEX IF NOT EXISTS ix_categories_sort_order ON categories(sort_order);
CREATE INDEX IF NOT EXISTS ix_products_sort_order   ON products(sort_order);
