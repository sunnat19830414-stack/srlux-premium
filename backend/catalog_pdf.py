"""
PDF catalog rendering for the admin Catalog Generator tool.

Ported from the one-off prototype `generate_catalog_site.py` (approved design:
dark gold/anthracite cover, sections grouped by root category, card = photo +
article + name + colors/sizes + price). The prototype fetched everything over
HTTP from the live site; this version reads directly from the local DB/disk
(faster, and doesn't depend on the site being reachable from inside the api
container) and uses the retail USD price + catalog-only photo overrides
instead of the site's own UZS price / customer-facing photos.
"""

import base64
import datetime
import html
import io
import re
from pathlib import Path

from playwright.async_api import async_playwright
from PIL import Image

UPLOADS_DIR = Path("/app/uploads")
FONTS_DIR = Path("/app/fonts")  # copied into the image at build time — see Dockerfile
PHOTO_MAX_SIDE = 700
PHOTO_QUALITY = 78

COLOR_NAMES = {
    "white": "белый", "black": "чёрный", "anthracite": "антрацит", "raw": "грунт",
    "silver": "серебристый", "gold": "золото", "chrome": "хром", "bronze": "бронза",
    "gray": "серый", "grey": "серый",
}


def _static_path_to_disk(image_url: str) -> Path | None:
    if not image_url or not image_url.startswith("/static/uploads/"):
        return None
    return UPLOADS_DIR / image_url.removeprefix("/static/uploads/")


