import { ChevronDown, ChevronLeft, ChevronRight, ListFilter, Package, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ModelCard, Category } from '../api/client'
import { fetchModels, fetchCategories } from '../api/client'
import ModelCardComponent from '../components/ModelCard'
import { useLocale } from '../contexts/LocaleContext'
import { TILE_IMAGE_OVERRIDE } from '../lib/categoryTiles'
import { organizationJsonLd, setSeo } from '../lib/seo'

interface CatNode extends Category {
  children: CatNode[]
}

function buildTree(categories: Category[]): CatNode[] {
  const byId = new Map<number, CatNode>(categories.map((c) => [c.id, { ...c, children: [] }]))
  const roots: CatNode[] = []
  byId.forEach((node) => {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  const sortRec = (nodes: CatNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order || a.name_ru.localeCompare(b.name_ru))
    nodes.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

function CategoryTree({
  nodes, depth, selectedCatId, onSelect, lang, expandedIds, onToggle,
}: {
  nodes: CatNode[]
  depth: number
  selectedCatId: number | null
  onSelect: (id: number) => void
  lang: 'ru' | 'uz'
  expandedIds: Set<number>
  onToggle: (id: number) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0
        const isExpanded = expandedIds.has(node.id)
        return (
          <li key={node.id}>
            <div
              style={{ paddingLeft: `${16 + depth * 14}px` }}
              className={`w-full flex items-center gap-1 pr-2 text-sm transition-colors ${
                selectedCatId === node.id
                  ? 'text-gold bg-gold/5 border-r-2 border-gold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {hasChildren ? (
                <button
                  onClick={() => onToggle(node.id)}
                  className="shrink-0 p-1 -ml-1 text-gray-500 hover:text-gold"
                  aria-label={isExpanded ? 'Свернуть' : 'Развернуть'}
                >
                  <ChevronDown
                    size={13}
                    className={`transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                  />
                </button>
              ) : (
                <span className="shrink-0 w-[21px]" />
              )}
              <button
                onClick={() => onSelect(node.id)}
                className="flex-1 flex items-center gap-3 py-2.5 text-left min-w-0"
              >
                <Package size={depth === 0 ? 15 : 12} className="shrink-0" />
                <span className="truncate">{lang === 'uz' ? (node.name_uz || node.name_ru) : node.name_ru}</span>
              </button>
            </div>
            {hasChildren && isExpanded && (
              <ul>
                <CategoryTree
                  nodes={node.children}
                  depth={depth + 1}
                  selectedCatId={selectedCatId}
                  onSelect={onSelect}
                  lang={lang}
                  expandedIds={expandedIds}
                  onToggle={onToggle}
                />
              </ul>
            )}
          </li>
        )
      })}
    </>
  )
}

