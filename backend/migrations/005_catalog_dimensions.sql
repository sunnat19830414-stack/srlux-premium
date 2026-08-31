-- Dolibarr's own "width"/"height" fields (metres) are populated per-SKU and map
-- to the radiator's real physical width/depth (confirmed 2026-07-15 against the
-- H×W×D numbers already visible in Dolibarr product names, e.g. GZ2's
-- width=0.47 matches the "470" in "1800x470x70", JD3015's height=0.09 matches
-- the "90" in "1800x507x90") — just never synced into our schema before.
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS width_mm INTEGER,
    ADD COLUMN IF NOT EXISTS depth_mm INTEGER;