def _load_photo_b64(image_url: str | None) -> str | None:
    path = _static_path_to_disk(image_url) if image_url else None
    if not path or not path.exists():
        return None
    try:
        im = Image.open(path)
        if im.mode in ("RGBA", "P", "LA"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert("RGB")
        w, h = im.size
        if max(w, h) > PHOTO_MAX_SIDE:
            scale = PHOTO_MAX_SIDE / max(w, h)
            im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        out = io.BytesIO()
        im.save(out, "JPEG", quality=PHOTO_QUALITY, optimize=True)
        return base64.b64encode(out.getvalue()).decode("ascii")
    except Exception:
        return None


def _load_logo_b64(logo_url: str | None) -> tuple[str, str] | None:
    """Returns (base64, mime) for the cover-page logo, or None."""
    path = _static_path_to_disk(logo_url) if logo_url else None
    if not path or not path.exists():
        return None
    try:
        im = Image.open(path)
        im.thumbnail((600, 600), Image.LANCZOS)
        out = io.BytesIO()
        if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
            im.convert("RGBA").save(out, "PNG", optimize=True)
            mime = "image/png"
        else:
            im.convert("RGB").save(out, "JPEG", quality=90, optimize=True)
            mime = "image/jpeg"
        return base64.b64encode(out.getvalue()).decode("ascii"), mime
    except Exception:
        return None


def _load_font_b64(name: str) -> str:
    with open(FONTS_DIR / name, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


# Dolibarr's own description text is generated per-SKU and always opens with
# a line naming that one variant's own dimensions — e.g. "Стальной трубчатый
# радиатор Column 2 (1500×560)" — even though the model card sits above a
# table already listing every real height/width combination the model comes
# in. Left in place, the printed description reads as if it only describes
# that one arbitrary variant instead of the whole model. Strip that opening
# clause (mirrors _clean_model_name's stripping of the same per-SKU
# dimension blob from the title) so what's left is the actual general
# description paragraph that follows it.
_LEADING_DIMENSION_BLURB_RE = re.compile(
    r"^Стальной трубчатый радиатор[^(]*\([^)]*\)\s*", re.IGNORECASE,
)


def clean_description(raw: str | None) -> str:
    if not raw:
        return ""
    text = re.sub(r"(?i)<br\s*/?>", "\n", raw)
    text = re.sub(r"(?i)</p\s*>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s*\n\s*", " ", text).strip()
    text = _LEADING_DIMENSION_BLURB_RE.sub("", text).strip()
    return text


def fmt_colors(colors: list) -> str:
    if not colors:
        return ""
    names = [COLOR_NAMES.get(c, c) for c in colors]
    return "Цвета: " + ", ".join(names)


def fmt_sizes(sections_list: list, height_mm_list: list) -> str:
    parts = []
    if height_mm_list:
        parts.append(f"{min(height_mm_list)}–{max(height_mm_list)} мм" if len(height_mm_list) > 1 else f"{height_mm_list[0]} мм")
    if sections_list:
        parts.append(f"{min(sections_list)}–{max(sections_list)} секций" if len(sections_list) > 1 else f"{sections_list[0]} секций")
    return " · ".join(parts)


# Trailing colour word inherited from the one arbitrary variant whose name
# got picked to represent the whole model (see _clean_model_name) — e.g.
# "Column 2 Anthracite" for a model that's also sold in white/black/raw.
# The variants table's own "Цвета" column already lists every colour the
# model actually comes in, so this word is not just redundant but wrong
# (names one colour as if it were the only one) — confirmed 2026-07-15.
_TRAILING_COLOR_RE = re.compile(
    r"\s+(Anthracite|White|Black|Gold|Silver|Chrome|Bronze|Grey|Gray|"
    r"антрацит|белый|белая|чёрный|чёрная|золото|золотой|золотая|"
    r"серебристый|серебристая|хром|бронза|серый|серая|грунт)\s*$",
    re.IGNORECASE,
)


def _clean_model_name(name: str) -> str:
    """
    The grouped model's displayed name is picked (MIN(name_ru)) from among
    all its size/colour variant rows, so it inherits one arbitrary variant's
    own numbers and colour baked into the Dolibarr product name — e.g. GZ2
    showed "...Anthracite (нижн.)1800x470x70" even though the model spans
    heights 300-1800mm and comes in 4 colours (confirmed 2026-07-15). Strip
    the unambiguous 3-number "HxWxD"-style physical-dimension blob, its
    adjacent connection-type note, and a trailing colour word; leave genuine
    2-number profile codes alone (e.g. "Rect 30x15" is a real part of that
    model's name, not a per-SKU dimension).
    """
    cleaned = re.sub(r"\(нижн\.?(?:\s*подкл\.?)?\)", "", name)
    cleaned = re.sub(r"\d+\s*[x×]\s*\d+\s*[x×]\s*\d+", "", cleaned)
    cleaned = _TRAILING_COLOR_RE.sub("", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" -")
    return cleaned or name


def _build_orientation_map(categories: list) -> dict[int, str]:
    """category_id -> 'Вертикальные'/'Горизонтальные' for any category whose
    ancestor chain includes one of those two labels (e.g. SR Lux's steel
    radiator tree splits "Column"-series models into vertical/horizontal
    branches under the same model code — GZ2/GZ3 confirmed 2026-07-15)."""
    by_id = {c.id: c for c in categories}
    labels = {"Вертикальные", "Горизонтальные"}
    result: dict[int, str] = {}
    for c in categories:
        cur = c
        seen: set = set()
        while cur is not None and cur.id not in seen:
            seen.add(cur.id)
            if cur.name_ru in labels:
                result[c.id] = cur.name_ru
                break
            cur = by_id.get(cur.parent_id) if cur.parent_id else None
    return result


def _fmt_range(values: list, fmt: str = "{:g}") -> str:
    """A single value, or 'min–max' if the merged row actually spans more
    than one distinct value (e.g. a painted vs an unpainted SKU at the same
    height/sections can have different weights — see crud.get_catalog_models)."""
    vals = sorted(set(values))
    if not vals:
        return "—"
    if len(vals) == 1:
        return fmt.format(vals[0])
    return f"{fmt.format(vals[0])}–{fmt.format(vals[-1])}"


# Same (height_mm, sections, category_id) row is sometimes fed by two
# independently-priced Dolibarr SKUs — e.g. a legacy code and its later
# replacement — that are the same real retail price and differ only by a
# few cents of currency-conversion rounding (confirmed: colour never
# actually changes price on this data, per crud.get_catalog_models). Below
# this threshold that's rounding noise, not a real second price the printed
# catalog needs to explain — show the lower one plainly instead of a
# "341.18–341.19"-style range with no way for a reader to know why.
_PRICE_NOISE_THRESHOLD_USD = 1.0


def _fmt_price_range(values: list) -> str:
    vals = sorted(set(values))
    if not vals:
        return "—"
    if len(vals) == 1 or (vals[-1] - vals[0]) < _PRICE_NOISE_THRESHOLD_USD:
        return f"{vals[0]:,.2f}"
    return f"{vals[0]:,.2f}–{vals[-1]:,.2f}"


def _variants_table_html(variants: list) -> str:
    has_height = any(v.get("height_mm") for v in variants)
    has_width = any(v.get("widths") for v in variants)
    has_depth = any(v.get("depths") for v in variants)
    has_sections = any(v.get("sections") for v in variants)
    has_weight = any(v.get("weights") for v in variants)
    has_power = any(v.get("powers") for v in variants)
    has_colors = any(v.get("colors") for v in variants)
    headers = []
    if has_height:
        headers.append("В, мм")
    if has_width:
        headers.append("Ш, мм")
    if has_depth:
        headers.append("Г, мм")
    if has_sections:
        headers.append("Секции")
    if has_weight:
        headers.append("Вес, кг")
    if has_power:
        headers.append("Вт")
    if has_colors:
        headers.append("Цвета")
    headers.append("USD")
    rows = []
    for v in variants:
        cells = []
        if has_height:
            cells.append(f"<td>{v['height_mm']}</td>" if v.get("height_mm") else "<td>—</td>")
        if has_width:
            cells.append(f"<td>{_fmt_range(v.get('widths') or [], '{:d}')}</td>")
        if has_depth:
            cells.append(f"<td>{_fmt_range(v.get('depths') or [], '{:d}')}</td>")
        if has_sections:
            cells.append(f"<td>{v['sections']}</td>" if v.get("sections") else "<td>—</td>")
        if has_weight:
            cells.append(f"<td>{_fmt_range(v.get('weights') or [])}</td>")
        if has_power:
            cells.append(f"<td>{_fmt_range(v.get('powers') or [], '{:d}')}</td>")
        if has_colors:
            names = [html.escape(COLOR_NAMES.get(c, c)) for c in (v.get("colors") or [])]
            cells.append(f"<td>{', '.join(names)}</td>" if names else "<td>—</td>")
        cells.append(f'<td class="price">{_fmt_price_range(v.get("prices") or [])}</td>')
        rows.append(f"<tr>{''.join(cells)}</tr>")
    thead = "".join(f'<th class="price">{h}</th>' if h == "USD" else f"<th>{h}</th>" for h in headers)
    return (
        '<table class="variants-table"><thead><tr>' + thead + "</tr></thead>"
        "<tbody>" + "".join(rows) + "</tbody></table>"
    )


def _build_variants_table_html(variants: list, orientation_map: dict) -> str:
    """
    Per-size price breakdown, shown under the photo for models with more
    than one real (height, sections, category) combination — colour doesn't
    change price/weight/power on this data, so a model that only varies by
    colour still gets the single price line instead of a redundant one-row
    table. Models whose variants span both a vertical and a horizontal
    category branch (e.g. GZ2/GZ3) get two labelled tables instead of one
    mixed table, since the sizes aren't comparable across orientations.
    """
    if len(variants) < 2:
        return ""
    orientations = [orientation_map.get(v.get("category_id")) for v in variants]
    distinct = {o for o in orientations if o}
    if len(distinct) < 2:
        return _variants_table_html(variants)
    parts = []
    for label in ("Вертикальные", "Горизонтальные"):
        group = [v for v, o in zip(variants, orientations) if o == label]
        if not group:
            continue
        parts.append(f'<div class="variants-group-label">{label}</div>')
        parts.append(_variants_table_html(group))
    return "".join(parts)


def fmt_price(m: dict) -> str:
    lo = float(m.get("price_usd_from") or 0)
    hi = float(m.get("price_usd_to") or 0)
    if lo <= 0:
        return '<span class="price tbd">цена по запросу</span>'
    def f(v):
        return f"{v:,.2f}"
    txt = f"от {f(lo)}" if hi > lo else f(lo)
    return f'<span class="price">{txt}</span><span class="currency">USD</span>'


def _build_root_map(categories: list) -> dict[int, dict]:
    by_id = {c.id: c for c in categories}

    def root_of(cid):
        cur = by_id.get(cid)
        seen = set()
        while cur and cur.parent_id and cur.parent_id not in seen:
            seen.add(cur.id)
            nxt = by_id.get(cur.parent_id)
            if not nxt:
                break
            cur = nxt
        return cur

    result = {}
    for c in categories:
        r = root_of(c.id)
        if r:
            result[c.id] = r
    return result


FONT_FACES = """
@font-face { font-family:'Inter'; font-weight:300 800; font-display:swap;
  src:url(data:font/woff2;base64,%(cyrillic_ext)s) format('woff2');
  unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F; }
@font-face { font-family:'Inter'; font-weight:300 800; font-display:swap;
  src:url(data:font/woff2;base64,%(cyrillic)s) format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family:'Inter'; font-weight:300 800; font-display:swap;
  src:url(data:font/woff2;base64,%(latin_ext)s) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family:'Inter'; font-weight:300 800; font-display:swap;
  src:url(data:font/woff2;base64,%(latin)s) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
"""

CSS = """
:root { --gold:#D4AF37; --gold-600:#B8960C; --gold-700:#8B6914; --ink:#17130c;
  --ink-soft:#5b5346; --line:#e7e0d1; --paper:#fffdf8; }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; font-family:'Inter',system-ui,sans-serif;
  color:var(--ink); background:var(--paper); -webkit-font-smoothing:antialiased; }
.cover { width:210mm; height:285mm;
  background: linear-gradient(165deg, #0a0a0a 0%, #171310 55%, #0a0a0a 100%);
  color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center;
  position:relative; overflow:hidden; }
.cover .fins { position:absolute; inset:0; display:flex; justify-content:space-evenly; opacity:.05; }
.cover .fins span { width:3mm; background:var(--gold); height:100%; }
.cover .logo { max-width:220px; max-height:120px; margin-bottom:24px; z-index:1; }
.cover .eyebrow { letter-spacing:.35em; text-transform:uppercase; font-size:11px;
  color:var(--gold); font-weight:600; margin-bottom:22px; z-index:1; }
/* Solid gold, not a background-clip:text gradient — the system Chromium
   used for PDF export here (Debian's own package, v150) draws a visible
   bounding-box artifact around gradient-clipped text in the print path
   that didn't show up in on-screen rendering; solid color sidesteps it
   entirely rather than chasing a specific Chromium version's print bug. */
.cover h1 { font-size:56px; font-weight:800; margin:0; letter-spacing:-0.01em; z-index:1;
  color: var(--gold); text-align:center; }
.cover h2 { font-size:22px; font-weight:400; color:#cfc9bd; margin:14px 0 0; z-index:1; }
.cover .rule { width:64px; height:2px; background:var(--gold); margin:40px 0; z-index:1; }
.cover .meta { z-index:1; display:flex; gap:48px; font-size:12px; color:#9a9284; }
.cover .meta b { display:block; color:#fff; font-size:20px; font-weight:700; margin-bottom:4px; }

.section-break { page-break-before: always; padding: 26mm 14mm 8mm; }
.section-break .eyebrow { letter-spacing:.3em; text-transform:uppercase; font-size:10px;
  color:var(--gold-700); font-weight:700; margin-bottom:8px; }
.section-break h2 { font-size:30px; margin:0 0 4px; font-weight:800; color:var(--ink); }
.section-break .count { font-size:12px; color:var(--ink-soft); }
.section-break .rule { height:1px; background:linear-gradient(90deg,var(--gold) 0%,var(--line) 100%);
  margin-top:14px; }

"""

# Card size presets keyed by how many cards the caller wants per row. Widths are
# derived from the printable A4 width (210mm - 2*10mm side padding = 190mm) so
# `n` cards with an 8mm gap always tile exactly: width = (190 - (n-1)*8) / n.
# Font/photo sizes are hand-tuned per preset rather than scaled linearly from n=2
# — a straight width-ratio scale-down made 3-per-row text uncomfortably small
# compared to what was already shipped and approved at that density.
CARD_PRESETS = {
    1: dict(width=190, photo_h=130, sku=12, name=24, name_min_h=18, desc=14, variants=13,
            price=26, currency=15, tbd=16, mark=24, mark_font=18, label=14, body_pad="8mm 10mm 9mm",
            table_th=7.5, table_td=8.5, table_price=9.5),
    2: dict(width=91, photo_h=70, sku=9, name=15, name_min_h=11, desc=10, variants=9,
            price=16, currency=10, tbd=11, mark=12, mark_font=11, label=10, body_pad="5mm 5.5mm 6mm",
            table_th=6, table_td=6.8, table_price=7.5),
    3: dict(width=58, photo_h=46, sku=7.5, name=10.5, name_min_h=8, desc=8, variants=7.3,
            price=11.5, currency=8, tbd=9, mark=9, mark_font=9, label=8, body_pad="3.4mm 3.6mm 3.8mm",
            table_th=4.8, table_td=5.3, table_price=6),
    4: dict(width=41.5, photo_h=33, sku=6.3, name=8.5, name_min_h=6.2, desc=6.8, variants=6.2,
            price=9.5, currency=6.8, tbd=7.5, mark=6.5, mark_font=6.5, label=6.3, body_pad="2.6mm 2.8mm 3mm",
            table_th=4, table_td=4.4, table_price=5),
}


def _card_css(cards_per_row: int) -> str:
    p = CARD_PRESETS.get(cards_per_row, CARD_PRESETS[2])
    # At 1-per-row each product is meant to occupy its own full sheet, not just
    # sit as one wide card among several stacked in a flex-wrap column — force
    # a page break after every card so the layout is deterministic regardless
    # of how much text a given model has (":not(:last-child)" so the very last
    # card in the document doesn't leave a trailing blank page).
    full_page_break = ".grid .card:not(:last-child) { page-break-after: always; }" if cards_per_row == 1 else ""
    return f"""
.grid {{ padding: 6mm 10mm 4mm; display:flex; flex-wrap:wrap; gap:8mm 8mm; }}
.card {{ width:{p['width']}mm; break-inside:avoid; display:flex; flex-direction:column;
  border:1px solid var(--line); border-radius:3mm; background:#fff; overflow:hidden; }}
{full_page_break}
.card .photo {{ width:100%; height:{p['photo_h']}mm; background:#f7f4ec; display:flex;
  align-items:center; justify-content:center; border-bottom:1px solid var(--line); }}
.card .photo img {{ max-width:92%; max-height:92%; object-fit:contain; }}
.card .photo.empty {{ flex-direction:column; gap:4mm; color:#b8ac8f; }}
.card .photo.empty .mark {{ width:{p['mark']}mm; height:{p['mark']}mm; border:1.6px solid #cabf9e; border-radius:50%;
  display:flex; align-items:center; justify-content:center; font-size:{p['mark_font']}px; font-weight:700; color:#cabf9e; }}
.card .photo.empty span.label {{ font-size:{p['label']}px; letter-spacing:.08em; text-transform:uppercase; }}
.card .body {{ padding:{p['body_pad']}; display:flex; flex-direction:column; flex:1; }}
.card .sku {{ font-size:{p['sku']}px; letter-spacing:.06em; color:var(--ink-soft);
  text-transform:uppercase; margin-bottom:2mm; }}
.card .name {{ font-size:{p['name']}px; font-weight:700; line-height:1.25; color:var(--ink);
  margin-bottom:2.5mm; min-height:{p['name_min_h']}mm; }}
.card .desc {{ font-size:{p['desc']}px; line-height:1.4; color:var(--ink-soft); margin-bottom:3mm; }}
.card .variants {{ font-size:{p['variants']}px; line-height:1.55; color:var(--gold-700); }}
.card .variants-group-label {{ font-size:{p['table_th']}px; font-weight:700; letter-spacing:.03em;
  text-transform:uppercase; color:var(--gold-700); margin:1mm 0; }}
.card .variants-table {{ width:100%; border-collapse:collapse; margin-bottom:3mm; table-layout:fixed; }}
.card .variants-table th {{ text-align:left; font-weight:700; color:var(--ink-soft); text-transform:uppercase;
  letter-spacing:.01em; font-size:{p['table_th']}px; padding:0 1mm 0.8mm 0; border-bottom:1px solid var(--line);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }}
.card .variants-table th.price {{ text-align:right; padding-right:0; }}
.card .variants-table td {{ font-size:{p['table_td']}px; line-height:1.3; color:var(--ink); padding:0.8mm 1mm 0.8mm 0;
  border-bottom:1px solid #f1ece0; }}
.card .variants-table td.price {{ font-size:{p['table_price']}px; text-align:right; padding-right:0; font-weight:700; color:var(--gold-700); }}
.card .price-row {{ display:flex; align-items:baseline; justify-content:space-between;
  border-top:1px solid var(--line); padding-top:3mm; margin-top:auto; }}
.card .price {{ font-size:{p['price']}px; font-weight:800; color:var(--gold-700); }}
.card .price.tbd {{ font-size:{p['tbd']}px; font-weight:600; color:var(--ink-soft); font-style:italic; }}
.card .currency {{ font-size:{p['currency']}px; color:var(--ink-soft); margin-left:1mm; font-weight:500; }}
"""


def _build_card_html(m: dict, orientation_map: dict) -> str:
    variants = m.get("variants") or []
    variants_table_html = _build_variants_table_html(variants, orientation_map)

    raw_name = m.get("name_ru") or m.get("code") or "Без названия"
    # Once a table is shown, the name no longer needs to carry one variant's
    # own dimensions (that's the redundancy the table replaces) — clean it.
    label = html.escape(_clean_model_name(raw_name) if variants_table_html else raw_name)
    code = html.escape(m.get("code", ""))
    desc = clean_description(m.get("description_ru"))
    if len(desc) > 130:
        desc = desc[:130] + "…"
    desc = html.escape(desc)

    photos = m.get("photos") or []
    cover_url = photos[0]["image_url"] if photos else m.get("image_url")
    photo_b64 = _load_photo_b64(cover_url)

    if photo_b64:
        photo_html = f'<div class="photo"><img src="data:image/jpeg;base64,{photo_b64}" alt=""></div>'
    else:
        photo_html = ('<div class="photo empty"><div class="mark">SR</div>'
                      '<span class="label">фото уточняйте</span></div>')

    desc_html = f'<div class="desc">{desc}</div>' if desc else ""

    # The per-size table (above) already spells out every height/section/
    # colour combination, so the old compact "300–1800 мм · 6–26 секций" /
    # "Цвета: ..." summary lines would just repeat the same data — only show
    # them when there's no table (a single real variant, or a model that
    # only varies by colour).
    variant_lines = []
    if not variants_table_html:
        colors_line = fmt_colors(m.get("colors") or [])
        if colors_line:
            variant_lines.append(html.escape(colors_line))
        sizes_line = fmt_sizes(m.get("sections_list") or [], m.get("height_mm_list") or [])
        if sizes_line:
            variant_lines.append(html.escape(sizes_line))
    variants_html = ('<div class="variants">' + "<br>".join(variant_lines) + "</div>") if variant_lines else ""

    # Same reasoning as the variant_lines suppression above: the per-size
    # table's own USD column already gives every real price, so the single
    # "от X" summary line at the card's bottom is pure repetition once a
    # table is shown (and can even look like a second, unexplained price)
    # — only render it when there's no table to make the point instead.
    price_row_html = "" if variants_table_html else f'<div class="price-row">{fmt_price(m)}</div>'

    return f"""
    <div class="card">
      {photo_html}
      <div class="body">
        <div class="sku">Арт. {code}</div>
        <div class="name">{label}</div>
        {variants_table_html}
        {desc_html}
        {variants_html}
        {price_row_html}
      </div>
    </div>
    """


def _build_html(grouped: list[tuple[str, list]], total: int, settings, orientation_map: dict, cards_per_row: int = 2) -> str:
    fonts = FONT_FACES % {
        "cyrillic_ext": _load_font_b64("inter-cyrillic-ext.woff2"),
        "cyrillic": _load_font_b64("inter-cyrillic.woff2"),
        "latin_ext": _load_font_b64("inter-latin-ext.woff2"),
        "latin": _load_font_b64("inter-latin.woff2"),
    }
    today = datetime.date.today()

    logo_html = ""
    logo = _load_logo_b64(settings.logo_url)
    if logo:
        logo_b64, mime = logo
        logo_html = f'<img class="logo" src="data:{mime};base64,{logo_b64}" alt="">'

    company_name = html.escape(settings.company_name)
    catalog_title = html.escape(settings.catalog_title)

    cover = f"""
    <div class="cover">
      <div class="fins">{''.join('<span></span>' for _ in range(18))}</div>
      {logo_html}
      <div class="eyebrow">Premium heating &amp; climate systems</div>
      <h1>{company_name}</h1>
      <h2>{catalog_title}</h2>
      <div class="rule"></div>
      <div class="meta">
        <div><b>{total}</b>моделей в каталоге</div>
        <div><b>{today:%d.%m.%Y}</b>дата формирования</div>
      </div>
    </div>
    """
    sections = []
    for root_name, models in grouped:
        cards = "\n".join(_build_card_html(m, orientation_map) for m in models)
        sections.append(f"""
        <div class="section-break">
          <div class="eyebrow">Раздел каталога</div>
          <h2>{html.escape(root_name)}</h2>
          <div class="count">{len(models)} {'модель' if len(models) == 1 else 'моделей'}</div>
          <div class="rule"></div>
        </div>
        <div class="grid">{cards}</div>
        """)
    return f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>{company_name} — {catalog_title}</title>
<style>{fonts}{CSS}{_card_css(cards_per_row)}</style></head><body>
{cover}
{''.join(sections)}
</body></html>"""


async def render_catalog_pdf(models: list[dict], categories: list, settings, cards_per_row: int = 2) -> bytes:
    root_map = _build_root_map(categories)
    orientation_map = _build_orientation_map(categories)
    by_root: dict[int, list] = {}
    root_names: dict[int, str] = {}
    for m in models:
        cid = m.get("category_id")
        root = root_map.get(cid)
        rid = root.id if root else 0
        root_names[rid] = root.name_ru if root else "Без категории"
        by_root.setdefault(rid, []).append(m)

    # Root order matches the site's own /catalog picker (FEATURED_CATEGORY_IDS
    # + the rest), so the printed catalog reads in the same order customers
    # browse the site in.
    root_order = [1, 16, 12, 20, 13, 15, 25, 19, 36, 24]
    order = [r for r in root_order if r in by_root] + [r for r in by_root if r not in root_order]
    grouped = [(root_names[r], by_root[r]) for r in order]

    html_str = _build_html(grouped, len(models), settings, orientation_map, cards_per_row=cards_per_row)

    footer_template = """
    <div style="width:100%;font-size:8px;color:#9a9284;font-family:Arial,sans-serif;
                text-align:center;padding-top:2mm;">
      <span class="pageNumber"></span> / <span class="totalPages"></span>
    </div>
    """
    async with async_playwright() as pw:
        # Debian's own chromium package (see Dockerfile) instead of Playwright's
        # bundled download — its own `install --with-deps` doesn't support this
        # image's Debian release yet.
        browser = await pw.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        page = await browser.new_page()
        await page.set_content(html_str, wait_until="load")
        pdf_bytes = await page.pdf(
            format="A4", print_background=True,
            display_header_footer=True, header_template="<span></span>",
            footer_template=footer_template,
            margin={"top": "0mm", "bottom": "12mm", "left": "0mm", "right": "0mm"},
        )
        await browser.close()
    return pdf_bytes