export default function CatalogPage() {
  const { t, lang } = useLocale()
  const [allModels, setAllModels] = useState<ModelCard[]>([])
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [loading, setLoading]     = useState(true)
  const navigate = useNavigate()
  // Current category lives in the URL path (/catalog/<slug>), not useState —
  // otherwise pressing the browser Back button after opening a product
  // remounts CatalogPage with no memory of which category was selected,
  // dumping the customer back at "Все категории" instead of the
  // subcategory list they came from. A single slug segment is enough to
  // identify any node regardless of tree depth (slugs are unique across
  // the whole categories table — see backend crud._unique_slug), so there's
  // no need to separately track a multi-level drill path: whether the
  // resolved category is a branch (show its children as tiles) or a leaf
  // (show the product grid) is derived below from the category tree itself.
  const { slug } = useParams<{ slug?: string }>()
  const [searchParams] = useSearchParams()
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)

  const currentCat = useMemo(
    () => (slug ? allCategories.find((c) => c.slug === slug) : undefined),
    [slug, allCategories],
  )
  const hasChildren = useMemo(() => {
    const parentIds = new Set(allCategories.filter((c) => c.parent_id != null).map((c) => c.parent_id))
    return (id: number) => parentIds.has(id)
  }, [allCategories])
  // Sidebar + product grid only ever show once a *leaf* category has been
  // reached (same rule the old id-based selectedCatId used) — a branch
  // category's own URL shows the tile picker for its children instead, so
  // every drill level (Радиаторы → Вертикальные → 2-колонные) gets its own
  // real, bookmarkable URL and its own browser-history entry.
  const isLeafSelected = currentCat != null && !hasChildren(currentCat.id)
  const selectedCatId = isLeafSelected ? currentCat!.id : null

  // Legacy `/catalog?cat=<id>` links (already indexed by Google before this
  // switch to slugs) still resolve — a soft client-side redirect to the
  // canonical slug URL once categories are loaded, not a true server 301
  // (would need a backend route keyed on the numeric id ahead of the SPA
  // shell, not worth the infra for the handful of impressions these got).
  useEffect(() => {
    if (slug || allCategories.length === 0) return
    const legacyId = searchParams.get('cat')
    if (!legacyId) return
    const cat = allCategories.find((c) => c.id === Number(legacyId))
    if (cat) navigate(`/catalog/${cat.slug}`, { replace: true })
  }, [slug, searchParams, allCategories, navigate])

  const goToCategoryId = (id: number) => {
    const cat = allCategories.find((c) => c.id === id)
    if (cat) navigate(`/catalog/${cat.slug}`)
  }

  useEffect(() => {
    Promise.all([fetchModels(), fetchCategories()])
      .then(([modelsRes, catsRes]) => {
        setAllModels(modelsRes.data.models)
        setAllCategories(catsRes.data)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const label = currentCat ? (lang === 'uz' ? (currentCat.name_uz || currentCat.name_ru) : currentCat.name_ru) : null
    setSeo({
      title: label ? `${label} — SR Lux` : 'SR Lux — Премиальные системы отопления и климат-контроля',
      description: label ? `${label} — каталог SR Lux. ${t.heroSubtitle}` : t.heroSubtitle,
      path: currentCat ? `/catalog/${currentCat.slug}` : '/catalog',
      image: '/public_assets/logo-horizontal.png',
      type: 'website',
      jsonLd: organizationJsonLd(),
    })
  }, [lang, t.heroSubtitle, currentCat])

  const catTree = useMemo(() => buildTree(allCategories), [allCategories])

  // All descendant ids (inclusive) of a given category, used so selecting a
  // parent node (e.g. "Радиаторы" or "Вертикальные") shows every model filed
  // under any of its sub-categories, not just ones linked to it directly.
  const descendantIds = useMemo(() => {
    const childrenOf = new Map<number, number[]>()
    allCategories.forEach((c) => {
      if (c.parent_id != null) {
        childrenOf.set(c.parent_id, [...(childrenOf.get(c.parent_id) ?? []), c.id])
      }
    })
    return (rootId: number): Set<number> => {
      const result = new Set<number>([rootId])
      const stack = [rootId]
      while (stack.length) {
        const cur = stack.pop()!
        for (const childId of childrenOf.get(cur) ?? []) {
          if (!result.has(childId)) {
            result.add(childId)
            stack.push(childId)
          }
        }
      }
      return result
    }
  }, [allCategories])

  // The tile grid currently on screen: root categories at /catalog, or the
  // children of currentCat once its slug identifies a branch category.
  const currentTileNodes = useMemo(() => {
    if (!currentCat) return catTree
    const stack = [...catTree]
    while (stack.length) {
      const node = stack.pop()!
      if (node.id === currentCat.id) return node.children
      stack.push(...node.children)
    }
    return catTree
  }, [catTree, currentCat])

  const currentTiles = useMemo(() => {
    return currentTileNodes.map((node) => {
      const ids = descendantIds(node.id)
      const overrideImage = TILE_IMAGE_OVERRIDE[node.id]
      const cover = allModels.find((m) => m.image_url && m.category_ids.some((cid) => ids.has(cid)))
      const count = allModels.filter((m) => m.category_ids.some((cid) => ids.has(cid))).length
      return { node, image: overrideImage ?? cover?.image_url ?? null, count }
    })
  }, [currentTileNodes, allModels, descendantIds])

  // Breadcrumb trail for the tile picker — currentCat's ancestor chain
  // (inclusive), derived by walking parent_id since every node's full
  // lineage is always reconstructable from allCategories — no separate
  // drill-path state to keep in sync.
  const drillBreadcrumb = useMemo(() => {
    if (!currentCat) return []
    const byId = new Map(allCategories.map((c) => [c.id, c]))
    const chain: Category[] = []
    let cur: Category | undefined = currentCat
    while (cur) {
      chain.unshift(cur)
      cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined
    }
    return chain
  }, [currentCat, allCategories])

  // Navigating to a branch's own slug shows its children as tiles (see
  // isLeafSelected above); navigating to a leaf's slug shows the product
  // grid — CatalogPage decides which from the URL alone, so every drill
  // level gets a real, bookmarkable, browser-history-tracked URL (matches
  // /catalog/<slug> being pushed, not replaced, so the phone Back button
  // undoes one level at a time — see App.tsx route and useNavigate calls
  // throughout this file, all plain pushes).
  const handleTileClick = (node: CatNode) => navigate(`/catalog/${node.slug}`)

  // Also used by the sidebar/mobile "Все категории" resets so leaving the
  // grid always lands back at the top of the tile picker, not mid-drill.
  const resetToRoot = () => navigate('/catalog')

  useEffect(() => {
    if (selectedCatId == null || allCategories.length === 0) return
    const byId = new Map(allCategories.map((c) => [c.id, c]))
    const ancestors: number[] = []
    let cur = byId.get(selectedCatId)
    while (cur?.parent_id != null) {
      ancestors.push(cur.parent_id)
      cur = byId.get(cur.parent_id)
    }
    if (ancestors.length) {
      setExpandedIds((prev) => new Set([...prev, ...ancestors]))
    }
  }, [selectedCatId, allCategories])

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const models = useMemo(() => {
    if (selectedCatId == null) return allModels
    const ids = descendantIds(selectedCatId)
    // A model can span more than one category branch (e.g. one radiator
    // design sold in both a tall/vertical and a short/horizontal size) —
    // show it under any branch that actually has one of its variants.
    return allModels.filter((m) => m.category_ids.some((cid) => ids.has(cid)))
  }, [allModels, selectedCatId, descendantIds])

  // The specific category branch the user is currently browsing, passed down
  // to each model card so its link can carry that context to the model page
  // (e.g. so a model spanning both Вертикальные/Горизонтальные only offers
  // the heights/variants that actually belong to the branch the user picked).
  const catFilterIds = useMemo(
    () => (selectedCatId == null ? null : Array.from(descendantIds(selectedCatId))),
    [selectedCatId, descendantIds],
  )

  // Label shown on the mobile "Категории" trigger button
  const selectedCategoryLabel = useMemo(() => {
    if (selectedCatId == null) return t.allCategories
    const cat = allCategories.find((c) => c.id === selectedCatId)
    if (!cat) return t.allCategories
    return lang === 'uz' ? (cat.name_uz || cat.name_ru) : cat.name_ru
  }, [selectedCatId, allCategories, lang, t.allCategories])

  // Flat top-level list used for the mobile quick-filter pills
  const topLevelCats = catTree

  return (
    <div className="min-h-screen bg-anthracite-900">
      {/* Hero */}
      <section className="relative bg-dark-gradient border-b border-gold-700/20 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-gold rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-gold-600 rounded-full blur-2xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3 leading-tight">
            {t.catalogHeroTitle}
          </h1>
          <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto">
            {t.catalogHeroSubtitle}
          </p>
        </div>
      </section>

      {/* Category tiles — big visual picker covering the whole category
          tree. Clicking a tile with subcategories drills one level deeper
          (same tile grid, for its children); clicking a leaf category (no
          subcategories) switches to the product grid below. Only shown
          while browsing "Все категории" — collapses once a leaf is reached
          so it doesn't push the filtered grid down every time. */}
      {selectedCatId === null && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
          {/* Breadcrumb + back, only once drilled below the root level */}
          {drillBreadcrumb.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5 mb-5 text-sm">
              <button
                onClick={() => {
                  const parent = drillBreadcrumb.length > 1 ? drillBreadcrumb[drillBreadcrumb.length - 2] : null
                  navigate(parent ? `/catalog/${parent.slug}` : '/catalog')
                }}
                className="flex items-center gap-1 mr-2 px-2.5 py-1 rounded-lg border border-gold-700/30 text-gold hover:bg-gold/5 transition-colors"
              >
                <ChevronLeft size={14} />
                {lang === 'uz' ? 'Orqaga' : 'Назад'}
              </button>
              <button onClick={resetToRoot} className="text-gray-400 hover:text-white transition-colors">
                {t.allCategories}
              </button>
              {drillBreadcrumb.map((cat, i) => (
                <span key={cat.id} className="flex items-center gap-1.5">
                  <ChevronRight size={12} className="text-gray-600" />
                  <button
                    onClick={() => navigate(`/catalog/${cat.slug}`)}
                    className={i === drillBreadcrumb.length - 1 ? 'text-white font-medium' : 'text-gray-400 hover:text-white transition-colors'}
                  >
                    {lang === 'uz' ? (cat.name_uz || cat.name_ru) : cat.name_ru}
                  </button>
                </span>
              ))}
            </div>
          )}
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-anthracite-800 rounded-xl h-48 animate-pulse border border-gold-700/10" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {currentTiles.map(({ node, image, count }) => (
                <button
                  key={node.id}
                  onClick={() => handleTileClick(node)}
                  className="group relative h-48 sm:h-56 rounded-xl overflow-hidden border border-gold-700/10 bg-anthracite-800 text-left"
                >
                  {image ? (
                    <img
                      src={image}
                      alt={node.name_ru}
                      className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-105 transition-all duration-300"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-anthracite-900 via-anthracite-900/40 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="text-white font-bold text-sm sm:text-lg leading-tight">
                      {lang === 'uz' ? (node.name_uz || node.name_ru) : node.name_ru}
                    </p>
                    {count > 0 && (
                      <p className="text-gray-300 text-xs mt-1">
                        {count} {lang === 'uz' ? 'model' : 'моделей'}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Catalog — sidebar + product grid, shown only once a leaf category
          is actually selected. While browsing "Все категории" the tile
          picker above is the only navigation; showing the full unfiltered
          102-model grid underneath it too was redundant clutter. */}
      {selectedCatId !== null && (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h2 className="text-2xl font-bold text-white mb-6">{selectedCategoryLabel}</h2>
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-24 bg-anthracite-800 rounded-xl border border-gold-700/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-gold-700/10">
                <p className="text-xs font-semibold text-gold uppercase tracking-wider">
                  {t.allCategories}
                </p>
              </div>
              <ul>
                <li>
                  <button
                    onClick={resetToRoot}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      selectedCatId === null
                        ? 'text-gold bg-gold/5 border-r-2 border-gold'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Package size={15} />
                    {t.allCategories}
                  </button>
                </li>
                <CategoryTree nodes={catTree} depth={0} selectedCatId={selectedCatId} onSelect={goToCategoryId} lang={lang} expandedIds={expandedIds} onToggle={toggleExpand} />
              </ul>
            </div>
          </aside>

          {/* Grid */}
          <div className="flex-1 min-w-0">
            {/* Mobile: a "Категории" trigger opens a full drill-down sheet
                (the tree can go 2-3 levels deep — Радиаторы → Вертикальные →
                2-колонные — which a flat pills row can never reach). Used to
                sit above a separate top-level pills row too, but showing
                both read as two competing, half-redundant controls — the
                sheet alone covers every level, including the top one. */}
            {topLevelCats.length > 0 && (
              <div className="lg:hidden mb-6">
                <button
                  onClick={() => setMobileSheetOpen(true)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-gold/30 bg-anthracite-800 text-sm font-medium text-gold"
                >
                  <span className="flex items-center gap-2">
                    <ListFilter size={16} />
                    {selectedCategoryLabel}
                  </span>
                  <ChevronDown size={16} />
                </button>
              </div>
            )}

            {/* Mobile category sheet — reuses the same expandable tree as the
                desktop sidebar, so behaviour (expand/collapse, selection)
                stays identical between breakpoints. */}
            {mobileSheetOpen && (
              <div className="lg:hidden fixed inset-0 z-50">
                <div
                  className="absolute inset-0 bg-black/60"
                  onClick={() => setMobileSheetOpen(false)}
                />
                <div className="absolute bottom-0 left-0 right-0 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-gold-700/20 bg-anthracite-800">
                  <div className="sticky top-0 flex items-center justify-between border-b border-gold-700/10 bg-anthracite-800 px-4 py-3">
                    <p className="text-xs font-semibold text-gold uppercase tracking-wider">
                      {t.allCategories}
                    </p>
                    <button
                      onClick={() => setMobileSheetOpen(false)}
                      className="p-1 text-gray-400 hover:text-white"
                      aria-label="Закрыть"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <ul className="pb-4">
                    <li>
                      <button
                        onClick={() => { resetToRoot(); setMobileSheetOpen(false) }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                          selectedCatId === null
                            ? 'text-gold bg-gold/5 border-r-2 border-gold'
                            : 'text-gray-300'
                        }`}
                      >
                        <Package size={15} />
                        {t.allCategories}
                      </button>
                    </li>
                    <CategoryTree
                      nodes={catTree}
                      depth={0}
                      selectedCatId={selectedCatId}
                      onSelect={(id) => { goToCategoryId(id); setMobileSheetOpen(false) }}
                      lang={lang}
                      expandedIds={expandedIds}
                      onToggle={toggleExpand}
                    />
                  </ul>
                </div>
              </div>
            )}

            {!loading && (
              <p className="text-xs text-gray-500 mb-4">
                {models.length > 0 ? `${t.modelsCount}: ${models.length}` : ''}
              </p>
            )}

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-anthracite-800 rounded-xl h-80 animate-pulse border border-gold-700/10"
                  />
                ))}
              </div>
            ) : models.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-gray-500">
                <Package size={48} className="mb-4 opacity-30" />
                <p>{t.noProducts}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-5">
                {models.map((m) => (
                  <ModelCardComponent key={m.code} model={m} catIds={catFilterIds} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
      )}
    </div>
  )
}
