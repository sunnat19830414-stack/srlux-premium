#!/usr/bin/env python3
"""
erp_sync_dolibarr.py — Синхронизация товаров из Dolibarr ERP в SR Lux каталог.
Запускается cron-ом каждые 30 минут:
  */30 * * * * /usr/bin/python3 /app/erp_sync_dolibarr.py >> /var/log/srlux_sync.log 2>&1
"""

import fcntl
import html
import json
import logging
import os
import sys
from decimal import Decimal
from pathlib import Path

import re
import requests

# Cron fires every 30 min regardless of how long the previous run took —
# a slow run (Dolibarr pagination + per-product category lookups routinely
# takes several minutes) can still be executing when the next one starts.
# Two concurrent runs raced in testing (2026-07-25) and one run's SEO-
# snapshot "delete anything not written by me" cleanup (see
# generate_model_snapshots) wiped out the *other* run's freshly-written
# files, leaving model-snapshots/ empty. A non-blocking lock makes the
# second invocation exit immediately instead of racing.
LOCK_PATH = "/tmp/erp_sync.lock"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("erp_sync")

DOLIBARR_URL = os.getenv("DOLIBARR_API_URL", "https://bollente.uz/api/index.php/").rstrip("/")
DOLIBARR_KEY = os.getenv("DOLIBARR_API_KEY", "")
BACKEND_URL = os.getenv("BACKEND_URL", "http://api:8000")
# Internal address of the frontend container — used only to fetch the
# current built index.html as a template for static SEO snapshots (below),
# never for anything user-facing.
WEB_URL = os.getenv("WEB_URL", "http://web:3000")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")

# "Трап" — second business (sanitary floor drains), entity=2 in the same
# Dolibarr install. The stock REST API is hardcoded to conf->entity=1 at
# auth time (confirmed by direct curl — ?entity=2 is silently ignored), so
# entity=2 data comes from a small dedicated export endpoint instead
# (custom/entity2export/ on the Dolibarr box), not the shared /api/ path.
# Both unset by default — sync_entity2() no-ops until configured.
DOLIBARR_ENTITY2_URL = os.getenv("DOLIBARR_ENTITY2_URL", "").rstrip("/")
DOLIBARR_ENTITY2_API_KEY = os.getenv("DOLIBARR_ENTITY2_API_KEY", "")

# Dolibarr prices are in USD — always convert to UZS
DOLIBARR_DEFAULT_CURRENCY = os.getenv("DOLIBARR_DEFAULT_CURRENCY", "USD")

# Базовый курс конвертации USD → UZS
USD_TO_UZS = Decimal(os.getenv("USD_TO_UZS_RATE", "12650"))

DOLIBARR_HEADERS = {"DOLAPIKEY": DOLIBARR_KEY}
PAGE_SIZE = 100


def fetch_all_products() -> list:
    """Забираем ВСЕ товары из Dolibarr с поддержкой пагинации."""
    all_products = []
    page = 0

    while True:
        try:
            resp = requests.get(
                f"{DOLIBARR_URL}/products",
                headers=DOLIBARR_HEADERS,
                params={
                    "limit": PAGE_SIZE,
                    "page": page,
                    "sortorder": "ASC",
                    "sortfield": "t.rowid",
                    "status": 1,  # только активные в Dolibarr
                },
                timeout=30,
            )
            resp.raise_for_status()
            batch = resp.json()
        except Exception as e:
            logger.error(f"Ошибка запроса Dolibarr (страница {page}): {e}")
            break

        if not isinstance(batch, list) or len(batch) == 0:
            break

        all_products.extend(batch)
        logger.info(f"  Получено {len(batch)} товаров (страница {page}), всего: {len(all_products)}")

        if len(batch) < PAGE_SIZE:
            break
        page += 1

    return all_products


def fetch_categories() -> dict:
    """Возвращает словарь {dolibarr_id: {'label': ..., 'id': ...}}"""
    try:
        resp = requests.get(
            f"{DOLIBARR_URL}/categories",
            headers=DOLIBARR_HEADERS,
            params={"type": "product", "limit": 500},
            timeout=15,
        )
        if resp.status_code == 200:
            cats = resp.json()
            return {int(c["id"]): c for c in cats if isinstance(c, dict) and c.get("id")}
    except Exception as e:
        logger.warning(f"Не удалось загрузить категории: {e}")
    return {}


def fetch_product_categories(products: list) -> dict:
    """
    Строит маппинг {product_dolibarr_id: category_dolibarr_id}.
    Для каждого товара запрашивает GET /categories/object/product/{pid} — это
    единственный эндпоинт, который реально фильтрует по товару (старый вариант
    GET /categories?type=product&object_id={pid} игнорирует object_id и всегда
    возвращает одну и ту же первую категорию из общего списка).

    Dolibarr обычно возвращает категорию-родителя (например, "Радиаторы") и
    категорию-потомка (например, "Column 2") одновременно — берём самую
    конкретную (ту, что не является fk_parent ни для одной другой категории
    в этом же списке).
    """
    product_to_cat: dict = {}
    total = len(products)
    for i, p in enumerate(products):
        pid = int(p.get("id", 0)) if p.get("id") else 0
        if not pid:
            continue
        try:
            resp = requests.get(
                f"{DOLIBARR_URL}/categories/object/product/{pid}",
                headers=DOLIBARR_HEADERS,
                timeout=10,
            )
            if resp.status_code == 200:
                cats = resp.json()
                if isinstance(cats, list) and cats:
                    parent_ids = {int(c["fk_parent"]) for c in cats if c.get("fk_parent")}
                    leaves = [c for c in cats if int(c.get("id", 0)) not in parent_ids]
                    chosen = leaves[-1] if leaves else cats[-1]
                    cid = int(chosen["id"]) if chosen.get("id") else 0
                    if cid:
                        product_to_cat[pid] = cid
        except Exception as e:
            logger.debug(f"Категория для товара {pid}: {e}")
        if (i + 1) % 50 == 0:
            logger.info(f"  Загрузка категорий товаров: {i + 1}/{total}...")

    logger.info(f"Маппинг товар→категория: {len(product_to_cat)} из {total} товаров")
    return product_to_cat


def wait_for_backend(max_attempts: int = 15, delay: float = 3.0) -> bool:
    """Ждёт пока бэкенд API не ответит на /health."""
    import time
    for i in range(max_attempts):
        try:
            resp = requests.get(f"{BACKEND_URL}/health", timeout=5)
            if resp.status_code == 200:
                return True
        except Exception:
            pass
        logger.info(f"Ожидание бэкенда... ({i + 1}/{max_attempts})")
        time.sleep(delay)
    return False


