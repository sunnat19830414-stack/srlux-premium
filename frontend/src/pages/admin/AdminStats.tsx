import { useEffect, useState } from 'react'
import type { AdminStats } from '../../api/adminClient'
import { adminGetStats } from '../../api/adminClient'

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n))

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function AdminStats() {
  const [stats, setStats] = useState<AdminStats | null>(null)

  useEffect(() => {
    adminGetStats().then((r) => setStats(r.data))
  }, [])

  if (!stats) return <div className="p-8 text-gray-400">Загрузка...</div>

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-white mb-6">Статистика</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Ожидают обработки" value={stats.pending_orders} sub="заказов" />
        <Card label="Сегодня заказов" value={stats.orders_today} />
        <Card label="За неделю" value={stats.orders_this_week} sub="заказов" />
        <Card label="Всего заказов" value={stats.total_orders} />
        <Card label="Выручка" value={`${fmt(stats.total_revenue)} сум`} sub="без отменённых" />
        <Card label="Активных товаров" value={stats.active_products} sub={`из ${stats.total_products}`} />
        <Card label="Категорий" value={stats.total_categories} />
      </div>
    </div>
  )
}
