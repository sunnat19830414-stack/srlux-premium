import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AdminOrder, AdminOrderList } from '../../api/adminClient'
import { adminGetOrders, adminUpdateOrderStatus } from '../../api/adminClient'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Новый',        color: 'text-yellow-400 bg-yellow-400/10' },
  processing: { label: 'В обработке',  color: 'text-blue-400 bg-blue-400/10' },
  completed:  { label: 'Выполнен',     color: 'text-green-400 bg-green-400/10' },
  cancelled:  { label: 'Отменён',      color: 'text-red-400 bg-red-400/10' },
}

const STATUSES = Object.entries(STATUS_LABELS)
const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n))

export default function AdminOrders() {
  const [data, setData] = useState<AdminOrderList | null>(null)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    const r = await adminGetOrders({ page, limit: 20, status: statusFilter || undefined })
    setData(r.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [page, statusFilter])

  const changeStatus = async (order: AdminOrder, newStatus: string) => {
    await adminUpdateOrderStatus(order.id, newStatus)
    load()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Заказы</h1>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700"
        >
          <option value="">Все статусы</option>
          {STATUSES.map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-gray-400">Загрузка...</div>
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
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data?.orders.map((order) => {
                  const s = STATUS_LABELS[order.status] || { label: order.status, color: 'text-gray-400' }
                  return (
                    <tr key={order.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-3 font-mono text-amber-400">{order.order_number}</td>
                      <td className="px-4 py-3 text-white">{order.customer_name}</td>
                      <td className="px-4 py-3 text-gray-300">{order.customer_phone}</td>
                      <td className="px-4 py-3 text-right text-white">{fmt(order.total_uzs)} сум</td>
                      <td className="px-4 py-3">
                        <select
                          value={order.status}
                          onChange={(e) => changeStatus(order, e.target.value)}
                          className={`text-xs rounded-full px-2 py-1 border-0 font-medium cursor-pointer bg-transparent ${s.color}`}
                        >
                          {STATUSES.map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(order.created_at).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/admin/orders/${order.id}`} className="text-xs text-amber-400 hover:underline">
                          Детали
                        </Link>
                      </td>
                    </tr>
                  )
                })}
                {!data?.orders.length && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Заказов нет</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.total > 20 && (
            <div className="flex items-center gap-2 mt-4 text-sm">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded bg-gray-800 text-white disabled:opacity-40">←</button>
              <span className="text-gray-400">Стр. {page} / {Math.ceil(data.total / 20)}</span>
              <button disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded bg-gray-800 text-white disabled:opacity-40">→</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
