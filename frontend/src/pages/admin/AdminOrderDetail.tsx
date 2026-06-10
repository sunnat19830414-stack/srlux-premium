import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { AdminOrder } from '../../api/adminClient'
import { adminGetOrder, adminUpdateOrderStatus } from '../../api/adminClient'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Новый', processing: 'В обработке', completed: 'Выполнен', cancelled: 'Отменён',
}
const STATUSES = Object.entries(STATUS_LABELS)
const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n))

export default function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<AdminOrder | null>(null)

  useEffect(() => {
    if (id) adminGetOrder(Number(id)).then((r) => setOrder(r.data))
  }, [id])

  const changeStatus = async (newStatus: string) => {
    if (!order) return
    const r = await adminUpdateOrderStatus(order.id, newStatus)
    setOrder(r.data)
  }

  if (!order) return <div className="p-8 text-gray-400">Загрузка...</div>

  return (
    <div className="p-8 max-w-2xl">
      <Link to="/admin/orders" className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6">
        <ArrowLeft size={16} /> Назад к заказам
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white font-mono">{order.order_number}</h1>
        <select
          value={order.status}
          onChange={(e) => changeStatus(e.target.value)}
          className="bg-amber-500 text-black text-sm font-semibold rounded-lg px-3 py-2 cursor-pointer"
        >
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-4">
        <p className="text-xs text-gray-500 uppercase mb-3">Клиент</p>
        <p className="text-white font-medium">{order.customer_name}</p>
        <p className="text-gray-300 mt-1">{order.customer_phone}</p>
        {order.customer_address && <p className="text-gray-400 text-sm mt-1">{order.customer_address}</p>}
        <p className="text-gray-500 text-xs mt-3">{new Date(order.created_at).toLocaleString('ru-RU')}</p>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden mb-4">
        <p className="text-xs text-gray-500 uppercase px-5 py-3 border-b border-gray-800">Товары</p>
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-5 py-3 border-b border-gray-800/50">
            <div>
              <p className="text-white text-sm">{item.product_name_snapshot}</p>
              <p className="text-gray-500 text-xs">× {item.quantity} шт.</p>
            </div>
            <p className="text-white text-sm">{fmt(item.unit_price_snapshot * item.quantity)} сум</p>
          </div>
        ))}
        <div className="flex items-center justify-between px-5 py-3 font-semibold">
          <span className="text-gray-400">Итого</span>
          <span className="text-amber-400 text-lg">{fmt(order.total_uzs)} сум</span>
        </div>
      </div>
    </div>
  )
}
