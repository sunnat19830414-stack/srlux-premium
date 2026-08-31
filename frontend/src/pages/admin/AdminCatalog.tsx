import { Camera, ChevronDown, Download, ImageOff, Loader2, Star, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category } from '../../api/client'
import { fetchCategories } from '../../api/client'
import type { CatalogModel, CatalogSettings } from '../../api/adminClient'
import {
  adminDeleteCatalogPhoto,
  adminGenerateCatalog,
  adminGetCatalogSettings,
  adminListCatalogModels,
  adminSetCatalogPhotoPrimary,
  adminUpdateCatalogSettings,
  adminUploadCatalogLogo,
  adminUploadCatalogPhoto,
} from '../../api/adminClient'
import { useToast } from '../../contexts/ToastContext'

const fmtUsd = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`

interface CatNode extends Category {
  children: CatNode[]
}

function buildTree(categories: Category[]): CatNode[] {
  const byId = new Map<number, CatNode>(categories.map((c) => [c.id, { ...c, children: [] }]))
  const roots: CatNode[] = []
  byId.forEach((node) => {
    if (node.parent_id && byId.has(node.parent_id)) byId.get(node.parent_id)!.children.push(node)
    else roots.push(node)
  })
  const sortRec = (nodes: CatNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order || a.name_ru.localeCompare(b.name_ru))
    nodes.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

function collectDescendants(categories: Category[], rootId: number): Set<number> {
  const childrenOf = new Map<number, number[]>()
  categories.forEach((c) => {
    if (c.parent_id != null) childrenOf.set(c.parent_id, [...(childrenOf.get(c.parent_id) ?? []), c.id])
  })
  const ids = new Set<number>([rootId])
  const stack = [rootId]
  while (stack.length) {
    const cur = stack.pop()!
    for (const childId of childrenOf.get(cur) ?? []) {
      if (!ids.has(childId)) { ids.add(childId); stack.push(childId) }
    }
  }
  return ids
}

function CategoryTree({ nodes, depth, selectedIds, onToggleSelect, expanded, onToggle }: {
  nodes: CatNode[]
  depth: number
  selectedIds: Set<number>
  onToggleSelect: (id: number) => void
  expanded: Set<number>
  onToggle: (id: number) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0
        const isExpanded = expanded.has(node.id)
        const isSelected = selectedIds.has(node.id)
        return (
          <div key={node.id}>
            <div
              style={{ paddingLeft: `${8 + depth * 14}px` }}
              className={`flex items-center gap-1 pr-2 text-sm rounded-lg transition-colors ${
                isSelected ? 'bg-amber-500/15 text-amber-400 font-semibold' : 'text-gray-400 hover:text-white'
              }`}
            >
              {hasChildren ? (
                <button onClick={() => onToggle(node.id)} className="shrink-0 p-1 text-gray-500 hover:text-white">
                  <ChevronDown size={12} className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                </button>
              ) : (
                <span className="shrink-0 w-[22px]" />
              )}
              <button
                onClick={() => onToggleSelect(node.id)}
                className="flex items-center gap-2 flex-1 text-left py-1.5 truncate"
              >
                <span
                  className={`shrink-0 w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center ${
                    isSelected ? 'bg-amber-500 border-amber-500' : 'border-gray-600'
                  }`}
                >
                  {isSelected && <span className="w-1.5 h-1.5 rounded-[1px] bg-black" />}
                </span>
                <span className="truncate">{node.name_ru}</span>
              </button>
            </div>
            {hasChildren && isExpanded && (
              <CategoryTree nodes={node.children} depth={depth + 1} selectedIds={selectedIds} onToggleSelect={onToggleSelect} expanded={expanded} onToggle={onToggle} />
            )}
          </div>
        )
      })}
    </>
  )
}

function ModelPhotoCard({ model, onChanged }: { model: CatalogModel; onChanged: () => void }) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const cover = model.photos[0]?.image_url ?? model.image_url
  const alternates = model.photos.slice(1)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast('Только изображения', 'error'); return }
    if (file.size > 5 * 1024 * 1024) { toast('Файл слишком большой (макс. 5 МБ)', 'error'); return }
    setUploading(true)
    try {
      await adminUploadCatalogPhoto(model.code, file)
      toast('Фото добавлено')
      onChanged()
    } catch { toast('Ошибка загрузки', 'error') } finally { setUploading(false) }
  }

  const makePrimary = async (photoId: number) => {
    try { await adminSetCatalogPhotoPrimary(photoId); onChanged() } catch { toast('Ошибка', 'error') }
  }
  const removePhoto = async (photoId: number) => {
    try { await adminDeleteCatalogPhoto(photoId); toast('Фото удалено'); onChanged() } catch { toast('Ошибка', 'error') }
  }

  const priceLabel = model.price_usd_from
    ? model.price_usd_to && model.price_usd_to > model.price_usd_from
      ? `от ${fmtUsd(model.price_usd_from)}`
      : fmtUsd(model.price_usd_from)
    : 'цена по запросу'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
      <div className="relative h-36 bg-gray-800 flex items-center justify-center group">
        {cover ? (
          <img src={cover} alt="" className="max-w-full max-h-full object-contain" />
        ) : (
          <ImageOff size={24} className="text-gray-700" />
        )}
        {model.photos.length > 0 && (
          <span className="absolute top-1.5 left-1.5 bg-amber-500/90 text-black text-[10px] font-bold px-1.5 py-0.5 rounded">
            своё фото
          </span>
        )}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute inset-0 flex items-center justify-center bg-gray-900/0 group-hover:bg-gray-900/70 opacity-0 group-hover:opacity-100 transition-all"
        >
          {uploading
            ? <Loader2 size={18} className="text-amber-400 animate-spin" />
            : <span className="flex items-center gap-1.5 text-amber-400 text-xs font-medium"><Upload size={14} /> Загрузить фото</span>
          }
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>

      {alternates.length > 0 && (
        <div className="flex gap-1 p-1.5 bg-gray-950 overflow-x-auto">
          {alternates.map((p) => (
            <div key={p.id} className="relative shrink-0 w-9 h-9 group/alt">
              <img src={p.image_url} alt="" className="w-9 h-9 object-cover rounded border border-gray-800" />
              <div className="absolute inset-0 hidden group-hover/alt:flex bg-gray-900/80 rounded items-center justify-center gap-0.5">
                <button onClick={() => makePrimary(p.id)} title="Сделать обложкой" className="text-amber-400"><Star size={11} /></button>
                <button onClick={() => removePhoto(p.id)} title="Удалить" className="text-red-400"><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="p-3 flex flex-col flex-1">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Арт. {model.code}</p>
        <p className="text-sm text-white font-medium leading-snug mb-2 line-clamp-2">{model.name_ru}</p>
        <p className="text-amber-400 font-bold text-sm mt-auto">{priceLabel}</p>
      </div>
    </div>
  )
}

export default function AdminCatalog() {
  const { toast } = useToast()
  const [models, setModels] = useState<CatalogModel[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [settings, setSettings] = useState<CatalogSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCatIds, setSelectedCatIds] = useState<Set<number>>(new Set())
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [catalogTitle, setCatalogTitle] = useState('')
  const [cardsPerRow, setCardsPerRow] = useState(2)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([adminListCatalogModels(), fetchCategories(), adminGetCatalogSettings()])
      .then(([m, c, s]) => {
        setModels(m.data.models)
        setCategories(c.data)
        setSettings(s.data)
        setCompanyName(s.data.company_name)
        setCatalogTitle(s.data.catalog_title)
      })
      .finally(() => setLoading(false))
  }, [])

  // Re-fetch models scoped to the selected categories — some model "families"
  // (e.g. GZ2/GZ3 "Column" radiators) span both a vertical and a horizontal
  // sub-category, and the representative cover photo shown/printed depends on
  // which one(s) the caller is scoped to, so the preview must match what the
  // generated PDF will actually contain.
  const reload = (catIds: Set<number>) => {
    adminListCatalogModels(catIds.size ? Array.from(catIds) : null)
      .then((r) => setModels(r.data.models))
      .catch(() => toast('Не удалось обновить список моделей — попробуйте ещё раз', 'error'))
  }
  // Debounced: checkbox multi-select fires this on every single click, and
  // the admin API is rate-limited quite tightly (30 req/min) — selecting a
  // dozen categories in a row would otherwise blow through that limit and
  // start 429ing before the user finishes composing their selection.
  useEffect(() => {
    if (loading) return
    const t = setTimeout(() => reload(selectedCatIds), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCatIds])

  const catTree = useMemo(() => buildTree(categories), [categories])

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleCatSelect = (id: number) => {
    setSelectedCatIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const visibleModels = useMemo(() => {
    if (selectedCatIds.size === 0) return models
    const scope = new Set<number>()
    selectedCatIds.forEach((id) => collectDescendants(categories, id).forEach((d) => scope.add(d)))
    return models.filter((m) => m.category_ids.some((cid) => scope.has(cid)))
  }, [models, categories, selectedCatIds])

  const saveSettings = async () => {
    try {
      const r = await adminUpdateCatalogSettings({ company_name: companyName, catalog_title: catalogTitle })
      setSettings(r.data)
      toast('Сохранено')
    } catch { toast('Ошибка сохранения', 'error') }
  }

  const handleLogo = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast('Только изображения', 'error'); return }
    try {
      const r = await adminUploadCatalogLogo(file)
      setSettings(r.data)
      toast('Логотип обновлён')
    } catch { toast('Ошибка загрузки логотипа', 'error') }
  }

  const generate = async () => {
    setGenerating(true)
    try {
      const r = await adminGenerateCatalog(selectedCatIds.size ? Array.from(selectedCatIds) : null, cardsPerRow)
      const blob = new Blob([r.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `catalog_${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast('PDF готов')
    } catch {
      toast('Ошибка генерации — нет моделей в выбранных категориях?', 'error')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-gray-500">Загрузка…</div>
  }

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Каталог PDF</h1>
          <p className="text-sm text-gray-500 mt-1">
            Цены — розничные из Dolibarr (USD). Фото и категории — как на сайте, но фото для каталога
            можно заменить отдельно, не трогая витрину.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold text-sm transition-colors"
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {generating ? 'Генерирую…' : `Сгенерировать PDF (${visibleModels.length})`}
        </button>
      </div>

      {/* Settings */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex flex-wrap items-end gap-4">
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Логотип на обложке</p>
          <button
            onClick={() => logoInputRef.current?.click()}
            className="w-24 h-16 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center overflow-hidden hover:border-amber-500/50 transition-colors"
          >
            {settings?.logo_url
              ? <img src={settings.logo_url} alt="" className="max-w-full max-h-full object-contain p-1" />
              : <Camera size={16} className="text-gray-600" />
            }
          </button>
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleLogo(e.target.files[0])} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1.5">Название компании</label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            onBlur={saveSettings}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1.5">Заголовок каталога</label>
          <input
            value={catalogTitle}
            onChange={(e) => setCatalogTitle(e.target.value)}
            onBlur={saveSettings}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Карточек на листе</p>
          <div className="flex rounded-lg border border-gray-700 overflow-hidden">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setCardsPerRow(n)}
                className={`w-9 h-9 text-sm font-semibold transition-colors ${
                  cardsPerRow === n ? 'bg-amber-500 text-black' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Category picker */}
        <aside className="w-60 shrink-0">
          <div className="sticky top-6 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-gray-800 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Категории</p>
              {selectedCatIds.size > 0 && (
                <button
                  onClick={() => setSelectedCatIds(new Set())}
                  className="text-[11px] text-gray-500 hover:text-white transition-colors"
                >
                  Сбросить ({selectedCatIds.size})
                </button>
              )}
            </div>
            <div className="py-1.5 px-1">
              <button
                onClick={() => setSelectedCatIds(new Set())}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm mb-1 transition-colors ${
                  selectedCatIds.size === 0 ? 'bg-amber-500/15 text-amber-400 font-semibold' : 'text-gray-400 hover:text-white'
                }`}
              >
                Весь каталог
              </button>
              <CategoryTree nodes={catTree} depth={0} selectedIds={selectedCatIds} onToggleSelect={toggleCatSelect} expanded={expanded} onToggle={toggleExpand} />
            </div>
          </div>
        </aside>

        {/* Models grid */}
        <div className="flex-1 min-w-0">
          {visibleModels.length === 0 ? (
            <p className="text-gray-500 text-sm py-12 text-center">Нет моделей в выбранных категориях</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleModels.map((m) => (
                <ModelPhotoCard key={m.code} model={m} onChanged={() => reload(selectedCatIds)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
