import { AlertTriangle, Package, ShoppingBag, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AdminStats } from '../../api/adminClient'
import { adminGetStats } from '../../api/adminClient'

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n))

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-yellow-400/10 text-yellow-400',
  processing: 'bg-blue-400/10 text-blue-400',
  completed:  'bg-green-400/10 text-green-400',
  cancelled:  'bg-red-400/10 text-red-400',
}
const STATUS_LABELS: Record<string, string> = {
  pending: 'Новый', processing: 'В обработке', completed: 'Выполнен', cancelled: 'Отменён',
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)

  useEffect(() => { adminGetStats().then((r) => setStats(r.data)) }, [])

  if (!stats) {
    return (
      <div className="p-8">
        <div className="h-6 w-32 bg-gray-800 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-white mb-6">Дашборд</h1>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Новых заказов</p>
            <ShoppingBag size={16} className="text-amber-400" />
          </div>
          <p className="text-3xl font-bold text-amber-400">{stats.pending_orders}</p>
          <p className="text-xs text-gray-600 mt-1">ожидают обработки</p>
        </div>

        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Сегодня</p>
            <TrendingUp size={16} className="text-green-400" />
          </div>
          <p className="text-3xl font-bold text-white">{stats.orders_today}</p>
          <p className="text-xs text-gray-600 mt-1">{stats.orders_this_week} за неделю</p>
        </div>

        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Выручка</p>
            <span className="text-xs text-gray-500">сум</span>
          </div>
          <p className="text-2xl font-bold text-white">{fmt(stats.total_revenue)}</p>
          <p className="text-xs text-gray-600 mt-1">всего (без отменённых)</p>
        </div>

        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Товары</p>
            <Package size={16} className="text-blue-400" />
          </div>
          <p className="text-3xl font-bold text-white">{stats.active_products}</p>
          <p className="text-xs text-gray-600 mt-1">активных из {stats.total_products}</p>
        </div>
      </div>

      {/* Two-column: recent orders + low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent orders */}
        <div className="bg-gray-900 rounded-xl border border-gray-800">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Последние заказы</h2>
            <Link to="/admin/orders" className="text-xs text-amber-400 hover:underline">Все →</Link>
          </div>
          {stats.recent_orders.length === 0 ? (
            <p className="text-gray-600 text-sm px-5 py-6">Заказов пока нет</p>
          ) : (
            <div className="divide-y divide-gray-800">
              {stats.recent_orders.map((o) => {
                const sc = STATUS_COLORS[o.status] || 'text-gray-400'
                return (
                  <Link
                    key={o.id}
                    to={`/admin/orders/${o.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-gray-800/40 transition-colors"
                  >
                    <div>
                      <span className="font-mono text-xs text-amber-400">{o.order_number}</span>
                      <p className="text-sm text-white mt-0.5">{o.customer_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-white">{fmt(o.total_uzs)} сум</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${sc}`}>
                        {STATUS_LABELS[o.status] || o.status}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Low stock */}
        <div className="bg-gray-900 rounded-xl border border-gray-800">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <AlertTriangle size={14} className="text-orange-400" />
              Заканчиваются на складе
            </h2>
            <Link to="/admin/products" className="text-xs text-amber-400 hover:underline">Товары →</Link>
          </div>
          {stats.low_stock_products.length === 0 ? (
            <p className="text-gray-600 text-sm px-5 py-6">Все товары в достаточном количестве</p>
          ) : (
            <div className="divide-y divide-gray-800">
              {stats.low_stock_products.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm text-white">{p.name_ru}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{p.sku}</p>
                  </div>
                  <span className={`text-sm font-bold ${p.stock === 0 ? 'text-red-400' : 'text-orange-400'}`}>
                    {p.stock === 0 ? 'Нет' : `${p.stock} шт.`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
