import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AdminCategory } from '../../api/adminClient'
import { adminCreateCategory, adminDeleteCategory, adminGetCategories, adminUpdateCategory } from '../../api/adminClient'
import { useConfirm } from '../../components/admin/Confirm'
import { useToast } from '../../contexts/ToastContext'

const ICONS = ['Package', 'Flame', 'Droplets', 'Thermometer', 'Wrench', 'Home', 'Wind', 'Star', 'Zap', 'Shield', 'Box', 'Tag']

function EditRow({ cat, onSave, onCancel }: {
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
        <input value={name_ru} onChange={(e) => setRu(e.target.value)} placeholder="Название (рус)"
          className="bg-gray-800 text-white rounded-lg px-2 py-1.5 text-sm w-full border border-amber-500/50 focus:outline-none"
          autoFocus onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }} />
      </td>
      <td className="px-4 py-2">
        <input value={name_uz} onChange={(e) => setUz(e.target.value)} placeholder="Название (узб)"
          className="bg-gray-800 text-white rounded-lg px-2 py-1.5 text-sm w-full border border-gray-700 focus:outline-none" />
      </td>
      <td className="px-4 py-2">
        <select value={icon} onChange={(e) => setIcon(e.target.value)}
          className="bg-gray-800 text-white rounded-lg px-2 py-1.5 text-sm border border-gray-700 focus:outline-none">
          {ICONS.map((i) => <option key={i}>{i}</option>)}
        </select>
      </td>
      <td className="px-4 py-2 text-center text-gray-600">—</td>
      <td className="px-4 py-2">
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

  const create = async (data: { name_ru: string; name_uz: string; icon: string }) => {
    try {
      await adminCreateCategory(data)
      toast('Категория создана')
      setAdding(false)
      load()
    } catch { toast('Ошибка при создании', 'error') }
  }

  const update = async (id: number, data: { name_ru: string; name_uz: string; icon: string }) => {
    try {
      await adminUpdateCategory(id, data)
      toast('Категория обновлена')
      setEditId(null)
      load()
    } catch { toast('Ошибка при сохранении', 'error') }
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

  return (
    <div className="p-8">
      {ConfirmModal}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Категории</h1>
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
              <th className="px-4 py-3 text-left">Название (рус)</th>
              <th className="px-4 py-3 text-left">Название (узб)</th>
              <th className="px-4 py-3 text-left">Иконка</th>
              <th className="px-4 py-3 text-center">Товаров</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <EditRow cat={{}} onSave={create} onCancel={() => setAdding(false)} />
            )}
            {cats.map((cat) =>
              editId === cat.id ? (
                <EditRow key={cat.id} cat={cat} onSave={(d) => update(cat.id, d)} onCancel={() => setEditId(null)} />
              ) : (
                <tr key={cat.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{cat.name_ru}</td>
                  <td className="px-4 py-3 text-gray-400">{cat.name_uz}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded font-mono">{cat.icon}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-sm font-medium ${cat.product_count > 0 ? 'text-white' : 'text-gray-600'}`}>
                      {cat.product_count}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
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
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-600">Категорий нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
