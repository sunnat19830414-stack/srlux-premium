import { Check, ChevronDown, ChevronUp, Grid2X2, Pencil, Plus, Star, Trash2, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AdminCategory, CategoryDisplayStyle } from '../../api/adminClient'
import { adminCreateCategory, adminDeleteCategory, adminGetCategories, adminUpdateCategory } from '../../api/adminClient'
import { useConfirm } from '../../components/admin/Confirm'
import { useToast } from '../../contexts/ToastContext'

const ICONS = ['Package', 'Flame', 'Droplets', 'Thermometer', 'Wrench', 'Home', 'Wind', 'Star', 'Zap', 'Shield', 'Box', 'Tag']

const STYLE_OPTS: Array<{ value: CategoryDisplayStyle; label: string; desc: string; preview: ReactNode }> = [
  {
    value: 'grid',
    label: 'Сетка',
    desc: '3 колонки',
    preview: (
      <div className="grid grid-cols-3 gap-0.5 w-10 h-7">
        {[...Array(6)].map((_, i) => <div key={i} className="bg-current rounded-sm opacity-60" />)}
      </div>
    ),
  },
  {
    value: 'large-grid',
    label: 'Крупная',
    desc: '2 колонки',
    preview: (
      <div className="grid grid-cols-2 gap-0.5 w-10 h-7">
        {[...Array(4)].map((_, i) => <div key={i} className="bg-current rounded-sm opacity-60" />)}
      </div>
    ),
  },
  {
    value: 'list',
    label: 'Список',
    desc: 'Горизонталь',
    preview: (
      <div className="flex flex-col gap-0.5 w-10 h-7 justify-center">
        {[...Array(3)].map((_, i) => <div key={i} className="h-1.5 bg-current rounded-sm opacity-60" />)}
      </div>
    ),
  },
  {
    value: 'featured',
    label: 'Витрина',
    desc: 'Герой + сетка',
    preview: (
      <div className="flex flex-col gap-0.5 w-10 h-7">
        <div className="h-3.5 bg-current rounded-sm opacity-60" />
        <div className="grid grid-cols-3 gap-0.5 flex-1">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-current rounded-sm opacity-40" />)}
        </div>
      </div>
    ),
  },
]

