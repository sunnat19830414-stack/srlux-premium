import { ArrowUpDown, Camera, ChevronDown, ChevronUp, Check, ImageOff, Loader2, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AdminCategory, AdminProduct, AdminProductList } from '../../api/adminClient'
import {
  adminAddProductPhoto,
  adminCreateProduct,
  adminDeleteProductPhoto,
  adminGetCategories,
  adminGetProducts,
  adminSetProductPhotoPrimary,
  adminUpdateProduct,
} from '../../api/adminClient'
import { useToast } from '../../contexts/ToastContext'

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n))

const stockColor = (s: number) =>
  s === 0 ? 'text-red-400 font-bold' : s < 5 ? 'text-orange-400 font-semibold' : s < 10 ? 'text-yellow-400' : 'text-green-400'

function InlineEdit({ value, onSave, type = 'text', wide = false }: {
  value: string | number; onSave: (v: string) => void; type?: string; wide?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value))
  const save = () => { if (val !== String(value)) onSave(val); setEditing(false) }
  const cancel = () => { setVal(String(value)); setEditing(false) }
  if (!editing)
    return (
      <span onClick={() => setEditing(true)}
        className="flex items-center gap-1 cursor-pointer hover:text-amber-400 group transition-colors">
        {value}
        <Pencil size={10} className="opacity-0 group-hover:opacity-40" />
      </span>
    )
  return (
    <span className="flex items-center gap-1">
      <input type={type} value={val} onChange={(e) => setVal(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
        className={`bg-gray-800 text-white rounded-lg px-2 py-0.5 text-sm border border-amber-500 focus:outline-none ${wide ? 'w-48' : 'w-28'}`}
      />
      <button onClick={save} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
      <button onClick={cancel} className="text-red-400 hover:text-red-300"><X size={14} /></button>
    </span>
  )
}

function InlineCategorySelect({ categoryId, categories, onSave }: {
  categoryId: number | null
  categories: AdminCategory[]
  onSave: (id: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const cat = categoryId ? categories.find((c) => c.id === categoryId) : null

  if (!editing)
    return (
      <span onClick={() => setEditing(true)}
        className="flex items-center gap-1 cursor-pointer group">
        {cat
          ? <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-lg group-hover:text-amber-400 transition-colors">{cat.name_ru}</span>
          : <span className="text-gray-700 text-xs group-hover:text-amber-400 transition-colors">— нет —</span>}
        <Pencil size={9} className="opacity-0 group-hover:opacity-40 text-amber-400" />
      </span>
    )

  return (
    <select
      autoFocus
      value={categoryId ?? ''}
      onChange={(e) => {
        const v = e.target.value
        onSave(v === '' ? null : Number(v))
        setEditing(false)
      }}
      onBlur={() => setEditing(false)}
      className="bg-gray-800 text-white rounded-lg px-2 py-0.5 text-xs border border-amber-500 focus:outline-none max-w-40"
    >
      <option value="">— нет —</option>
      {categories.map((c) => <option key={c.id} value={c.id}>{c.name_ru}</option>)}
    </select>
  )
}

function ProductPhotoModal({ product, onClose, onChanged }: {
  product: AdminProduct
  onClose: () => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast('Только изображения', 'error'); return }
    if (file.size > 5 * 1024 * 1024) { toast('Файл слишком большой (макс. 5 МБ)', 'error'); return }
    setUploading(true)
    try {
      await adminAddProductPhoto(product.id, file)
      toast('Фото добавлено')
      onChanged()
    } catch {
      toast('Ошибка загрузки фото', 'error')
    } finally {
      setUploading(false)
    }
  }

  const makePrimary = async (photoId: number) => {
    try { await adminSetProductPhotoPrimary(photoId); toast('Обложка обновлена'); onChanged() }
    catch { toast('Ошибка', 'error') }
  }
  const removePhoto = async (photoId: number) => {
    try { await adminDeleteProductPhoto(photoId); toast('Фото удалено'); onChanged() }
    catch { toast('Ошибка', 'error') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="text-base font-bold text-white truncate">{product.name_ru}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white shrink-0"><X size={18} /></button>
        </div>

        {product.images.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8">Фото ещё нет</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 mb-4">
            {product.images.map((p) => (
              <div key={p.id} className="relative group aspect-square">
                <img src={p.image_url} alt="" className="w-full h-full object-cover rounded-lg bg-gray-800" />
                {p.sort_order === 0 && (
                  <span className="absolute top-1 left-1 bg-amber-500 text-black text-[9px] font-bold px-1 py-0.5 rounded">
                    обложка
                  </span>
                )}
                <div className="absolute inset-0 hidden group-hover:flex bg-gray-900/80 rounded-lg items-center justify-center gap-2">
                  {p.sort_order !== 0 && (
                    <button onClick={() => makePrimary(p.id)} title="Сделать обложкой" className="text-amber-400 hover:text-amber-300">
                      <Star size={15} />
                    </button>
                  )}
                  <button onClick={() => removePhoto(p.id)} title="Удалить" className="text-red-400 hover:text-red-300">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 border border-dashed border-gray-700 hover:border-amber-500/50 rounded-lg px-3 py-2.5 text-sm text-gray-400 hover:text-amber-400 transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
          {uploading ? 'Загружаю…' : 'Добавить фото'}
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>
    </div>
  )
}

function PhotoCell({ product, onChanged }: { product: AdminProduct; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const count = product.images.length

  return (
    <>
      <button onClick={() => setOpen(true)} className="relative group w-9 h-9">
        {product.image_url ? (
          <img src={product.image_url} alt="" className="w-9 h-9 object-contain rounded-lg bg-gray-800"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-800">
            <ImageOff size={14} className="text-gray-700" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-gray-900/0 group-hover:bg-gray-900/70 opacity-0 group-hover:opacity-100 transition-all">
          <Camera size={13} className="text-amber-400" />
        </div>
        {count > 1 && (
          <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {count}
          </span>
        )}
      </button>
      {open && <ProductPhotoModal product={product} onClose={() => setOpen(false)} onChanged={onChanged} />}
    </>
  )
}

function AddProductModal({ categories, onClose, onCreated }: {
  categories: AdminCategory[]
  onClose: () => void
  onCreated: () => void
}) {
  const { toast } = useToast()
  const [sku, setSku] = useState('')
  const [nameRu, setNameRu] = useState('')
  const [nameUz, setNameUz] = useState('')
  const [descriptionRu, setDescriptionRu] = useState('')
  const [descriptionUz, setDescriptionUz] = useState('')
  const [priceUzs, setPriceUzs] = useState('')
  const [stock, setStock] = useState('0')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const valid = sku.trim() && nameRu.trim() && Number(priceUzs) > 0

  const submit = async () => {
    if (!valid) return
    setSaving(true)
    setError('')
    try {
      await adminCreateProduct({
        sku: sku.trim(),
        name_ru: nameRu.trim(),
        name_uz: nameUz.trim() || undefined,
        description_ru: descriptionRu.trim() || undefined,
        description_uz: descriptionUz.trim() || undefined,
        price_uzs: Number(priceUzs),
        stock: Number(stock) || 0,
        category_id: categoryId === '' ? undefined : categoryId,
      })
      toast('Товар добавлен')
      onCreated()
      onClose()
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setError(status === 409 ? 'Товар с таким SKU уже существует' : 'Не удалось создать товар')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Добавить товар вручную</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          Для товаров от других поставщиков, которых нет в Dolibarr. Такой товар синк не тронет и не перезапишет.
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">SKU / артикул *</label>
              <input value={sku} onChange={(e) => setSku(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Категория</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500">
                <option value="">— нет —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name_ru}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Название (рус.) *</label>
            <input value={nameRu} onChange={(e) => setNameRu(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Название (узб., необязательно)</label>
            <input value={nameUz} onChange={(e) => setNameUz(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Цена, сум *</label>
              <input type="number" value={priceUzs} onChange={(e) => setPriceUzs(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Остаток</label>
              <input type="number" value={stock} onChange={(e) => setStock(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Описание рус. (необязательно)</label>
            <textarea value={descriptionRu} onChange={(e) => setDescriptionRu(e.target.value)} rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none" />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Описание узб. (необязательно)</label>
            <textarea value={descriptionUz} onChange={(e) => setDescriptionUz(e.target.value)} rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none" />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            onClick={submit}
            disabled={!valid || saving}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold text-sm transition-colors"
          >
            {saving ? 'Сохраняю…' : 'Добавить товар'}
          </button>
        </div>
      </div>
    </div>
  )
}

type SortField = 'id' | 'name_ru' | 'price_uzs' | 'stock' | 'sort_order'

export default function AdminProducts() {
  const { toast } = useToast()
  const [data, setData] = useState<AdminProductList | null>(null)
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [filterCategory, setFilterCategory] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<SortField>('id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    adminGetCategories().then((r) => setCategories(r.data)).catch(() => {})
  }, [])

  const load = async () => {
    const params: Record<string, unknown> = { page, limit: 50, sort_by: sortBy, sort_dir: sortDir }
    if (search) params.search = search
    if (filterActive === 'active') params.is_active = true
    if (filterActive === 'inactive') params.is_active = false
    if (filterCategory !== null) params.category_id = filterCategory
    const r = await adminGetProducts(params as Parameters<typeof adminGetProducts>[0])
    setData(r.data)
    setSelected(new Set())
  }

  useEffect(() => { load() }, [page, filterActive, filterCategory, search, sortBy, sortDir])

  const updateField = async (id: number, field: string, rawVal: string) => {
    const value = field === 'price_uzs' ? Number(rawVal.replace(/\s/g, '')) : rawVal
    try {
      await adminUpdateProduct(id, { [field]: value })
      toast('Сохранено')
      load()
    } catch { toast('Ошибка сохранения', 'error') }
  }

  const updateCategory = async (id: number, categoryId: number | null) => {
    try {
      await adminUpdateProduct(id, { category_id: categoryId ?? undefined })
      toast('Категория обновлена')
      load()
    } catch { toast('Ошибка', 'error') }
  }

  const toggleActive = async (p: AdminProduct) => {
    try {
      await adminUpdateProduct(p.id, { is_active: !p.is_active })
      toast(p.is_active ? 'Товар скрыт' : 'Товар активирован')
      load()
    } catch { toast('Ошибка', 'error') }
  }

  const toggleFeatured = async (p: AdminProduct) => {
    try {
      await adminUpdateProduct(p.id, { is_featured: !p.is_featured })
      toast(p.is_featured ? 'Убрано из рекомендуемых' : 'Добавлено в рекомендуемые')
      load()
    } catch { toast('Ошибка', 'error') }
  }

  const moveOrder = async (p: AdminProduct, dir: 'up' | 'down') => {
    if (!data) return
    const idx = data.products.findIndex((x) => x.id === p.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= data.products.length) return
    const other = data.products[swapIdx]
    try {
      await Promise.all([
        adminUpdateProduct(p.id, { sort_order: other.sort_order }),
        adminUpdateProduct(other.id, { sort_order: p.sort_order }),
      ])
      load()
    } catch { toast('Ошибка при изменении порядка', 'error') }
  }

  const bulkDeactivate = async () => {
    const ids = Array.from(selected)
    await Promise.all(ids.map((id) => adminUpdateProduct(id, { is_active: false })))
    toast(`Скрыто ${ids.length} товаров`)
    load()
  }

  const toggleSort = (field: SortField) => {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(field); setSortDir('asc') }
    setPage(1)
  }

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown size={12} className={`inline ml-1 ${sortBy === field ? 'text-amber-400' : 'text-gray-600'} ${sortBy === field && sortDir === 'desc' ? 'rotate-180' : ''}`} />
  )

  const toggleSelect = (id: number) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const selectAll = () => {
    if (selected.size === data?.products.length) setSelected(new Set())
    else setSelected(new Set(data?.products.map((p) => p.id) ?? []))
  }

  const totalPages = data ? Math.ceil(data.total / 50) : 1
  const showSortOrder = filterCategory !== null

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-xl font-bold text-white">Товары</h1>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-3 py-2 rounded-xl transition-colors"
        >
          <Plus size={15} /> Добавить товар
        </button>

        <input type="text" placeholder="Поиск по названию или SKU..."
          value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1) } }}
          className="bg-gray-800 text-white text-sm rounded-xl px-3 py-2 border border-gray-700 w-60 focus:outline-none focus:border-amber-500"
        />

        <select value={filterCategory ?? ''} onChange={(e) => {
          const v = e.target.value
          setFilterCategory(v === '' ? null : Number(v))
          setPage(1)
          if (v !== '' && sortBy === 'id') { setSortBy('sort_order'); setSortDir('asc') }
          if (v === '' && sortBy === 'sort_order') { setSortBy('id'); setSortDir('asc') }
        }} className="bg-gray-800 text-white text-sm rounded-xl px-3 py-2 border border-gray-700 max-w-48">
          <option value="">Все категории</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name_ru}</option>)}
        </select>

        <select value={filterActive} onChange={(e) => { setFilterActive(e.target.value as typeof filterActive); setPage(1) }}
          className="bg-gray-800 text-white text-sm rounded-xl px-3 py-2 border border-gray-700">
          <option value="all">Все</option>
          <option value="active">Активные</option>
          <option value="inactive">Скрытые</option>
        </select>

        {selected.size > 0 && (
          <button onClick={bulkDeactivate}
            className="bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
            Скрыть выбранные ({selected.size})
          </button>
        )}

        {data && <span className="text-gray-600 text-sm ml-auto">{data.total} товаров</span>}
      </div>

      {showSortOrder && (
        <div className="mb-3 flex items-center gap-2 text-xs text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
          <ChevronUp size={13} />
          Режим сортировки внутри категории — используйте стрелки для изменения порядка товаров
        </div>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <th className="px-4 py-3 w-8">
                <input type="checkbox" checked={selected.size > 0 && selected.size === data?.products.length}
                  onChange={selectAll} className="accent-amber-500 cursor-pointer" />
              </th>
              {showSortOrder && (
                <th className="px-2 py-3 w-14 text-center cursor-pointer hover:text-white" onClick={() => toggleSort('sort_order')}>
                  Поряд. <SortIcon field="sort_order" />
                </th>
              )}
              <th className="px-2 py-3 w-10">Фото</th>
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left cursor-pointer hover:text-white" onClick={() => toggleSort('name_ru')}>
                Название <SortIcon field="name_ru" />
              </th>
              <th className="px-4 py-3 text-left">Категория</th>
              <th className="px-4 py-3 text-right cursor-pointer hover:text-white" onClick={() => toggleSort('price_uzs')}>
                Цена <SortIcon field="price_uzs" />
              </th>
              <th className="px-4 py-3 text-right cursor-pointer hover:text-white" onClick={() => toggleSort('stock')}>
                Остаток <SortIcon field="stock" />
              </th>
              <th className="px-4 py-3 text-center w-8" title="Рекомендуемый"><Star size={11} className="inline" /></th>
              <th className="px-4 py-3 text-center">Активен</th>
            </tr>
          </thead>
          <tbody>
            {data?.products.map((p, idx) => {
              const isSelected = selected.has(p.id)
              return (
                <tr key={p.id} className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors ${!p.is_active ? 'opacity-40' : ''} ${isSelected ? 'bg-amber-500/5' : ''}`}>
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)} className="accent-amber-500 cursor-pointer" />
                  </td>
                  {showSortOrder && (
                    <td className="px-2 py-2">
                      <div className="flex flex-col items-center gap-0.5">
                        <button onClick={() => moveOrder(p, 'up')} disabled={idx === 0}
                          className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-white hover:bg-gray-700 disabled:opacity-20">
                          <ChevronUp size={11} />
                        </button>
                        <span className="text-[9px] text-gray-700 font-mono">{p.sort_order}</span>
                        <button onClick={() => moveOrder(p, 'down')} disabled={idx === (data?.products.length ?? 1) - 1}
                          className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-white hover:bg-gray-700 disabled:opacity-20">
                          <ChevronDown size={11} />
                        </button>
                      </div>
                    </td>
                  )}
                  {/* Photo with upload */}
                  <td className="px-2 py-2">
                    <PhotoCell product={p} onChanged={load} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">{p.sku}</td>
                  <td className="px-4 py-2 text-white max-w-xs">
                    <InlineEdit value={p.name_ru} onSave={(v) => updateField(p.id, 'name_ru', v)} wide />
                  </td>
                  {/* Category selector */}
                  <td className="px-4 py-2">
                    <InlineCategorySelect
                      categoryId={p.category_id}
                      categories={categories}
                      onSave={(id) => updateCategory(p.id, id)}
                    />
                  </td>
                  <td className="px-4 py-2 text-right text-white whitespace-nowrap">
                    <InlineEdit value={fmt(p.price_uzs)} onSave={(v) => updateField(p.id, 'price_uzs', v)} type="number" />
                  </td>
                  <td className={`px-4 py-2 text-right ${stockColor(p.stock)}`}>
                    {p.stock === 0 ? 'Нет' : p.stock}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => toggleFeatured(p)} title={p.is_featured ? 'Убрать из рекомендуемых' : 'В рекомендуемые'}
                      className={`w-6 h-6 mx-auto flex items-center justify-center rounded transition-colors ${p.is_featured ? 'text-amber-400 hover:text-amber-300' : 'text-gray-700 hover:text-amber-400'}`}>
                      <Star size={12} fill={p.is_featured ? 'currentColor' : 'none'} />
                    </button>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => toggleActive(p)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${p.is_active ? 'bg-green-500/10 text-green-400 hover:bg-red-500/10 hover:text-red-400' : 'bg-gray-700 text-gray-500 hover:bg-green-500/10 hover:text-green-400'}`}>
                      {p.is_active ? 'Да' : 'Нет'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {!data?.products.length && (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-600">{search ? 'Ничего не найдено' : 'Товаров нет'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 mt-4 text-sm">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-xl bg-gray-800 text-white disabled:opacity-30 hover:bg-gray-700">←</button>
          <span className="text-gray-400">Стр. {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-xl bg-gray-800 text-white disabled:opacity-30 hover:bg-gray-700">→</button>
        </div>
      )}
      <p className="text-gray-700 text-xs mt-2">
        Наведите на фото — загрузить · Нажмите на название/цену/категорию — редактировать · <Star size={10} className="inline" /> — рекомендуемый
      </p>

      {showAddModal && (
        <AddProductModal
          categories={categories}
          onClose={() => setShowAddModal(false)}
          onCreated={load}
        />
      )}
    </div>
  )
}