def sync_categories_to_backend(categories_map: dict) -> None:
    """Создаёт/обновляет все категории Dolibarr в базе данных SR Lux."""
    if not categories_map:
        return

    cats = []
    for dolibarr_id, cat_data in categories_map.items():
        name_ru = str(cat_data.get("label") or "Категория").strip()
        fk_parent_raw = cat_data.get("fk_parent")
        parent_dolibarr_id = None
        if fk_parent_raw and str(fk_parent_raw) not in ("0", "", "null", "None"):
            try:
                parent_dolibarr_id = int(fk_parent_raw)
            except (ValueError, TypeError):
                pass
            # id=24 ("Точка продажа (POS) продукты") is Dolibarr's catch-all
            # root — every real top-level category (Радиаторы, Термостаты...)
            # is filed under it, but it isn't a merchandising category itself,
            # so treat it as if it had no parent to keep those as true
            # top-level nodes on the site instead of nesting everything
            # under a "POS products" wrapper.
            if parent_dolibarr_id == 24:
                parent_dolibarr_id = None
        if name_ru:
            cats.append({
                "dolibarr_id": dolibarr_id,
                "name_ru": name_ru,
                "name_uz": None,
                "icon": None,
                "parent_dolibarr_id": parent_dolibarr_id,
            })

    try:
        resp = requests.post(
            f"{BACKEND_URL}/api/admin/categories/bulk",
            json={"categories": cats},
            headers={"X-Api-Key": ADMIN_API_KEY, "Content-Type": "application/json"},
            timeout=30,
        )
        if resp.status_code == 200:
            result = resp.json()
            logger.info(f"✅ Категории синхронизированы: upserted={result['upserted']}")
        else:
            logger.error(f"Ошибка синхронизации категорий: {resp.status_code} — {resp.text[:200]}")
    except Exception as e:
        logger.error(f"Не удалось синхронизировать категории: {e}")


def get_usd_rate() -> Decimal:
    """Пытается получить актуальный курс из бэкенда, fallback — константа."""
    try:
        resp = requests.get(f"{BACKEND_URL}/api/currencies/USD", timeout=5)
        if resp.status_code == 200:
            rate = resp.json().get("rate_to_uzs")
            if rate:
                return Decimal(str(rate))
    except Exception:
        pass
    return USD_TO_UZS


def convert_price(raw_price, currency: str, usd_rate: Decimal) -> Decimal:
    """Конвертирует цену в UZS."""
    try:
        price = Decimal(str(raw_price))
    except Exception:
        return Decimal("0")

    if price <= 0:
        return Decimal("0")

    currency = (currency or "").upper()
    if currency in ("USD", "US"):
        return (price * usd_rate).quantize(Decimal("1"))
    # Считаем UZS / сумы по умолчанию
    return price.quantize(Decimal("1"))


def extract_price(p: dict) -> float:
    """
    Извлекает продажную цену из товара Dolibarr.
    Dolibarr может хранить цену в базовом поле (price_ttc/price) ИЛИ
    в мультипрайсе (multiprices_ttc, multiprices) при включённом режиме уровней цен.
    """
    # 1. Стандартные поля
    for field in ("price_ttc", "price"):
        val = p.get(field)
        try:
            if val and float(val) > 0:
                return float(val)
        except (TypeError, ValueError):
            pass

    # 2. Мультипрайс: dict {"1": "247.06", "2": "..."} — берём первый непустой
    for field in ("multiprices_ttc", "multiprices"):
        mp = p.get(field)
        if isinstance(mp, dict):
            for key in sorted(mp.keys()):
                try:
                    val = float(mp[key] or 0)
                    if val > 0:
                        return val
                except (TypeError, ValueError):
                    pass

    return 0


def build_parent_map(raw_products: list) -> dict:
    """
    Строит словарь {dolibarr_id: product_data} для родительских товаров.
    Родительский товар — тот, у которого fk_product_parent пустой или 0.
    """
    parent_map = {}
    for p in raw_products:
        parent_id = p.get("fk_product_parent")
        is_child = parent_id and str(parent_id) not in ("0", "", "null", "None")
        if not is_child:
            pid = int(p.get("id", 0))
            if pid:
                parent_map[pid] = p
    logger.info(f"Родительских товаров (модели): {len(parent_map)}, дочерних: {len(raw_products) - len(parent_map)}")
    return parent_map


NO_GROUP_MODEL_CARDS: set[str] = {"BZ", "FANCOIL"}


def build_model_map(raw_products: list) -> tuple[dict, set]:
    """
    Выявляет «карточки моделей» по формату label: "REF/alias — описание".
    Возвращает:
      alias_map: {alias_upper → canonical_ref} для сопоставления вариантов с моделью
      model_card_ids: set[int] — dolibarr_id карточек (не показываем как варианты)
    """
    alias_map: dict[str, str] = {}
    model_card_ids: set[int] = set()
    card_refs: list[str] = []

    for p in raw_products:
        ref = str(p.get("ref") or "").strip()
        label = str(p.get("label") or "").strip()

        if not ref or not label or " — " not in label:
            continue

        head = label.split(" — ")[0].strip()

        # Карточка модели: часть до " — " начинается ровно с ref
        if not head.upper().startswith(ref.upper()):
            continue

        # Извлекаем алиасы: "GZ2/G2T" → ["GZ2", "G2T"]
        aliases = [a.strip() for a in head.split("/") if a.strip()]
        if not aliases or aliases[0].upper() != ref.upper():
            continue

        pid = int(p.get("id") or 0)
        if pid:
            model_card_ids.add(pid)
        canonical = ref  # ref карточки — каноническое имя модели
        card_refs.append(ref)

        # Некоторые карточки — это просто референс-фото от поставщика
        # (например "BZ" с алиасом "BZV3"), а не настоящая группа моделей.
        # Оставляем их скрытыми (is_active=False через model_card_ids), но
        # НЕ регистрируем алиасы, иначе BZ-*/BZV3-* товары с разной высотой
        # схлопываются в одну страницу по (color, sections) — sections не
        # различает высоту, color у них не заполнен.
        if ref.upper() in NO_GROUP_MODEL_CARDS:
            continue

        for alias in aliases:
            if alias:
                alias_map[alias.upper()] = canonical

    logger.info(
        f"Карточек моделей: {len(model_card_ids)} | алиасов: {len(alias_map)} | "
        f"модели: {', '.join(sorted(card_refs))}"
    )
    return alias_map, model_card_ids


def find_parent_model(ref: str, sorted_prefixes: list, alias_map: dict) -> str | None:
    """Возвращает canonical parent_model для ref, или None если не найдено."""
    ref_upper = ref.upper()
    for prefix in sorted_prefixes:
        if ref_upper == prefix:
            if alias_map[prefix] == prefix:
                continue  # это сама карточка модели (алиас указывает сам на себя)
            return alias_map[prefix]  # точное совпадение с алиасом другой модели
        if ref_upper.startswith(prefix):
            return alias_map[prefix]
    return None



