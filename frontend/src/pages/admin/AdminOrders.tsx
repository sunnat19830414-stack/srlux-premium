import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AdminOrder, AdminOrderList, OrderStatusCounts } from '../../api/adminClient'
import { adminGetOrders, adminUpdateOrderStatus } from '../../api/adminClient'
import { useToast } from '../../contexts/ToastContext'

const STATUSES: Array<{ value: string; label: string; color: string }> = [
  { value: '',           label: 'Все',         color: 'text-gray-400' },
  { value: 'pending',    label: 'Новый',        color: 'text-yellow-400' },
  { value: 'processing', label: 'В обработке',  color: 'text-blue-400' },
  { value: 'completed',  label: 'Выполнен',     color: 'text-green-400' },
  { value: 'cancelled',  label: 'Отменён',      color: 'text-red-400' },
]

const STATUS_ROW_COLORS: Record<string, string> = {
  pending:    'border-l-2 border-yellow-500',
  processing: 'border-l-2 border-blue-500',
  completed:  '',
  cancelled:  'opacity-50',
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n))

const countFor = (counts: OrderStatusCounts | undefined, val: string) => {
  if (!counts) return 0
  if (val === '') return counts.total
  return counts[val as keyof OrderStatusCounts] as number ?? 0
}

export default function AdminOrders() {
  const { toast } = useToast()
  const [data, setData] = useState<AdminOrderList | null>(null)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await adminGetOrders({
        page,
        limit: 20,
        status: statusFilter || undefined,
        search: search || undefined,
      })
      setData(r.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [page, statusFilter, search])

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  const changeStatus = async (order: AdminOrder, newStatus: string) => {
    try {
      await adminUpdateOrderStatus(order.id, newStatus)
      toast(`Статус заказа ${order.order_number} обновлён`)
      load()
    } catch {
      toast('Ошибка при обновлении статуса', 'error')
    }
  }

  const totalPages = data ? Math.ceil(data.total / 20) : 1

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-white">Заказы</h1>

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Номер, имя, телефон..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="bg-gray-800 text-white text-sm rounded-xl pl-8 pr-3 py-2 border border-gray-700 w-56 focus:outline-none focus:border-amber-500"
            />
          </div>
          <button
            onClick={handleSearch}
            className="bg-gray-800 hover:bg-gray-700 text-white text-sm px-4 py-2 rounded-xl border border-gray-700 transition-colors"
          >
            Найти
          </button>
          {search && (
            <button
              onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }}
              className="text-xs text-gray-500 hover:text-white"
            >
              ✕ Сбросить
            </button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-5 bg-gray-900 rounded-xl p-1 border border-gray-800 w-fit">
        {STATUSES.map(({ value, label, color }) => {
          const count = countFor(data?.counts, value)
          const active = statusFilter === value
          return (
            <button
              key={value}
              onClick={() => { setStatusFilter(value); setPage(1) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                active ? 'bg-gray-800 text-white font-medium' : 'text-gray-500 hover:text-white'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`text-xs font-bold ${active ? color : 'text-gray-600'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
                  <th className="px-4 py-3 text-left">Номер</th>
                  <th className="px-4 py-3 text-left">Клиент</th>
                  <th className="px-4 py-3 text-left">Телефон</th>
                  <th className="px-4 py-3 text-right">Сумма</th>
                  <th className="px-4 py-3 text-left">Статус</th>
                  <th className="px-4 py-3 text-left">Дата</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {data?.orders.map((order) => {
                  const rowCls = STATUS_ROW_COLORS[order.status] || ''
                  const s = STATUSES.find((st) => st.value === order.status)
                  return (
                    <tr key={order.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${rowCls}`}>
                      <td className="px-4 py-3 font-mono text-amber-400 text-xs">{order.order_number}</td>
                      <td className="px-4 py-3 text-white">{order.customer_name}</td>
                      <td className="px-4 py-3 text-gray-300">{order.customer_phone}</td>
                      <td className="px-4 py-3 text-right text-white whitespace-nowrap">{fmt(order.total_uzs)} сум</td>
                      <td className="px-4 py-3">
                        <select
                          value={order.status}
                          onChange={(e) => changeStatus(order, e.target.value)}
                          className={`text-xs rounded-full px-2 py-1 border-0 font-medium cursor-pointer bg-transparent ${s?.color || 'text-gray-400'}`}
                        >
                          {STATUSES.filter((st) => st.value !== '').map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString('ru-RU')}
                        <br />
                        {new Date(order.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/admin/orders/${order.id}`} className="text-xs text-amber-400 hover:underline">
                          Открыть
                        </Link>
                      </td>
                    </tr>
                  )
                })}
                {!data?.orders.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-600">
                      {search ? `Ничего не найдено по запросу «${search}»` : 'Заказов нет'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-2 mt-4 text-sm">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-xl bg-gray-800 text-white disabled:opacity-30 hover:bg-gray-700 transition-colors">
                ←
              </button>
              <span className="text-gray-400">Стр. {page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-xl bg-gray-800 text-white disabled:opacity-30 hover:bg-gray-700 transition-colors">
                →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
