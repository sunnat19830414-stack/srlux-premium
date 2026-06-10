import { Pencil, Plus, Trash2, X, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AdminCategory } from '../../api/adminClient'
import {
  adminCreateCategory, adminDeleteCategory, adminGetCategories, adminUpdateCategory,
} from '../../api/adminClient'

const ICONS = ['Package', 'Flame', 'Droplets', 'Thermometer', 'Wrench', 'Home', 'Wind', 'Star', 'Zap', 'Shield']

function EditRow({
  cat, onSave, onCancel,
}: {
  cat: Partial<AdminCategory>
  onSave: (d: { name_ru: string; name_uz: string; icon: string }) => void
  onCancel: () => void
}) {
  const [name_ru, setRu] = useState(cat.name_ru || '')
  const [name_uz, setUz] = useState(cat.name_uz || '')
  const [icon, setIcon] = useState(cat.icon || 'Package')

  const save = () => {
    if (!name_ru.trim()) return
    onSave({ name_ru: name_ru.trim(), name_uz: name_uz.trim() || name_ru.trim(), icon })
  }

  return (
    <tr className="bg-amber-500/5 border-b border-amber-500/20">
      <td className="px-4 py-2">
        <input value={name_ru} onChange={(e) => setRu(e.target.value)}
          placeholder="Название (рус)"
          className="bg-gray-800 text-white rounded px-2 py-1 text-sm w-full border border-amber-500/50 focus:outline-none" />
      </td>
      <td className="px-4 py-2">
        <input value={name_uz} onChange={(e) => setUz(e.target.value)}
          placeholder="Название (узб)"
          className="bg-gray-800 text-white rounded px-2 py-1 text-sm w-full border border-gray-600 focus:outline-none" />
      </td>
      <td className="px-4 py-2">
        <select value={icon} onChange={(e) => setIcon(e.target.value)}
          className="bg-gray-800 text-white rounded px-2 py-1 text-sm border border-gray-600">
          {ICONS.map((i) => <option key={i}>{i}</option>)}
        </select>
      </td>
      <td className="px-4 py-2 text-center text-gray-400">—</td>
      <td className="px-4 py-2">
        <div className="flex gap-2">
          <button onClick={save} className="text-green-400 hover:text-green-300"><Check size={16} /></button>
          <button onClick={onCancel} className="text-red-400 hover:text-red-300"><X size={16} /></button>
        </div>
      </td>
    </tr>
  )
}

export default function AdminCategories() {
  const [cats, setCats] = useState<AdminCategory[]>([])
  const [editId, setEditId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const load = async () => setCats((await adminGetCategories()).data)
  useEffect(() => { load() }, [])

  const create = async (data: { name_ru: string; name_uz: string; icon: string }) => {
    await adminCreateCategory(data)
    setAdding(false)
    load()
  }

  const update = async (id: number, data: { name_ru: string; name_uz: string; icon: string }) => {
    await adminUpdateCategory(id, data)
    setEditId(null)
    load()
  }

  const remove = async (cat: AdminCategory) => {
    if (cat.product_count > 0) {
      setError(`Нельзя удалить категорию с ${cat.product_count} товарами`)
      setTimeout(() => setError(''), 3000)
      return
    }
    if (!confirm(`Удалить «${cat.name_ru}»?`)) return
    await adminDeleteCategory(cat.id)
    load()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Категории</h1>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> Добавить
        </button>
      </div>

      {error && <div className="bg-red-500/10 text-red-400 text-sm rounded-lg px-4 py-2 mb-4">{error}</div>}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <th className="px-4 py-3 text-left">Название (рус)</th>
              <th className="px-4 py-3 text-left">Название (узб)</th>
              <th className="px-4 py-3 text-left">Иконка</th>
              <th className="px-4 py-3 text-center">Товаров</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <EditRow
                cat={{}}
                onSave={create}
                onCancel={() => setAdding(false)}
              />
            )}
            {cats.map((cat) =>
              editId === cat.id ? (
                <EditRow
                  key={cat.id}
                  cat={cat}
                  onSave={(d) => update(cat.id, d)}
                  onCancel={() => setEditId(null)}
                />
              ) : (
                <tr key={cat.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                  <td className="px-4 py-3 text-white font-medium">{cat.name_ru}</td>
                  <td className="px-4 py-3 text-gray-400">{cat.name_uz}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{cat.icon}</td>
                  <td className="px-4 py-3 text-center text-gray-300">{cat.product_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => setEditId(cat.id)} className="text-gray-500 hover:text-amber-400">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => remove(cat)} className="text-gray-500 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {!cats.length && !adding && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Категорий нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