# ── Push-фитинги Andes (S/L/T-62PPR) ────────────────────────────────────────
# У этих SKU нет карточки модели в Dolibarr, а простое сопоставление по
# префиксу (find_parent_model выше) не может их различить: "S16x16-62PPR"
# (обычная муфта) и "S16x20R-62PPR" (муфта с подогревом) оба начинаются с
# "S16x". Поэтому группируем эту линейку отдельными regex-паттернами.
PUSHFIT_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"^S\d+X\d+R-62PPR$"), "PF-S-HEATED"),      # S16x20R-62PPR
    (re.compile(r"^S\d+X\d+-62PPR$"),  "PF-S-COUPLING"),    # S16x16-62PPR
    (re.compile(r"^L\d+X\d+-62PPR$"),  "PF-L-ELBOW"),       # L16x16-62PPR
    (re.compile(r"^T\d+X\d+X\d+-62PPR$"), "PF-T-TEE"),     # T16x16x16-62PPR
]


def find_pushfit_parent_model(ref: str) -> str | None:
    """Возвращает parent_model для push-фитингов Andes, или None."""
    ref_upper = ref.upper()
    for pattern, code in PUSHFIT_PATTERNS:
        if pattern.match(ref_upper):
            return code
    return None


def _get_photos(p: dict) -> str | None:
    """Извлекает первый URL фото из поля photos товара."""
    # Пробуем разные поля — разные версии Dolibarr используют разные имена
    for field in ("photos", "photo", "images"):
        photos = p.get(field) or []
        if isinstance(photos, list) and photos:
            item = photos[0]
            url = item.get("photo_url") or item.get("url") or item.get("src")
            if url:
                return url
        elif isinstance(photos, str) and photos:
            return photos
    return None


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

UPLOADS_DIR = Path("/app/uploads")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Кэш: product_id -> [local_url, ...] (чтобы не скачивать дважды за один запуск)
_gallery_cache: dict[int, list[str]] = {}


