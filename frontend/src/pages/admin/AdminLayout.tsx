import { BarChart3, FolderOpen, LogOut, Package, RefreshCw, ShoppingBag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { adminGetStats, clearAdminKey, getAdminKey } from '../../api/adminClient'
import { ToastProvider } from '../../contexts/ToastContext'

const NAV = [
  { to: '/admin/orders',     icon: ShoppingBag, label: 'Заказы' },
  { to: '/admin/products',   icon: Package,     label: 'Товары' },
  { to: '/admin/categories', icon: FolderOpen,  label: 'Категории' },
  { to: '/admin/sync',       icon: RefreshCw,   label: 'Синхронизация' },
  { to: '/admin/stats',      icon: BarChart3,   label: 'Дашборд' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!getAdminKey()) { navigate('/admin/login', { replace: true }); return }
    // Fetch pending orders count for sidebar badge
    adminGetStats()
      .then((r) => setPendingCount(r.data.pending_orders))
      .catch(() => {})
    const interval = setInterval(() => {
      adminGetStats().then((r) => setPendingCount(r.data.pending_orders)).catch(() => {})
    }, 60_000)
    return () => clearInterval(interval)
  }, [navigate])

  if (!getAdminKey()) return <Navigate to="/admin/login" replace />

  const logout = () => { clearAdminKey(); navigate('/admin/login') }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-gray-950 flex">
        {/* Sidebar */}
        <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
          <div className="px-5 py-5 border-b border-gray-800">
            <span className="font-bold text-white text-lg tracking-tight">SR Lux</span>
            <span className="block text-xs text-gray-500 mt-0.5">Панель управления</span>
          </div>

          <nav className="flex-1 py-4 space-y-0.5 px-2">
            {NAV.map(({ to, icon: Icon, label }) => {
              const active = pathname.startsWith(to)
              const isPendingOrders = to === '/admin/orders'
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    active
                      ? 'bg-amber-500/15 text-amber-400 font-semibold'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon size={16} />
                    {label}
                  </span>
                  {isPendingOrders && pendingCount > 0 && (
                    <span className="bg-amber-500 text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          <div className="px-2 pb-4 border-t border-gray-800 pt-3">
            <a
              href="/"
              target="_blank"
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-gray-600 hover:text-gray-400 transition-colors mb-1"
            >
              ↗ Открыть сайт
            </a>
            <button
              onClick={logout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-gray-800 w-full transition-colors"
            >
              <LogOut size={16} />
              Выйти
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  )
}
