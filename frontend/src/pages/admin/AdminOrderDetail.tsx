import { ArrowLeft, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { AdminOrder } from '../../api/adminClient'
import { adminGetOrder, adminUpdateOrderStatus } from '../../api/adminClient'
import { useToast } from '../../contexts/ToastContext'

const STATUS_OPTS = [
  { value: 'pending',    label: 'Новый',        color: 'text-yellow-400' },
  { value: 'processing', label: 'В обработке',  color: 'text-blue-400' },
  { value: 'completed',  label: 'Выполнен',     color: 'text-green-400' },
  { value: 'cancelled',  label: 'Отменён',      color: 'text-red-400' },
]

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n))

export default function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>()
  const { toast } = useToast()
  const [order, setOrder] = useState<AdminOrder | null>(null)

  useEffect(() => {
    if (id) adminGetOrder(Number(id)).then((r) => setOrder(r.data)).catch(() => toast('Заказ не найден', 'error'))
  }, [id])

  const changeStatus = async (newStatus: string) => {
    if (!order) return
    try {
      const r = await adminUpdateOrderStatus(order.id, newStatus)
      setOrder(r.data)
      toast('Статус обновлён')
    } catch { toast('Ошибка при обновлении', 'error') }
  }

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast(`${label} скопирован`))
  }

  if (!order) return (
    <div className="p-8">
      <div className="h-8 w-48 bg-gray-800 rounded animate-pulse mb-4" />
      <div className="h-40 bg-gray-800 rounded-xl animate-pulse" />
    </div>
  )

  const currentStatus = STATUS_OPTS.find((s) => s.value === order.status)

  return (
    <div className="p-8 max-w-2xl">
      <Link to="/admin/orders" className="flex items-center gap-2 text-gray-500 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft size={15} /> Назад к заказам
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className={`text-xl font-bold font-mono ${currentStatus?.color || 'text-white'}`}>
          {order.order_number}
        </h1>
        <select
          value={order.status}
          onChange={(e) => changeStatus(e.target.value)}
          className="bg-amber-500 text-black text-sm font-bold rounded-xl px-4 py-2.5 cursor-pointer border-0 focus:outline-none"
        >
          {STATUS_OPTS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {/* Customer info */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Клиент</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-white font-semibold">{order.customer_name}</p>
            <button onClick={() => copy(order.customer_name, 'Имя')}
              className="text-gray-600 hover:text-gray-400 transition-colors">
              <Copy size={13} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-gray-300">{order.customer_phone}</p>
            <button onClick={() => copy(order.customer_phone, 'Телефон')}
              className="text-gray-600 hover:text-gray-400 transition-colors">
              <Copy size={13} />
            </button>
          </div>
          {order.customer_address && (
            <p className="text-gray-400 text-sm">{order.customer_address}</p>
          )}
          <p className="text-gray-600 text-xs pt-1">
            {new Date(order.created_at).toLocaleString('ru-RU')}
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <p className="text-xs text-gray-500 uppercase tracking-wider px-5 py-3 border-b border-gray-800">
          Товары ({order.items.length})
        </p>
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800/60">
            <div>
              <p className="text-white text-sm">{item.product_name_snapshot}</p>
              <p className="text-gray-600 text-xs mt-0.5">× {item.quantity} шт. × {fmt(item.unit_price_snapshot)} сум</p>
            </div>
            <p className="text-white font-semibold">{fmt(item.unit_price_snapshot * item.quantity)} сум</p>
          </div>
        ))}
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-gray-400 font-medium">Итого</span>
          <span className="text-amber-400 text-xl font-bold">{fmt(order.total_uzs)} сум</span>
        </div>
      </div>
    </div>
  )
}