def _download_dolibarr_photo(product_id: int, index: int, file_path: str, filename_hint: str) -> str | None:
    """Скачивает фото из Dolibarr через REST API (documents/download) и сохраняет локально.

    viewimage.php требует сессионный логин и не принимает DOLAPIKEY, поэтому
    используем официальный REST-эндпоинт /documents/download, который
    отдаёт содержимое файла в base64 при авторизации через DOLAPIKEY.
    """
    import base64
    import hashlib

    ext = Path(filename_hint).suffix.lower().lstrip(".")
    if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
        ext = "jpg"
    if ext == "jpeg":
        ext = "jpg"
    try:
        resp = requests.get(
            f"{DOLIBARR_URL}/documents/download",
            headers=DOLIBARR_HEADERS,
            params={"modulepart": "produit", "original_file": file_path},
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            content = data.get("content")
            if content and data.get("encoding") == "base64":
                raw = base64.b64decode(content)
                if len(raw) > 500:
                    # Имя файла включает хеш содержимого, чтобы при замене
                    # фото в Dolibarr получался НОВЫЙ URL — иначе nginx отдаёт
                    # /static/ с Cache-Control: immutable на 30 дней, и
                    # обновлённое фото никогда не доходит до браузера
                    # (тот же dol_{id}.png продолжает считаться закэшированным).
                    content_hash = hashlib.md5(raw).hexdigest()[:10]
                    local_name = (
                        f"dol_{product_id}_{content_hash}.{ext}"
                        if index == 0
                        else f"dol_{product_id}_{index}_{content_hash}.{ext}"
                    )
                    local_path = UPLOADS_DIR / local_name
                    local_path.write_bytes(raw)
                    # WebP-копия рядом с оригиналом — фронтенд отдаёт её через
                    # <picture>/<source> браузерам, которые её поддерживают
                    # (~90% экономии веса против jpg/png), с оригиналом как
                    # fallback. Не блокирует синхронизацию при сбое конвертации.
                    try:
                        from PIL import Image
                        img = Image.open(local_path)
                        img = img.convert("RGBA" if img.mode in ("RGBA", "P") else "RGB")
                        img.save(local_path.with_suffix(".webp"), "WEBP", quality=82, method=6)
                    except Exception as e:
                        logger.debug(f"WebP-конвертация {product_id}: {e}")
                    # Подчищаем старые файлы этого товара/индекса с ДРУГИМ
                    # хешем содержимого, чтобы не копить бесконечно устаревшие
                    # копии после замены фото в Dolibarr. Сравниваем именно
                    # хеш (капчер-группа), а не имя файла целиком и не
                    # расширение — иначе любой альтернативный формат с тем же
                    # хешем (сгенерированный .webp рядом с оригиналом, либо
                    # вручную оптимизированный .jpg/.webp той же фотографии)
                    # считается "старым файлом другого хеша" и удаляется на
                    # первом же цикле синхронизации, хотя это тот же самый
                    # снимок в другом контейнере (обнаружено 2026-07-14:
                    # так дважды пропадали фото на сайте — сперва у карточек
                    # товаров в "Хиты продаж", затем у плитки категории
                    # "Стальной панельный", где вручную сжатый .jpg с тем же
                    # хешем в имени принимался за устаревший .png-оригинал).
                    if index == 0:
                        stale_re = re.compile(rf"^dol_{product_id}_([0-9a-f]{{10}})\.\w+$")
                    else:
                        stale_re = re.compile(rf"^dol_{product_id}_{index}_([0-9a-f]{{10}})\.\w+$")
                    for old_file in UPLOADS_DIR.glob(f"dol_{product_id}_*"):
                        m = stale_re.match(old_file.name)
                        if m and m.group(1) != content_hash:
                            try:
                                old_file.unlink()
                            except OSError:
                                pass
                    legacy_name = f"dol_{product_id}.{ext}" if index == 0 else f"dol_{product_id}_{index}.{ext}"
                    legacy_path = UPLOADS_DIR / legacy_name
                    if legacy_path.exists():
                        try:
                            legacy_path.unlink()
                        except OSError:
                            pass
                    return f"/static/uploads/{local_name}"
            logger.debug(f"Фото {product_id}: пустой content, ответ={data.get('filename')}")
        else:
            logger.debug(f"Фото {product_id}: статус={resp.status_code} file={file_path}")
    except Exception as e:
        logger.debug(f"Скачивание фото {product_id}: {e}")
    return None


def fetch_all_document_photos(product_id: int, product_ref: str) -> list[str]:
    """
    Скачивает ВСЕ изображения, прикреплённые к товару в Dolibarr Documents
    (используется как галерея на сайте), сохраняет локально, возвращает
    список /static/uploads/... URL в порядке, в котором их вернул Dolibarr.
    """
    # Note: deliberately no filesystem-based "already downloaded" shortcut here
    # (unlike the old single-photo fetch_document_photo) — a stale single
    # "dol_{id}.jpg" left over from a previous run would falsely look like a
    # complete gallery and stop us from ever fetching the rest. The in-memory
    # _gallery_cache below is enough to avoid duplicate work within one run;
    # _download_dolibarr_photo overwrites the same filename idempotently.
    if product_id in _gallery_cache:
        return _gallery_cache[product_id]

    urls: list[str] = []
    try:
        resp = requests.get(
            f"{DOLIBARR_URL}/documents",
            headers=DOLIBARR_HEADERS,
            params={"modulepart": "product", "id": product_id},
            timeout=10,
        )
        if resp.status_code == 200:
            docs = resp.json()
            if isinstance(docs, list):
                for doc in docs:
                    # Dolibarr may return name=null; check relativename for extension
                    rel_name = str(doc.get("relativename") or doc.get("name") or "").lower()
                    if not any(rel_name.endswith(ext) for ext in IMAGE_EXTENSIONS):
                        continue
                    relative = doc.get("relativename") or doc.get("name")
                    level1 = doc.get("level1name") or ""
                    fullname = str(doc.get("fullname") or "")
                    marker = "/documents/produit/"
                    idx2 = fullname.find(marker)
                    if idx2 != -1:
                        # Most reliable: derive path from the absolute fullname,
                        # since relativename sometimes already embeds the folder
                        # name as a filename prefix (no actual "/" in it) and the
                        # level1name+relativename heuristic then drops the folder.
                        file_path = fullname[idx2 + len(marker):]
                    elif relative and level1 and not relative.startswith(level1):
                        file_path = f"{level1}/{relative}"
                    else:
                        file_path = relative
                    if file_path:
                        url = _download_dolibarr_photo(product_id, len(urls), file_path, rel_name)
                        if url:
                            urls.append(url)
    except Exception as e:
        logger.debug(f"Документы для товара {product_id}: {e}")

    _gallery_cache[product_id] = urls
    return urls


def build_payload(
    raw_products: list,
    categories_map: dict,
    product_to_cat: dict,
    usd_rate: Decimal,
    parent_map: dict | None = None,
    alias_map: dict | None = None,
    model_card_ids: set | None = None,
) -> list:
    """Превращает ответ Dolibarr в список для bulk-import."""
    payload = []
    skipped = 0
    parent_map = parent_map or {}
    alias_map = alias_map or {}
    model_card_ids = model_card_ids or set()
    inherited_photo = 0
    inherited_desc = 0

    # Сортируем префиксы по длине (длинные сначала) — "BZV3" раньше "BZ"
    sorted_prefixes = sorted(alias_map.keys(), key=len, reverse=True)

    # Log first product keys once for debugging
    if raw_products:
        logger.info(f"Поля первого товара: {list(raw_products[0].keys())}")
        logger.info(f"photos/photo поля: photos={raw_products[0].get('photos')}, photo={raw_products[0].get('photo')}")

    for p in raw_products:
        try:
            dolibarr_id = int(p.get("id", 0))
            sku = str(p.get("ref") or p.get("id") or "").strip()
            name_ru = str(p.get("label") or "").strip()

            if not sku or not name_ru:
                skipped += 1
                continue

            # API-параметр status=1 в fetch_all_products() не фильтрует
            # результат (Dolibarr его игнорирует на этом инстансе) — товары
            # с status=0 ("не для продажи") всё равно приходят в ответе,
            # поэтому фильтруем их здесь явно, иначе deactivated в Dolibarr
            # товары продолжают попадать на сайт при каждой синхронизации.
            if int(p.get("status") or 0) == 0:
                skipped += 1
                continue

            # Цена: Dolibarr хранит товары в USD — всегда конвертируем в UZS
            raw_price = extract_price(p)
            price_uzs = convert_price(raw_price, DOLIBARR_DEFAULT_CURRENCY, usd_rate)

            if price_uzs <= 0:
                skipped += 1
                logger.debug(f"Пропущен (нулевая цена): {sku} — {name_ru}")
                continue

            stock = int(float(p.get("stock_reel") or 0))
            weight_raw = p.get("weight")
            weight = float(weight_raw) if weight_raw not in (None, "", "0") else None

            # Dolibarr's own "length"/"width"/"height" fields (metres) map to
            # the radiator's real physical height/width/depth, confirmed
            # 2026-07-15 by cross-checking every radiator with an H×W×D
            # string embedded in its Dolibarr label (e.g. GZ2's width=0.47
            # matches "1800x470x70"'s "470"). That default mapping holds for
            # ~90% of SKUs, but a few product lines need per-SKU handling
            # (verified against label/SKU-embedded numbers, not guessed) —
            # height_mm is untouched either way, sourced elsewhere in the
            # pipeline:
            #  - JDC22: struct length/width/height rotate inconsistently
            #    even within this one line (confirmed against every SKU —
            #    JDC22-1200-400W's struct fields don't follow the same
            #    rotation as JDC22-400-1000 or JDC22-1800-400B), but the SKU
            #    itself always encodes "JDC22-{height}-{width}" literally
            #    (checked against all 21 active JDC22 SKUs), so real width
            #    is parsed from the SKU rather than from Dolibarr's fields;
            #    real depth is Dolibarr's "width" field, a reliably constant
            #    ~100mm profile across every SKU.
            #  - short (300mm) GZ3/"G3T-300" panels: real width sits in
            #    Dolibarr's "length" field, real depth in "width" (e.g.
            #    G3T-300-26W's label "300x1174x100" has length=1.174
            #    matching the 1174mm width).
            #  - NCR03: real width sits in Dolibarr's "height" field, real
            #    depth in "width" (width is a constant 168mm profile, height
            #    grows 425→1175mm with section count, i.e. is the width).
            def _mm(raw):
                return round(float(raw) * 1000) if raw not in (None, "", "0") else None

            length_mm = _mm(p.get("length"))
            raw_width_mm = _mm(p.get("width"))
            raw_height_mm = _mm(p.get("height"))

            jdc22_match = re.match(r"^JDC22-\d+-(\d+)", sku) if sku.startswith("JDC22") else None

            if jdc22_match:
                width_mm = int(jdc22_match.group(1))
                depth_mm = raw_width_mm
            elif sku.startswith("G3T-300"):
                width_mm = length_mm
                depth_mm = raw_width_mm
            elif sku.startswith("NCR03"):
                width_mm = raw_height_mm
                depth_mm = raw_width_mm
            else:
                width_mm = raw_width_mm
                depth_mm = raw_height_mm

            description_ru = str(p.get("description") or "").strip() or None

            # Определяем родителя для этого товара
            fk_parent_raw = p.get("fk_product_parent")
            fk_parent = None
            if fk_parent_raw and str(fk_parent_raw) not in ("0", "", "null", "None"):
                try:
                    fk_parent = int(fk_parent_raw)
                except (ValueError, TypeError):
                    pass

            parent = parent_map.get(fk_parent) if fk_parent else None

            # Фото: сначала своё поле, потом документы Dolibarr (все — как галерея),
            # потом с родителя (только обложка, без галереи — фото на карточке
            # модели относятся к разным цветам/вариантам, а не к этому товару).
            own_gallery = fetch_all_document_photos(dolibarr_id, sku)
            image_url = _get_photos(p) or (own_gallery[0] if own_gallery else None)
            images = own_gallery if own_gallery else ([image_url] if image_url else [])
            if not image_url and parent:
                parent_pid = int(parent.get("id", 0))
                parent_ref = str(parent.get("ref") or "")
                parent_gallery = fetch_all_document_photos(parent_pid, parent_ref)
                image_url = _get_photos(parent) or (parent_gallery[0] if parent_gallery else None)
                if image_url:
                    inherited_photo += 1
                    images = [image_url]

            # Описание: сначала своё, fallback — с родителя
            if not description_ru and parent:
                description_ru = str(parent.get("description") or "").strip() or None
                if description_ru:
                    inherited_desc += 1

            # Категория: сначала из поля товара, потом из маппинга product→category
            cat_dolibarr_id = None
            cat_name_ru = None

            cat_ids = p.get("category_ids") or p.get("categories") or []
            if isinstance(cat_ids, (str, int)):
                cat_ids = [cat_ids]
            if isinstance(cat_ids, list) and cat_ids:
                first_cat_id = int(cat_ids[0])
                if first_cat_id in categories_map:
                    cat_dolibarr_id = first_cat_id
                    cat_name_ru = str(categories_map[first_cat_id].get("label") or "Прочее")

            # Fallback: маппинг из fetch_product_categories()
            if cat_dolibarr_id is None and dolibarr_id in product_to_cat:
                fallback_id = product_to_cat[dolibarr_id]
                if fallback_id in categories_map:
                    cat_dolibarr_id = fallback_id
                    cat_name_ru = str(categories_map[fallback_id].get("label") or "Прочее")

            # Определяем parent_model из таблицы алиасов
            is_model_card = dolibarr_id in model_card_ids
            if is_model_card:
                parent_model = None
            else:
                parent_model = find_parent_model(sku, sorted_prefixes, alias_map) or find_pushfit_parent_model(sku)

            payload.append({
                "dolibarr_id": dolibarr_id,
                "sku": sku,
                "name_ru": name_ru,
                "name_uz": None,
                "description_ru": description_ru,
                "description_uz": None,
                "price_uzs": float(price_uzs),
                # Raw pre-conversion Dolibarr value — never shown on the
                # public site, only used by the admin-only PDF catalog
                # generator (retail price in USD, per its own request).
                "price_usd": float(raw_price) if raw_price and raw_price > 0 else None,
                "stock": stock,
                "weight": weight,
                "width_mm": width_mm,
                "depth_mm": depth_mm,
                "image_url": image_url,
                "images": images,
                "is_active": not is_model_card,
                "category_dolibarr_id": cat_dolibarr_id,
                "category_name_ru": cat_name_ru,
                "category_name_uz": None,
                "parent_model": parent_model,
            })
        except Exception as e:
            logger.warning(f"Ошибка обработки товара {p.get('id')}: {e}")
            skipped += 1

    logger.info(
        f"Подготовлено к импорту: {len(payload)}, пропущено: {skipped} | "
        f"Фото унаследовано от родителя: {inherited_photo}, описание: {inherited_desc}"
    )
    return payload


def send_to_backend(payload: list) -> None:
    """Отправляет payload в /api/admin/products/bulk."""
    if not payload:
        logger.info("Нечего отправлять.")
        return

    try:
        resp = requests.post(
            f"{BACKEND_URL}/api/admin/products/bulk",
            json={"products": payload},
            headers={"X-Api-Key": ADMIN_API_KEY, "Content-Type": "application/json"},
            timeout=120,
        )
        if resp.status_code == 200:
            result = resp.json()
            logger.info(f"✅ Импорт завершён: upserted={result['upserted']}, skipped={result['skipped']}")
        else:
            logger.error(f"Ошибка ответа бэкенда: {resp.status_code} — {resp.text[:300]}")
            sys.exit(1)
    except Exception as e:
        logger.error(f"Не удалось отправить данные на бэкенд: {e}")
        sys.exit(1)


# ── "Трап" (entity=2) — independent second sync pass ───────────────────────────
#
# Runs after the entity=1 (radiators) sync has already fully committed, and
# is wrapped in its own try/except in main() — a bug here must never be able
# to take down the primary sync. Reuses the same downstream primitives as
# entity=1 (sync_categories_to_backend, the /api/admin/products/bulk upsert)
# rather than inventing a parallel path, per the plan this was built from.

def fetch_entity2_data() -> dict | None:
    """One GET to the entity=2 export endpoint on the Dolibarr box. Returns
    None (not an exception) if unconfigured or unreachable, so callers can
    just skip the pass — this must never be able to fail the whole sync."""
    if not DOLIBARR_ENTITY2_URL or not DOLIBARR_ENTITY2_API_KEY:
        return None
    try:
        resp = requests.get(
            f"{DOLIBARR_ENTITY2_URL}/export.php",
            headers={"X-API-KEY": DOLIBARR_ENTITY2_API_KEY},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            logger.error(f"«Трап»: export.php вернул ok=false: {data}")
            return None
        return data
    except Exception as e:
        logger.error(f"«Трап»: не удалось получить данные с {DOLIBARR_ENTITY2_URL}: {e}")
        return None


def _download_trap_photo(dolibarr_id: int, ref: str) -> str | None:
    """Mirrors _download_dolibarr_photo's storage convention (content-hashed
    filename, WebP sibling, stale-file cleanup) but pulls bytes from the
    entity=2 photo.php endpoint instead of Dolibarr's document REST API —
    same /app/uploads/ + /static/uploads/... URL convention either way, so
    nothing downstream needs to know the source differs."""
    import hashlib

    try:
        resp = requests.get(
            f"{DOLIBARR_ENTITY2_URL}/photo.php",
            headers={"X-API-KEY": DOLIBARR_ENTITY2_API_KEY},
            params={"ref": ref},
            timeout=30,
        )
        if resp.status_code != 200 or len(resp.content) < 500:
            return None

        content_type = resp.headers.get("Content-Type", "")
        ext = "jpg"
        if "png" in content_type:
            ext = "png"
        elif "webp" in content_type:
            ext = "webp"

        raw = resp.content
        content_hash = hashlib.md5(raw).hexdigest()[:10]
        local_name = f"dol_{dolibarr_id}_{content_hash}.{ext}"
        local_path = UPLOADS_DIR / local_name
        local_path.write_bytes(raw)

        try:
            from PIL import Image
            img = Image.open(local_path)
            img = img.convert("RGBA" if img.mode in ("RGBA", "P") else "RGB")
            img.save(local_path.with_suffix(".webp"), "WEBP", quality=82, method=6)
        except Exception as e:
            logger.debug(f"«Трап»: WebP-конвертация {ref}: {e}")

        stale_re = re.compile(rf"^dol_{dolibarr_id}_([0-9a-f]{{10}})\.\w+$")
        for old_file in UPLOADS_DIR.glob(f"dol_{dolibarr_id}_*"):
            m = stale_re.match(old_file.name)
            if m and m.group(1) != content_hash:
                try:
                    old_file.unlink()
                except OSError:
                    pass

        return f"/static/uploads/{local_name}"
    except Exception as e:
        logger.warning(f"«Трап»: фото {ref} (id={dolibarr_id}) не скачано: {e}")
        return None


def send_entity2_products(payload: list) -> None:
    """Same endpoint/shape as send_to_backend(), but deliberately does NOT
    sys.exit() on failure — a bug in the new entity=2 path must not be able
    to kill a process that already successfully synced entity=1 radiators
    (the SEO-snapshot generation step still runs after this one)."""
    if not payload:
        logger.info("«Трап»: нечего отправлять.")
        return
    try:
        resp = requests.post(
            f"{BACKEND_URL}/api/admin/products/bulk",
            json={"products": payload},
            headers={"X-Api-Key": ADMIN_API_KEY, "Content-Type": "application/json"},
            timeout=60,
        )
        if resp.status_code == 200:
            result = resp.json()
            logger.info(f"✅ «Трап» синхронизирован: upserted={result['upserted']}, skipped={result['skipped']}")
        else:
            logger.error(f"«Трап»: ошибка ответа бэкенда: {resp.status_code} — {resp.text[:300]}")
    except Exception as e:
        logger.error(f"«Трап»: не удалось отправить данные на бэкенд: {e}")


def sync_entity2(usd_rate: Decimal) -> None:
    data = fetch_entity2_data()
    if data is None:
        logger.info("«Трап»: entity2-эндпоинт не настроен или недоступен — пропускаю проход.")
        return

    categories = data.get("categories") or []
    products = data.get("products") or []
    logger.info(f"«Трап»: получено с Dolibarr — категорий={len(categories)}, товаров={len(products)}")

    categories_map = {
        c["id"]: {"label": c["label"], "fk_parent": c.get("parent_id")}
        for c in categories
    }
    sync_categories_to_backend(categories_map)

    # NB: unlike entity=1, there is no existing "hide when out of stock"
    # behaviour to reuse — checked (grep for `stock` in this file): entity=1
    # products with stock=0 stay is_active=True and just show an out-of-
    # stock badge on the site. This stock<=0 -> is_active=False rule is new,
    # entity=2-only logic per the product decision to keep the (currently
    # all-zero-stock) "Трап" catalog hidden until real stock lands.
    payload = []
    hidden = 0
    for p in products:
        stock = int(p.get("stock") or 0)
        is_active = stock > 0
        if not is_active:
            hidden += 1

        price_uzs = convert_price(p.get("price"), p.get("currency") or "USD", usd_rate)
        if price_uzs <= 0:
            logger.warning(f"«Трап»: {p.get('ref')} — нулевая/некорректная цена, будет пропущен upsert'ом")

        # entity2export.php hardcodes currency='USD' for every «Трап» product
        # (see entity=2's Dolibarr module — prices there are entered in USD,
        # same as entity=1), so the raw value is already the USD price —
        # mirrors entity=1's own "price_usd" semantics (raw pre-conversion
        # Dolibarr value, admin-only PDF catalog generator's price source).
        raw_price = p.get("price")
        price_usd = float(raw_price) if raw_price and float(raw_price) > 0 else None

        image_url = _download_trap_photo(p["id"], p["ref"]) if p.get("has_photo") else None

        payload.append({
            "dolibarr_id": p["id"],
            "sku": p["ref"],
            "name_ru": p.get("label") or p["ref"],
            "price_uzs": float(price_uzs),
            "price_usd": price_usd,
            "stock": stock,
            "image_url": image_url,
            "is_active": is_active,
            "category_dolibarr_id": p.get("category_id"),
            "parent_model": None,
        })

    logger.info(f"«Трап»: скрыто по нулевому остатку (is_active=False) — {hidden} из {len(products)}")
    send_entity2_products(payload)


# ── Static SEO snapshots (per-page title/description/OG/JSON-LD) ──────────────
#
# The site is a client-rendered Vite SPA (ReactDOM.createRoot, not
# hydrateRoot — see frontend/src/main.tsx) that sets per-page <title>/meta/
# JSON-LD from useEffect via frontend/src/lib/seo.ts. That means the raw HTML
# a crawler sees before JS runs is the same static shell on every page —
# confirmed via `curl -s https://srlux.uz/model/<code>` returning identical
# <title>/<meta description> for every product (2026-07-25 audit).
#
# Fix: after every sync, render each page's actual <head> tags into a static
# HTML file, reusing the live built index.html as the template so fonts/GTM/
# CSP-related tags never drift from what's actually deployed. nginx serves
# these ahead of the SPA fallback (see nginx.conf `/model/` and the four
# exact-match static-page locations). Because mounting uses createRoot (not
# hydrateRoot), there is no reconciliation between this static markup and
# what React renders — React just wipes and re-renders `#root` from scratch,
# so no hydration-mismatch risk. The meta/link/script elements below use the
# exact same selectors setSeo() upserts in frontend/src/lib/seo.ts (name=
# "description", property="og:*", id="seo-jsonld"), so once JS mounts it
# updates those same elements in place instead of duplicating them.
SITE_URL = "https://srlux.uz"
SNAPSHOT_DIR = Path(os.getenv("SNAPSHOT_DIR", "/app/uploads/model-snapshots"))
STATIC_SNAPSHOT_DIR = Path(os.getenv("STATIC_SNAPSHOT_DIR", "/app/uploads/static-snapshots"))
CATEGORY_SNAPSHOT_DIR = Path(os.getenv("CATEGORY_SNAPSHOT_DIR", "/app/uploads/category-snapshots"))

# Same fallback used by frontend/src/lib/seo.ts's absoluteUrl()
def _abs_url(path_or_url):
    if not path_or_url:
        return None
    return path_or_url if path_or_url.startswith("http") else f"{SITE_URL}{path_or_url}"


# Mirrors ModelPage.tsx's seoDesc computation exactly
def _truncate_description(raw, fallback):
    cleaned = re.sub(r"\s+", " ", (raw or "")).strip()
    if not cleaned:
        return fallback
    return f"{cleaned[:157]}..." if len(cleaned) > 160 else cleaned


def _fetch_template():
    try:
        resp = requests.get(WEB_URL + "/", timeout=10)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        logger.warning(f"Не удалось получить шаблон index.html с {WEB_URL}: {e}")
        return None


def _patch_head_html(template: str, *, title: str, description: str, path: str,
                      image: str | None, jsonld: dict | None) -> str:
    url = _abs_url(path)
    title_esc = html.escape(title)
    desc_esc = html.escape(description)

    out = re.sub(r"<title>.*?</title>", lambda _m: f"<title>{title_esc}</title>", template, count=1, flags=re.S)
    out = re.sub(
        r'<meta name="description" content="[^"]*"\s*/?>',
        lambda _m: f'<meta name="description" content="{desc_esc}" />',
        out, count=1,
    )
    out = re.sub(
        r'<link rel="canonical" href="[^"]*"\s*/?>',
        lambda _m: f'<link rel="canonical" href="{html.escape(url)}" />',
        out, count=1,
    )
    og_replacements = {
        "og:title": title_esc,
        "og:description": desc_esc,
        "og:type": "product" if path.startswith("/model/") else "website",
        "og:url": html.escape(url),
    }
    for prop, value in og_replacements.items():
        out = re.sub(
            rf'<meta property="{re.escape(prop)}" content="[^"]*"\s*/?>',
            lambda _m, v=value: f'<meta property="{prop}" content="{v}" />',
            out, count=1,
        )
    abs_image = _abs_url(image)
    if abs_image:
        out = re.sub(
            r'<meta property="og:image" content="[^"]*"\s*/?>',
            lambda _m: f'<meta property="og:image" content="{html.escape(abs_image)}" />',
            out, count=1,
        )
    twitter_card = "summary_large_image" if abs_image else "summary"
    out = re.sub(
        r'<meta name="twitter:card" content="[^"]*"\s*/?>',
        lambda _m: f'<meta name="twitter:card" content="{twitter_card}" />',
        out, count=1,
    )

    if jsonld:
        script_tag = f'<script type="application/ld+json" id="seo-jsonld">{json.dumps(jsonld, ensure_ascii=False)}</script>\n  </head>'
        out = re.sub(r"</head>", lambda _m: script_tag, out, count=1)

    return out


def generate_model_snapshots():
    """Static-SEO snapshot for every /model/<code> page — see module docstring above."""
    template = _fetch_template()
    if template is None:
        logger.warning("Пропускаю генерацию SEO-снапшотов моделей (нет шаблона).")
        return

    try:
        resp = requests.get(f"{BACKEND_URL}/api/models", timeout=15)
        resp.raise_for_status()
        codes = [m["code"] for m in resp.json().get("models", [])]
    except Exception as e:
        logger.error(f"Не удалось получить список моделей для SEO-снапшотов: {e}")
        return

    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    written = set()

    for code in codes:
        try:
            r = requests.get(f"{BACKEND_URL}/api/models/{code}", timeout=15)
            if r.status_code != 200:
                continue
            m = r.json()
            variants = m.get("variants") or []
            image = variants[0].get("image_url") if variants else None
            seo_desc = _truncate_description(
                m.get("description_ru"),
                f"{m['name_ru']} — купить в Ташкенте. SR Lux, официальный дистрибьютор систем отопления в Узбекистане.",
            )
            # price_uzs is a Decimal field — pydantic v2 serializes it to a
            # JSON *string* (to preserve precision), not a number, so it must
            # be coerced before any numeric comparison (bit every single
            # model with a bare `> 0` in testing: "'>' not supported between
            # instances of 'str' and 'int'").
            prices = [float(v["price_uzs"]) for v in variants if float(v.get("price_uzs") or 0) > 0]
            in_stock = any((v.get("stock") or 0) > 0 for v in variants)

            jsonld = {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": m["name_ru"],
                "description": seo_desc,
                "brand": {"@type": "Brand", "name": "SR Lux"},
            }
            abs_image = _abs_url(image)
            if abs_image:
                jsonld["image"] = abs_image
            if prices:
                jsonld["offers"] = {
                    "@type": "AggregateOffer",
                    "priceCurrency": "UZS",
                    "lowPrice": min(prices),
                    "highPrice": max(prices),
                    "offerCount": len(variants),
                    "availability": "https://schema.org/InStock" if in_stock else "https://schema.org/OutOfStock",
                }

            html_out = _patch_head_html(
                template,
                title=f"{m['name_ru']} — SR Lux",
                description=seo_desc,
                path=f"/model/{code}",
                image=image,
                jsonld=jsonld,
            )
            (SNAPSHOT_DIR / f"{code}.html").write_text(html_out, encoding="utf-8")
            written.add(f"{code}.html")
        except Exception as e:
            logger.warning(f"SEO-снапшот для модели {code} не сгенерирован: {e}")

    # Снапшоты для моделей, которые больше не существуют (переименованы/сняты
    # с продажи) — иначе nginx продолжил бы отдавать устаревшую карточку
    # вместо актуального 404/фолбэка на SPA. Guarded: only prune when we
    # actually wrote a reasonable share of `codes` — if something upstream
    # failed part-way (or a concurrent run raced this one despite the lock
    # above), `written` being empty/tiny must never be read as "everything
    # else is stale", or it wipes out good snapshots from a previous run.
    stale = 0
    if codes and len(written) >= max(1, len(codes) // 2):
        for f in SNAPSHOT_DIR.glob("*.html"):
            if f.name not in written:
                f.unlink()
                stale += 1
    elif codes:
        logger.warning(
            f"Пропускаю очистку устаревших снапшотов: успешно сгенерировано только "
            f"{len(written)} из {len(codes)} моделей."
        )

    logger.info(f"SEO-снапшоты моделей: {len(written)} сгенерировано, {stale} устаревших удалено.")


def generate_category_snapshots():
    """Static-SEO snapshot for every /catalog?cat=<id> page.

    Same pattern as generate_model_snapshots(): the SPA sets <link
    rel="canonical"> client-side only, so Googlebot's initial (unrendered)
    fetch of /catalog?cat=<id> was seeing index.html's hardcoded canonical
    (the homepage URL) instead of the category's own URL — Search Console
    flagged this as "Alternate page with proper canonical tag" for all
    catalog pages (see fix commit for details). Query-string routes can't
    be matched by nginx `location` on path alone, so this writes one file
    per category id and nginx selects it via $arg_cat.
    """
    template = _fetch_template()
    if template is None:
        logger.warning("Пропускаю генерацию SEO-снапшотов категорий (нет шаблона).")
        return

    try:
        resp = requests.get(f"{BACKEND_URL}/api/categories", timeout=15)
        resp.raise_for_status()
        categories = resp.json()
    except Exception as e:
        logger.error(f"Не удалось получить список категорий для SEO-снапшотов: {e}")
        return

    CATEGORY_SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    written = set()

    for cat in categories:
        try:
            cat_id = cat["id"]
            name = cat["name_ru"]
            title = f"{name} — купить в Ташкенте | SR Lux"
            description = (
                f"{name} в каталоге SR Lux — купить в Ташкенте. "
                "Официальный дистрибьютор систем отопления и климат-контроля в Узбекистане."
            )
            html_out = _patch_head_html(
                template,
                title=title,
                description=description,
                path=f"/catalog?cat={cat_id}",
                image=None,
                jsonld=None,
            )
            (CATEGORY_SNAPSHOT_DIR / f"{cat_id}.html").write_text(html_out, encoding="utf-8")
            written.add(f"{cat_id}.html")
        except Exception as e:
            logger.warning(f"SEO-снапшот для категории {cat.get('id')} не сгенерирован: {e}")

    # Same guarded-prune pattern as generate_model_snapshots(): only remove
    # files for categories that no longer exist once we're confident this
    # run actually saw most of the category list (not a partial failure).
    stale = 0
    if categories and len(written) >= max(1, len(categories) // 2):
        for f in CATEGORY_SNAPSHOT_DIR.glob("*.html"):
            if f.name not in written:
                f.unlink()
                stale += 1
    elif categories:
        logger.warning(
            f"Пропускаю очистку устаревших снапшотов категорий: успешно сгенерировано только "
            f"{len(written)} из {len(categories)}."
        )

    logger.info(f"SEO-снапшоты категорий: {len(written)} сгенерировано, {stale} устаревших удалено.")


def generate_static_snapshots():
    """Static-SEO snapshot for the handful of static content pages."""
    template = _fetch_template()
    if template is None:
        logger.warning("Пропускаю генерацию SEO-снапшотов статических страниц (нет шаблона).")
        return

    STATIC_SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

    pages = [
        {
            "file": "home.html",
            "path": "/",
            "title": "SR Lux — Премиальные системы отопления и климат-контроля",
            "description": "Дизайнерские радиаторы, полотенцесушители и Wi-Fi термостаты SR Lux — премиальные решения для дома и объекта",
            "image": "/public_assets/logo-horizontal.png",
            "jsonld": {
                "@context": "https://schema.org",
                "@type": "Organization",
                "name": "SR Lux",
                "url": SITE_URL,
                "logo": f"{SITE_URL}/public_assets/logo-horizontal.png",
                "description": "Официальный дистрибьютор систем отопления и климат-контроля в Узбекистане.",
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": "Рынок «Строй мир», ул. Уста Ширин",
                    "addressLocality": "Ташкент",
                    "addressRegion": "Ташкент",
                    "postalCode": "100057",
                    "addressCountry": "UZ",
                },
                "telephone": "+998951854797",
            },
        },
        {
            "file": "about.html",
            "path": "/about",
            "title": "О компании — SR Lux",
            "description": "SR Lux — официальный дистрибьютор систем отопления и климат-контроля в Узбекистане: дизайнерские радиаторы, полотенцесушители, Wi-Fi термостаты.",
            "image": None,
            "jsonld": None,
        },
        {
            "file": "contacts.html",
            "path": "/contacts",
            "title": "Контакты — SR Lux",
            "description": "Свяжитесь с SR Lux: телефон, WhatsApp, адрес шоурума в Ташкенте, режим работы.",
            "image": None,
            "jsonld": None,
        },
        {
            "file": "delivery.html",
            "path": "/delivery",
            "title": "Доставка и оплата — SR Lux",
            "description": "Условия доставки и оплаты систем отопления SR Lux по Ташкенту и Узбекистану.",
            "image": None,
            "jsonld": None,
        },
        {
            "file": "returns.html",
            "path": "/returns",
            "title": "Возврат товара — SR Lux",
            "description": "Возврат товара с браком — бесплатно для покупателя. Условия для Узбекистана и Казахстана.",
            "image": None,
            "jsonld": None,
        },
    ]

    for page in pages:
        try:
            html_out = _patch_head_html(
                template,
                title=page["title"],
                description=page["description"],
                path=page["path"],
                image=page["image"],
                jsonld=page["jsonld"],
            )
            (STATIC_SNAPSHOT_DIR / page["file"]).write_text(html_out, encoding="utf-8")
        except Exception as e:
            logger.warning(f"SEO-снапшот для {page['path']} не сгенерирован: {e}")

    logger.info(f"SEO-снапшоты статических страниц: {len(pages)} сгенерировано.")


def main():
    logger.info("=== Запуск синхронизации SR Lux ↔ Dolibarr ===")
    logger.info(f"Валюта Dolibarr: {DOLIBARR_DEFAULT_CURRENCY}")

    if not wait_for_backend():
        logger.error("Бэкенд недоступен. Прерываем синхронизацию.")
        sys.exit(1)

    usd_rate = get_usd_rate()
    logger.info(f"Курс USD/UZS: {usd_rate}")

    # 1. Синхронизируем категории — они должны быть в DB до товаров
    categories_map = fetch_categories()
    logger.info(f"Загружено категорий из Dolibarr: {len(categories_map)}")
    sync_categories_to_backend(categories_map)

    # 2. Загружаем все товары
    raw_products = fetch_all_products()
    logger.info(f"Итого товаров из Dolibarr: {len(raw_products)}")

    if not raw_products:
        logger.warning("Dolibarr вернул 0 товаров. Прерываем синхронизацию.")
        return

    # 3. Строим карту родительских товаров для fallback фото/описания
    parent_map = build_parent_map(raw_products)

    # 4. Определяем модельные группы из структуры Dolibarr (label = "REF/alias — desc")
    alias_map, model_card_ids = build_model_map(raw_products)

    # 4b. Реальная привязка товар→категория из Dolibarr (у большинства товаров
    # категория не приходит прямо в /products, поэтому запрашиваем отдельно)
    product_to_cat = fetch_product_categories(raw_products)

    # 5. Импортируем товары
    payload = build_payload(
        raw_products, categories_map, product_to_cat, usd_rate,
        parent_map=parent_map,
        alias_map=alias_map,
        model_card_ids=model_card_ids,
    )
    send_to_backend(payload)

    # 5b. «Трап» (entity=2) — независимый второй проход. Отдельный try/except
    # (в дополнение к тем, что уже внутри sync_entity2/send_entity2_products)
    # гарантирует: что бы тут ни случилось, уже закоммиченная синхронизация
    # радиаторов (entity=1) выше — и SEO-снапшоты ниже — не пострадают.
    try:
        sync_entity2(usd_rate)
    except Exception as e:
        logger.error(f"«Трап» (entity=2): синхронизация упала: {e}")

    # 6. Статические SEO-снапшоты (title/description/OG/JSON-LD per page) —
    # не должно валить синк товаров, если недоступен фронтенд-контейнер и т.п.
    try:
        generate_model_snapshots()
        generate_category_snapshots()
        generate_static_snapshots()
    except Exception as e:
        logger.error(f"Генерация SEO-снапшотов упала: {e}")

    logger.info("=== Синхронизация завершена ===")


if __name__ == "__main__":
    lock_file = open(LOCK_PATH, "w")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        logger.warning("Другой запуск синхронизации уже выполняется — пропускаю.")
        sys.exit(0)
    try:
        main()
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()
