import { BarChart3, FolderOpen, LogOut, Package, RefreshCw, ShoppingBag } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { clearAdminKey, getAdminKey } from '../../api/adminClient'

const NAV = [
  { to: '/admin/orders',     icon: ShoppingBag,  label: 'Заказы' },
  { to: '/admin/products',   icon: Package,       label: 'Товары' },
  { to: '/admin/categories', icon: FolderOpen,    label: 'Категории' },
  { to: '/admin/sync',       icon: RefreshCw,     label: 'Синхронизация' },
  { to: '/admin/stats',      icon: BarChart3,     label: 'Статистика' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    if (!getAdminKey()) navigate('/admin/login', { replace: true })
  }, [navigate])

  if (!getAdminKey()) return <Navigate to="/admin/login" replace />

  const logout = () => {
    clearAdminKey()
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-800">
          <span className="font-bold text-white text-lg">SR Lux</span>
          <span className="block text-xs text-gray-500 mt-0.5">Панель управления</span>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-2">
          {NAV.map(({ to, icon: Icon, label }) => {
            const active = pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-amber-500/10 text-amber-400 font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="px-2 pb-4">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-gray-800 w-full transition-colors"
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
  )
}
