import { Check, Pencil, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AdminProduct, AdminProductList } from '../../api/adminClient'
import { adminGetProducts, adminUpdateProduct } from '../../api/adminClient'

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n))

function EditableCell({
  value, onSave, type = 'text',
}: {
  value: string | number
  onSave: (v: string) => void
  type?: string
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value))

  const save = () => { onSave(val); setEditing(false) }
  const cancel = () => { setVal(String(value)); setEditing(false) }

  if (!editing) {
    return (
      <span
        className="flex items-center gap-1 cursor-pointer hover:text-amber-400 group"
        onClick={() => setEditing(true)}
      >
        {value}
        <Pencil size={10} className="opacity-0 group-hover:opacity-50" />
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1">
      <input
        type={type}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="bg-gray-800 text-white rounded px-2 py-0.5 text-sm w-28 border border-amber-500 focus:outline-none"
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
      />
      <button onClick={save} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
      <button onClick={cancel} className="text-red-400 hover:text-red-300"><X size={14} /></button>
    </span>
  )
}

export default function AdminProducts() {
  const [data, setData] = useState<AdminProductList | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')

  const load = async () => {
    const params: Record<string, unknown> = { page, limit: 50 }
    if (search) params.search = search
    if (filterActive === 'active') params.is_active = true
    if (filterActive === 'inactive') params.is_active = false
    const r = await adminGetProducts(params as any)
    setData(r.data)
  }

  useEffect(() => { load() }, [page, filterActive])

  const update = async (id: number, field: string, rawVal: string) => {
    const value = field === 'price_uzs' ? Number(rawVal) : rawVal
    await adminUpdateProduct(id, { [field]: value })
    load()
  }

  const toggleActive = async (product: AdminProduct) => {
    await adminUpdateProduct(product.id, { is_active: !product.is_active })
    load()
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="text-xl font-bold text-white mr-2">Товары</h1>
        <input
          type="text"
          placeholder="Поиск по названию или SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); load() } }}
          className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 w-64 focus:outline-none focus:border-amber-500"
        />
        <select
          value={filterActive}
          onChange={(e) => { setFilterActive(e.target.value as any); setPage(1) }}
          className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700"
        >
          <option value="all">Все</option>
          <option value="active">Активные</option>
          <option value="inactive">Скрытые</option>
        </select>
        <span className="text-gray-500 text-sm ml-auto">
          {data ? `${data.total} товаров` : ''}
        </span>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left">Название</th>
              <th className="px-4 py-3 text-right">Цена (сум)</th>
              <th className="px-4 py-3 text-right">Остаток</th>
              <th className="px-4 py-3 text-center">Активен</th>
            </tr>
          </thead>
          <tbody>
            {data?.products.map((p) => (
              <tr key={p.id} className={`border-b border-gray-800/50 hover:bg-gray-800/20 ${!p.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-2 font-mono text-xs text-gray-400">{p.sku}</td>
                <td className="px-4 py-2 text-white max-w-xs truncate">
                  <EditableCell value={p.name_ru} onSave={(v) => update(p.id, 'name_ru', v)} />
                </td>
                <td className="px-4 py-2 text-right text-white">
                  <EditableCell value={fmt(p.price_uzs)} onSave={(v) => update(p.id, 'price_uzs', v.replace(/\s/g, ''))} type="number" />
                </td>
                <td className="px-4 py-2 text-right text-gray-300">{p.stock}</td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => toggleActive(p)}
                    className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${
                      p.is_active
                        ? 'bg-green-500/10 text-green-400 hover:bg-red-500/10 hover:text-red-400'
                        : 'bg-gray-700 text-gray-400 hover:bg-green-500/10 hover:text-green-400'
                    }`}
                  >
                    {p.is_active ? 'Да' : 'Нет'}
                  </button>
                </td>
              </tr>
            ))}
            {!data?.products.length && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Товаров нет</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > 50 && (
        <div className="flex items-center gap-2 mt-4 text-sm">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 rounded bg-gray-800 text-white disabled:opacity-40">←</button>
          <span className="text-gray-400">Стр. {page} / {Math.ceil(data.total / 50)}</span>
          <button disabled={page >= Math.ceil(data.total / 50)} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 rounded bg-gray-800 text-white disabled:opacity-40">→</button>
        </div>
      )}
      <p className="text-gray-600 text-xs mt-3">Нажмите на название или цену чтобы отредактировать</p>
    </div>
  )
}