const STYLE_COLORS: Record<CategoryDisplayStyle, string> = {
  'grid': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'large-grid': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'list': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  'featured': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

function StylePicker({ value, onChange }: { value: CategoryDisplayStyle; onChange: (v: CategoryDisplayStyle) => void }) {
  return (
    <div className="flex gap-2">
      {STYLE_OPTS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
              active
                ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                : 'border-gray-700 bg-gray-800/60 text-gray-500 hover:border-gray-600 hover:text-gray-400'
            }`}
          >
            {opt.preview}
            <span className="text-[10px] font-medium whitespace-nowrap">{opt.label}</span>
            <span className="text-[9px] opacity-60">{opt.desc}</span>
          </button>
        )
      })}
    </div>
  )
}

function EditRow({ cat, onSave, onCancel, nextSortOrder }: {
  cat: Partial<AdminCategory>
  onSave: (d: { name_ru: string; name_uz: string; icon: string; display_style: CategoryDisplayStyle; is_featured: boolean; sort_order: number }) => void
  onCancel: () => void
  nextSortOrder: number
}) {
  const [name_ru, setRu] = useState(cat.name_ru || '')
  const [name_uz, setUz] = useState(cat.name_uz || '')
  const [icon, setIcon] = useState(cat.icon || 'Package')
  const [style, setStyle] = useState<CategoryDisplayStyle>(cat.display_style || 'grid')
  const [featured, setFeatured] = useState(cat.is_featured || false)

  const save = () => {
    if (!name_ru.trim()) return
    onSave({
      name_ru: name_ru.trim(),
      name_uz: name_uz.trim() || name_ru.trim(),
      icon,
      display_style: style,
      is_featured: featured,
      sort_order: cat.sort_order ?? nextSortOrder,
    })
  }

  return (
    <tr className="bg-amber-500/5 border-b border-amber-500/20">
      <td className="px-3 py-3 text-gray-700">—</td>
      <td className="px-3 py-3" colSpan={2}>
        <div className="flex flex-col gap-2">
          <input value={name_ru} onChange={(e) => setRu(e.target.value)} placeholder="Название (рус)"
            className="bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm w-full border border-amber-500/50 focus:outline-none"
            autoFocus onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }} />
          <input value={name_uz} onChange={(e) => setUz(e.target.value)} placeholder="Название (узб)"
            className="bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm w-full border border-gray-700 focus:outline-none" />
        </div>
      </td>
      <td className="px-3 py-3">
        <select value={icon} onChange={(e) => setIcon(e.target.value)}
          className="bg-gray-800 text-white rounded-lg px-2 py-1.5 text-sm border border-gray-700 focus:outline-none">
          {ICONS.map((i) => <option key={i}>{i}</option>)}
        </select>
      </td>
      <td className="px-3 py-3" colSpan={2}>
        <StylePicker value={style} onChange={setStyle} />
      </td>
      <td className="px-3 py-3 text-center">
        <button
          type="button"
          onClick={() => setFeatured((f) => !f)}
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
            featured ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-800 text-gray-600'
          }`}
        >
          <Star size={13} fill={featured ? 'currentColor' : 'none'} />
        </button>
      </td>
      <td className="px-3 py-3 text-center text-gray-600 text-xs">—</td>
      <td className="px-3 py-3">
        <div className="flex gap-2">
          <button onClick={save} className="w-7 h-7 flex items-center justify-center rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20">
            <Check size={14} />
          </button>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-800 text-gray-500 hover:text-white">
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function AdminCategories() {
  const { toast } = useToast()
  const { confirm, ConfirmModal } = useConfirm()
  const [cats, setCats] = useState<AdminCategory[]>([])
  const [editId, setEditId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)

  const load = async () => setCats((await adminGetCategories()).data)
  useEffect(() => { load() }, [])

  const create = async (data: Parameters<typeof adminCreateCategory>[0]) => {
    try {
      await adminCreateCategory(data)
      toast('Категория создана')
      setAdding(false)
      load()
    } catch { toast('Ошибка при создании', 'error') }
  }

  const update = async (id: number, data: Partial<AdminCategory>) => {
    try {
      await adminUpdateCategory(id, data)
      toast('Категория обновлена')
      setEditId(null)
      load()
    } catch { toast('Ошибка при сохранении', 'error') }
  }

  const toggleFeatured = async (cat: AdminCategory) => {
    try {
      await adminUpdateCategory(cat.id, { is_featured: !cat.is_featured })
      toast(cat.is_featured ? 'Убрано из витрины' : 'Добавлено в витрину')
      load()
    } catch { toast('Ошибка', 'error') }
  }

  const moveOrder = async (cat: AdminCategory, dir: 'up' | 'down') => {
    const idx = cats.findIndex((c) => c.id === cat.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= cats.length) return
    const other = cats[swapIdx]
    try {
      await Promise.all([
        adminUpdateCategory(cat.id, { sort_order: other.sort_order }),
        adminUpdateCategory(other.id, { sort_order: cat.sort_order }),
      ])
      load()
    } catch { toast('Ошибка при изменении порядка', 'error') }
  }

  const remove = async (cat: AdminCategory) => {
    if (cat.product_count > 0) {
      toast(`Нельзя удалить: в категории ${cat.product_count} товаров`, 'error')
      return
    }
    const ok = await confirm(`Удалить категорию «${cat.name_ru}»? Это действие нельзя отменить.`)
    if (!ok) return
    try {
      await adminDeleteCategory(cat.id)
      toast('Категория удалена')
      load()
    } catch { toast('Ошибка при удалении', 'error') }
  }

  const styleOpt = (style: CategoryDisplayStyle) => STYLE_OPTS.find((s) => s.value === style)

  return (
    <div className="p-8">
      {ConfirmModal}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Категории</h1>
          <p className="text-xs text-gray-600 mt-1">Порядок и стиль отображения на сайте</p>
        </div>
        <button
          onClick={() => { setAdding(true); setEditId(null) }}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          <Plus size={15} /> Добавить
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <th className="px-3 py-3 w-16 text-center">Порядок</th>
              <th className="px-3 py-3 text-left">Название (рус)</th>
              <th className="px-3 py-3 text-left">Название (узб)</th>
              <th className="px-3 py-3 text-left">Иконка</th>
              <th className="px-3 py-3 text-left" colSpan={2}>Стиль</th>
              <th className="px-3 py-3 text-center w-10" title="Витрина"><Zap size={12} className="inline" /></th>
              <th className="px-3 py-3 text-center">Товаров</th>
              <th className="px-3 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <EditRow cat={{}} onSave={create} onCancel={() => setAdding(false)} nextSortOrder={cats.length} />
            )}
            {cats.map((cat, idx) =>
              editId === cat.id ? (
                <EditRow key={cat.id} cat={cat} onSave={(d) => update(cat.id, d)} onCancel={() => setEditId(null)} nextSortOrder={cats.length} />
              ) : (
                <tr key={cat.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                  {/* Sort order arrows */}
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        onClick={() => moveOrder(cat, 'up')}
                        disabled={idx === 0}
                        className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-white hover:bg-gray-700 disabled:opacity-20 transition-colors"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <span className="text-[10px] text-gray-700 font-mono">{idx + 1}</span>
                      <button
                        onClick={() => moveOrder(cat, 'down')}
                        disabled={idx === cats.length - 1}
                        className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-white hover:bg-gray-700 disabled:opacity-20 transition-colors"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-white font-medium">{cat.name_ru}</td>
                  <td className="px-3 py-3 text-gray-400">{cat.name_uz}</td>
                  <td className="px-3 py-3">
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded font-mono">{cat.icon}</span>
                  </td>
                  {/* Style */}
                  <td className="px-3 py-3" colSpan={2}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${STYLE_COLORS[cat.display_style]}`}>
                        {styleOpt(cat.display_style)?.label || cat.display_style}
                      </span>
                      <span className="text-[10px] text-gray-600">{styleOpt(cat.display_style)?.desc}</span>
                    </div>
                  </td>
                  {/* Featured */}
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => toggleFeatured(cat)}
                      title={cat.is_featured ? 'Убрать из витрины' : 'Добавить в витрину'}
                      className={`w-7 h-7 mx-auto flex items-center justify-center rounded-lg transition-colors ${
                        cat.is_featured
                          ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                          : 'bg-gray-800/60 text-gray-700 hover:text-amber-400 hover:bg-amber-500/10'
                      }`}
                    >
                      <Star size={12} fill={cat.is_featured ? 'currentColor' : 'none'} />
                    </button>
                  </td>
                  {/* Product count */}
                  <td className="px-3 py-3 text-center">
                    <span className={`text-sm font-medium ${cat.product_count > 0 ? 'text-white' : 'text-gray-600'}`}>
                      {cat.product_count}
                    </span>
                  </td>
                  {/* Actions */}
                  <td className="px-3 py-3">
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={() => { setEditId(cat.id); setAdding(false) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-amber-400 hover:bg-gray-800 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => remove(cat)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-gray-800 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {!cats.length && !adding && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-600">Категорий нет</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3">
        {STYLE_OPTS.map((opt) => (
          <div key={opt.value} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border ${STYLE_COLORS[opt.value]}`}>
            <Grid2X2 size={10} />
            <span className="font-medium">{opt.label}</span>
            <span className="opacity-60">— {opt.desc}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border bg-amber-500/10 text-amber-400 border-amber-500/20">
          <Star size={10} fill="currentColor" />
          <span className="font-medium">Витрина</span>
          <span className="opacity-60">— выводится на главной</span>
        </div>
      </div>
    </div>
  )
}
