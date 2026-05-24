import { ShoppingCart, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLocale } from '../contexts/LocaleContext'

interface HeaderProps {
  cartCount: number
}

export default function Header({ cartCount }: HeaderProps) {
  const { lang, setLang, t } = useLocale()
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-50 bg-anthracite-900 border-b border-gold-700/20 shadow-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <img
              src="/public_assets/logo-horizontal.png"
              alt="SR Lux"
              className="h-9 w-auto"
              onError={(e) => {
                const el = e.currentTarget
                el.style.display = 'none'
                const span = el.nextElementSibling as HTMLElement
                if (span) span.style.display = 'block'
              }}
            />
            <span
              className="hidden text-xl font-bold bg-gold-gradient bg-clip-text text-transparent"
              style={{ display: 'none' }}
            >
              SR LUX
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              to="/"
              className="text-sm font-medium text-gray-300 hover:text-gold transition-colors"
            >
              {t.catalog}
            </Link>
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-3">
            {/* Language switcher */}
            <div className="flex rounded-lg overflow-hidden border border-gold-700/30">
              {(['ru', 'uz'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => {
                    setLang(l)
                    localStorage.setItem('srlux_lang', l)
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    lang === l
                      ? 'bg-gold text-anthracite-900'
                      : 'text-gray-400 hover:text-gold'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Cart */}
            <button
              onClick={() => navigate('/cart')}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gold-700/30 text-gray-300 hover:text-gold hover:border-gold/50 transition-all"
            >
              <ShoppingCart size={18} />
              <span className="text-sm font-medium">{t.cart}</span>
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gold text-anthracite-900 text-[10px] font-bold flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>

            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-2 text-gray-400 hover:text-gold transition-colors"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gold-700/20 bg-anthracite-800 px-4 py-3 space-y-2">
          <Link
            to="/"
            className="block py-2 text-gray-300 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {t.catalog}
          </Link>
          <Link
            to="/cart"
            className="block py-2 text-gray-300 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {t.cart} {cartCount > 0 && `(${cartCount})`}
          </Link>
        </div>
      )}
    </header>
  )
}
