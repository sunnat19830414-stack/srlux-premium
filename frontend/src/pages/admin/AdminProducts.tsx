import { ArrowUpDown, Check, ImageOff, Pencil, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AdminProduct, AdminProductList } from '../../api/adminClient'
import { adminGetProducts, adminUpdateProduct } from '../../api/adminClient'
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
      <input type={type} value={val} onChange={(e) => setVal(e.target.value)}
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
        className={`bg-gray-800 text-white rounded-lg px-2 py-0.5 text-sm border border-amber-500 focus:outline-none ${wide ? 'w-48' : 'w-28'}`}
      />
      <button onClick={save} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
      <button onClick={cancel} className="text-red-400 hover:text-red-300"><X size={14} /></button>
    </span>
  )
}

type SortField = 'id' | 'name_ru' | 'price_uzs' | 'stock'

export default function AdminProducts() {
  const { toast } = useToast()
  const [data, setData] = useState<AdminProductList | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [sortBy, setSortBy] = useState<SortField>('id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const load = async () => {
    const params: Record<string, unknown> = { page, limit: 50, sort_by: sortBy, sort_dir: sortDir }
    if (search) params.search = search
    if (filterActive === 'active') params.is_active = true
    if (filterActive === 'inactive') params.is_active = false
    const r = await adminGetProducts(params as Parameters<typeof adminGetProducts>[0])
    setData(r.data)
    setSelected(new Set())
  }

  useEffect(() => { load() }, [page, filterActive, search, sortBy, sortDir])

  const updateField = async (id: number, field: string, rawVal: string) => {
    const value = field === 'price_uzs' ? Number(rawVal.replace(/\s/g, '')) : rawVal
    try {
      await adminUpdateProduct(id, { [field]: value })
      toast('Сохранено')
      load()
    } catch { toast('Ошибка сохранения', 'error') }
  }

  const toggleActive = async (p: AdminProduct) => {
    try {
      await adminUpdateProduct(p.id, { is_active: !p.is_active })
      toast(p.is_active ? 'Товар скрыт' : 'Товар активирован')
      load()
    } catch { toast('Ошибка', 'error') }
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
    <ArrowUpDown
      size={12}
      className={`inline ml-1 ${sortBy === field ? 'text-amber-400' : 'text-gray-600'} ${sortBy === field && sortDir === 'desc' ? 'rotate-180' : ''}`}
    />
  )

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const selectAll = () => {
    if (selected.size === data?.products.length) setSelected(new Set())
    else setSelected(new Set(data?.products.map((p) => p.id) ?? []))
  }

  const totalPages = data ? Math.ceil(data.total / 50) : 1

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <h1 className="text-xl font-bold text-white">Товары</h1>

        <input
          type="text"
          placeholder="Поиск по названию или SKU..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1) } }}
          className="bg-gray-800 text-white text-sm rounded-xl px-3 py-2 border border-gray-700 w-60 focus:outline-none focus:border-amber-500"
        />

        <select value={filterActive} onChange={(e) => { setFilterActive(e.target.value as any); setPage(1) }}
          className="bg-gray-800 text-white text-sm rounded-xl px-3 py-2 border border-gray-700">
          <option value="all">Все</option>
          <option value="active">Активные</option>
          <option value="inactive">Скрытые</option>
        </select>

        {selected.size > 0 && (
          <button onClick={bulkDeactivate}
            className="bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors ml-auto">
            Скрыть выбранные ({selected.size})
          </button>
        )}

        {data && (
          <span className="text-gray-600 text-sm ml-auto">{data.total} товаров</span>
        )}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <th className="px-4 py-3 w-8">
                <input type="checkbox" checked={selected.size > 0 && selected.size === data?.products.length}
                  onChange={selectAll} className="accent-amber-500 cursor-pointer" />
              </th>
              <th className="px-2 py-3 w-10">Фото</th>
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left cursor-pointer hover:text-white" onClick={() => toggleSort('name_ru')}>
                Название <SortIcon field="name_ru" />
              </th>
              <th className="px-4 py-3 text-right cursor-pointer hover:text-white" onClick={() => toggleSort('price_uzs')}>
                Цена <SortIcon field="price_uzs" />
              </th>
              <th className="px-4 py-3 text-right cursor-pointer hover:text-white" onClick={() => toggleSort('stock')}>
                Остаток <SortIcon field="stock" />
              </th>
              <th className="px-4 py-3 text-center">Активен</th>
            </tr>
          </thead>
          <tbody>
            {data?.products.map((p) => {
              const isSelected = selected.has(p.id)
              return (
                <tr
                  key={p.id}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors ${
                    !p.is_active ? 'opacity-40' : ''
                  } ${isSelected ? 'bg-amber-500/5' : ''}`}
                >
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)}
                      className="accent-amber-500 cursor-pointer" />
                  </td>
                  <td className="px-2 py-2">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt=""
                        className="w-9 h-9 object-contain rounded-lg bg-gray-800"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-800">
                        <ImageOff size={14} className="text-gray-700" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">{p.sku}</td>
                  <td className="px-4 py-2 text-white max-w-xs">
                    <InlineEdit value={p.name_ru} onSave={(v) => updateField(p.id, 'name_ru', v)} wide />
                  </td>
                  <td className="px-4 py-2 text-right text-white whitespace-nowrap">
                    <InlineEdit
                      value={fmt(p.price_uzs)}
                      onSave={(v) => updateField(p.id, 'price_uzs', v)}
                      type="number"
                    />
                  </td>
                  <td className={`px-4 py-2 text-right ${stockColor(p.stock)}`}>
                    {p.stock === 0 ? 'Нет' : p.stock}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => toggleActive(p)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                        p.is_active
                          ? 'bg-green-500/10 text-green-400 hover:bg-red-500/10 hover:text-red-400'
                          : 'bg-gray-700 text-gray-500 hover:bg-green-500/10 hover:text-green-400'
                      }`}
                    >
                      {p.is_active ? 'Да' : 'Нет'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {!data?.products.length && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-600">
                  {search ? `Ничего не найдено` : 'Товаров нет'}
                </td>
              </tr>
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
      <p className="text-gray-700 text-xs mt-2">Нажмите на название или цену для редактирования</p>
    </div>
  )
}
