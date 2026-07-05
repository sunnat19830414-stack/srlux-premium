#!/usr/bin/env python3
"""
diag_dolibarr_structure.py — Диагностика структуры товаров в Dolibarr.
Показывает сколько родителей, сколько детей, сколько «одиночек».

Запуск на сервере:
  docker compose exec -T api python diag_dolibarr_structure.py
"""

import os
import sys
from collections import defaultdict

import requests

DOLIBARR_URL = os.getenv("DOLIBARR_API_URL", "https://bollente.uz/api/index.php/").rstrip("/")
DOLIBARR_KEY = os.getenv("DOLIBARR_API_KEY", "")
HEADERS = {"DOLAPIKEY": DOLIBARR_KEY}
PAGE_SIZE = 100


def fetch_all_products() -> list:
    products = []
    page = 0
    while True:
        resp = requests.get(
            f"{DOLIBARR_URL}/products",
            headers=HEADERS,
            params={"limit": PAGE_SIZE, "page": page, "sortfield": "rowid", "sortorder": "ASC"},
            timeout=30,
        )
        if resp.status_code != 200:
            print(f"[ОШИБКА] GET /products страница {page}: {resp.status_code} {resp.text[:200]}")
            break
        batch = resp.json()
        if not isinstance(batch, list) or not batch:
            break
        products.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        page += 1
        print(f"  Загружено: {len(products)} товаров...", end="\r")
    return products


def main():
    if not DOLIBARR_KEY:
        print("[ОШИБКА] DOLIBARR_API_KEY не задан.")
        sys.exit(1)

    print(f"Подключаемся к {DOLIBARR_URL} ...")
    products = fetch_all_products()
    print(f"\nВсего товаров в Dolibarr: {len(products)}")

    # Индексируем по ID
    by_id = {int(p["id"]): p for p in products}

    parents = []       # fk_product_parent == 0 / null, и КТО-ТО ссылается на них
    children = []      # fk_product_parent != 0
    standalone = []    # fk_product_parent == 0, и никто не ссылается

    # Кто является дочерним
    child_parent_ids = set()
    for p in products:
        pid = p.get("fk_product_parent") or "0"
        if str(pid) not in ("0", "", "null", "None"):
            child_parent_ids.add(int(pid))

    # Строим дерево: parent_id → [children]
    tree = defaultdict(list)
    for p in products:
        pid = p.get("fk_product_parent") or "0"
        if str(pid) not in ("0", "", "null", "None"):
            children.append(p)
            tree[int(pid)].append(p)
        else:
            prod_id = int(p["id"])
            if prod_id in child_parent_ids:
                parents.append(p)
            else:
                standalone.append(p)

    # ── Сводка ──────────────────────────────────────────────────────────────
    print("\n" + "═" * 60)
    print("СВОДКА")
    print("═" * 60)
    print(f"  Родительские товары (модели):    {len(parents):>4}")
    print(f"  Дочерние товары (варианты):      {len(children):>4}")
    print(f"  Одиночные товары (без иерархии): {len(standalone):>4}")
    print(f"  ИТОГО:                           {len(products):>4}")

    # ── Дерево родитель → дети ───────────────────────────────────────────────
    print("\n" + "═" * 60)
    print("РОДИТЕЛЬСКИЕ МОДЕЛИ И ИХ ВАРИАНТЫ")
    print("═" * 60)
    for parent in sorted(parents, key=lambda p: p.get("ref", "")):
        pid = int(parent["id"])
        kids = tree.get(pid, [])
        has_photo = bool(parent.get("image_url") or parent.get("photo"))
        photo_mark = "📷" if has_photo else "  "
        print(f"\n{photo_mark} [{pid}] {parent.get('ref','')} — {parent.get('label','')}")
        print(f"    статус={parent.get('status','?')} цена={parent.get('price','?')} кат={parent.get('fk_product_category','?')}")
        for kid in sorted(kids, key=lambda k: k.get("ref", "")):
            kid_photo = bool(kid.get("image_url") or kid.get("photo"))
            kphoto = "📷" if kid_photo else "  "
            print(f"  {kphoto}  └─ [{kid['id']}] {kid.get('ref','')} — {kid.get('label','')}")

    # ── Одиночные ────────────────────────────────────────────────────────────
    print("\n" + "═" * 60)
    print(f"ОДИНОЧНЫЕ ТОВАРЫ ({len(standalone)} шт.) — без родителя и без детей")
    print("═" * 60)
    for p in sorted(standalone, key=lambda p: p.get("ref", "")):
        has_photo = bool(p.get("image_url") or p.get("photo"))
        photo_mark = "📷" if has_photo else "  "
        print(f"  {photo_mark} [{p['id']}] {p.get('ref','')} — {p.get('label','')} (статус={p.get('status','?')})")

    # ── Проблемы ─────────────────────────────────────────────────────────────
    print("\n" + "═" * 60)
    print("ВОЗМОЖНЫЕ ПРОБЛЕМЫ")
    print("═" * 60)

    # Дети, чей родитель не найден в выгрузке
    orphans = [p for p in children if int(p.get("fk_product_parent", 0)) not in by_id]
    if orphans:
        print(f"\n  Дети без родителя в выгрузке ({len(orphans)} шт.):")
        for p in orphans:
            print(f"    [{p['id']}] {p.get('ref','')} → fk_product_parent={p.get('fk_product_parent')}")
    else:
        print("  Детей с отсутствующим родителем: нет ✓")

    # Родители без детей (аномалия)
    childless_parents = [p for p in parents if not tree.get(int(p["id"]))]
    if childless_parents:
        print(f"\n  Родители без дочерних товаров ({len(childless_parents)} шт.):")
        for p in childless_parents:
            print(f"    [{p['id']}] {p.get('ref','')} — {p.get('label','')}")

    # Дублирующиеся ref
    refs = [p.get("ref", "") for p in products]
    dup_refs = [r for r in set(refs) if refs.count(r) > 1]
    if dup_refs:
        print(f"\n  Дублирующиеся артикулы (ref): {dup_refs}")
    else:
        print("  Дублирующихся артикулов: нет ✓")

    print("\n" + "═" * 60)
    print("Готово.")


if __name__ == "__main__":
    main()
