"""
populate_variants.py — fill parent_model, color, sections, height_mm
from existing SKU patterns and image_url.

Apply DB migration first:
  docker exec -i srlux-postgres psql -U srlux -d srlux_premium \
    < backend/migrations/001_add_variant_fields.sql

Then run inside the API container:
  docker exec srlux-api python /app/tools/populate_variants.py

Or locally with DATABASE_URL env:
  DATABASE_URL="postgresql://srlux:PASSWORD@localhost:5432/srlux_premium" \
    python tools/populate_variants.py
"""

import asyncio
import os
import re
import sys

import asyncpg

# ── SKU prefix → canonical model code ─────────────────────────────────────────
# Longer / more specific prefixes must come first
MODEL_PREFIXES: list[tuple[str, str]] = [
    ("JD3015",   "JD3015"),
    ("ED12",     "JD3015"),
    ("JD3030",   "JD3030"),
    ("ND11",     "JD3030"),
    ("JD5025",   "JD5025"),
    ("WLD11",    "WLD11"),
    ("JD6812",   "JD6812"),
    ("JD68",     "JD6812"),
    ("VD12",     "JD6812"),
    ("GLF7575A", "GLF7575A"),
    ("JDGL6",    "GLF7575A"),
    ("GZ2",      "GZ2"),
    ("G2T",      "GZ2"),
    ("GZ3",      "GZ3"),
    ("G3T",      "GZ3"),
    ("GZ4",      "GZ4"),
    ("G4T",      "GZ4"),
    ("JDC22",    "JDC22"),
    ("NCR03",    "NCR03"),
    ("BZV3",     "BZV3"),
    ("BZ",       "BZ"),
    ("MAR660",   "MAR660"),
    ("AM65",     "AM65"),
    ("CM",       "CM"),
    ("GM",       "GM"),
    ("UC",       "UC"),
    ("HY",       "HY"),
]

COLOR_KEYWORDS: dict[str, list[str]] = {
    "white":      ["white", "_w_", "-w-", "_wd_", "-wd-", "_w.", "-w."],
    "anthracite": ["anthracit", "_ad_", "-ad-", "_a_", "-a-"],
    "black":      ["black", "noir", "_bd_", "-bd-", "_b_", "-b-"],
    "gold":       ["gold", "gld"],
    "chrome":     ["chrome", "chr"],
}

KNOWN_HEIGHTS = {300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1500, 1800, 2000}


def extract_parent_model(sku: str) -> str | None:
    su = sku.upper()
    for prefix, model in MODEL_PREFIXES:
        if su.startswith(prefix.upper()):
            return model
    return None


def extract_color(sku: str, image_url: str | None) -> str | None:
    # image_url is manually verified — prefer it
    if image_url:
        url = image_url.lower()
        for color, kws in COLOR_KEYWORDS.items():
            if any(kw in url for kw in kws):
                return color
    sl = sku.lower()
    for color, kws in COLOR_KEYWORDS.items():
        if any(kw in sl for kw in kws):
            return color
    return None


def extract_sections(sku: str, name_ru: str | None) -> int | None:
    for n in reversed(re.findall(r'\d+', sku)):
        v = int(n)
        if 4 <= v <= 30:
            return v
    if name_ru:
        m = re.search(r'(\d+)\s*сек', name_ru.lower())
        if m:
            return int(m.group(1))
    return None


def extract_height_mm(sku: str, name_ru: str | None) -> int | None:
    for n in re.findall(r'\d+', sku):
        v = int(n)
        if v in KNOWN_HEIGHTS:
            return v
    if name_ru:
        m = re.search(r'[Hh]?\s*(\d{3,4})\s*(мм|mm)', name_ru)
        if m:
            v = int(m.group(1))
            if v in KNOWN_HEIGHTS:
                return v
    return None


def build_dsn() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        print("ERROR: DATABASE_URL is not set", file=sys.stderr)
        sys.exit(1)
    # asyncpg uses postgresql:// not postgresql+asyncpg://
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def main():
    dsn = build_dsn()
    conn = await asyncpg.connect(dsn)

    rows = await conn.fetch(
        "SELECT id, sku, name_ru, image_url FROM products WHERE is_active = true"
    )
    print(f"Products fetched: {len(rows)}")

    updates = []
    skipped = []
    for r in rows:
        pid, sku, name_ru, image_url = r["id"], r["sku"], r["name_ru"], r["image_url"]
        parent_model = extract_parent_model(sku)
        if not parent_model:
            skipped.append(sku)
            continue
        color     = extract_color(sku, image_url)
        sections  = extract_sections(sku, name_ru)
        height_mm = extract_height_mm(sku, name_ru)
        updates.append((parent_model, color, sections, height_mm, pid))

    await conn.executemany(
        """
        UPDATE products
           SET parent_model = $1,
               color        = $2,
               sections     = $3,
               height_mm    = $4
         WHERE id = $5
        """,
        updates,
    )
    await conn.close()

    print(f"Updated : {len(updates)}")
    print(f"Skipped : {len(skipped)}")
    if skipped:
        print("No model prefix matched:")
        for s in skipped[:20]:
            print(f"  {s}")


asyncio.run(main())
