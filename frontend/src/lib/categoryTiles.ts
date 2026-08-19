import { useMemo } from 'react'
import type { Category, ModelCard } from '../api/client'

// Curated entry points into the catalog — the handful of product lines a
// first-time visitor actually recognises, not the full 9-branch sidebar
// tree (Push-фитинги/Гидравлические разделители etc. are accessories that
// belong inside the catalog, not on the front door). Shared between
// HomePage and CatalogPage so both surfaces agree on the same six tiles
// and the same cover photo per tile.
//
// 60 = «Трап» (id in *this* Postgres `categories` table, from
// `SELECT id FROM categories WHERE dolibarr_id=51` after the entity=2 sync —
// not the Dolibarr rowid itself, those are two different numbering spaces).
// One tile for the whole root (not one per subcategory), per product
// decision — same pattern as "Радиаторы" already being one tile covering
// its Вертикальные/Горизонтальные sub-branches.
//
// 64 = «Конвекторы» — manually-created category (dolibarr_id NULL, not from
// any sync), same one-tile-per-root treatment as «Трап».
export const FEATURED_CATEGORY_IDS = [1, 16, 12, 20, 13, 15, 60, 64]

// Auto-picking "whichever model happens to sit directly on this root
// category" landed on an accessory (a radiator fan) for Запорная
// арматура and a decorative cast-iron close-up for Радиаторы. And a
// model's own aggregated cover photo is the same across every category
// branch it spans — so GZ2/GZ3/JD6812/JDC22 (each sold as both a tall
// vertical and a short horizontal radiator) showed the IDENTICAL photo
// under both "Вертикальные" and "Горизонтальные", which is wrong for
// whichever branch didn't match that photo's actual orientation (confirmed
// 2026-07-14 by comparing real height_mm per branch: ~1800mm = vertical,
// ~300-600mm = horizontal). Pin a literal, visually-verified photo per
// branch instead of letting the aggregate pick one arbitrarily.
//
// The "_tile" files (ids 1, 12, 13, 15, 20, 49) are dedicated small WebP
// copies, not the product's own full-size photo — PageSpeed flagged these
// exact tiles for serving an 800-1024px original into a ~333-515px CSS box
// (confirmed 2026-07-14). The full-size original stays untouched at the
// product's own /model or /product page, which shows it much larger.
export const TILE_IMAGE_OVERRIDE: Record<number, string> = {
  1: '/static/uploads/dol_2385_tile.webp',
  12: '/static/uploads/dol_2381_tile.webp',
  13: '/static/uploads/dol_2375_tile.webp',
  15: '/static/uploads/dol_2352_tile.webp',
  20: '/static/uploads/dol_2419_tile.webp',
  // Радиаторы → Вертикальные / Горизонтальные (root branches)
  39: '/static/uploads/dol_2231.jpg',
  40: '/static/uploads/dol_2239.jpg',
  // 2-колонные (GZ2)
  42: '/static/uploads/dol_2231.jpg',
  43: '/static/uploads/dol_2239.jpg',
  // 3-колонные (GZ3)
  45: '/static/uploads/dol_2269.jpg',
  46: '/static/uploads/dol_2276.jpg',
  // Плоские 68×12 (JD6812)
  47: '/static/uploads/dol_2291_2a3b7ad0bd.jpg',
  48: '/static/uploads/dol_2301_5fea0d5766.jpg',
  // Стальной панельный (JDC22)
  49: '/static/uploads/dol_2385_tile.webp',
  50: '/static/uploads/dol_2539_645c1f9de4.jpg',
}

export interface CategoryTile {
  rootId: number
  cat: Category | undefined
  image: string | null
  count: number
}

export function useCategoryTiles(categories: Category[], models: ModelCard[]): CategoryTile[] {
  // Every descendant (inclusive) of each featured root category, so a tile
  // for "Радиаторы" matches models filed under any of its Вертикальные/
  // Горизонтальные/... sub-branches, not just ones linked to the root itself.
  const descendantsByRoot = useMemo(() => {
    const childrenOf = new Map<number, number[]>()
    categories.forEach((c) => {
      if (c.parent_id != null) {
        childrenOf.set(c.parent_id, [...(childrenOf.get(c.parent_id) ?? []), c.id])
      }
    })
    const result = new Map<number, Set<number>>()
    for (const rootId of FEATURED_CATEGORY_IDS) {
      const ids = new Set<number>([rootId])
      const stack = [rootId]
      while (stack.length) {
        const cur = stack.pop()!
        for (const childId of childrenOf.get(cur) ?? []) {
          if (!ids.has(childId)) {
            ids.add(childId)
            stack.push(childId)
          }
        }
      }
      result.set(rootId, ids)
    }
    return result
  }, [categories])

  return useMemo(() => {
    return FEATURED_CATEGORY_IDS.map((rootId) => {
      const cat = categories.find((c) => c.id === rootId)
      const ids = descendantsByRoot.get(rootId)
      const overrideImage = TILE_IMAGE_OVERRIDE[rootId]
      const cover = ids
        ? models.find((m) => m.image_url && m.category_ids.some((cid) => ids.has(cid)))
        : undefined
      const count = ids ? models.filter((m) => m.category_ids.some((cid) => ids.has(cid))).length : 0
      return { rootId, cat, image: overrideImage ?? cover?.image_url ?? null, count }
    }).filter((t) => t.cat)
  }, [categories, models, descendantsByRoot])
}
