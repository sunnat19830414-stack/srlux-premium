import { ShoppingCart, Menu, X, Phone, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLocale } from '../contexts/LocaleContext'
import { useCurrency } from '../contexts/CurrencyContext'

interface HeaderProps {
  cartCount: number
}

export default function Header({ cartCount }: HeaderProps) {
  const { lang, setLang, t } = useLocale()
  const { currency, setCurrency } = useCurrency()
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
              to="/catalog"
              className="text-sm font-medium text-gray-300 hover:text-gold transition-colors"
            >
              {t.catalog}
            </Link>
            <Link
              to="/delivery"
              className="text-sm font-medium text-gray-300 hover:text-gold transition-colors"
            >
              {t.delivery}
            </Link>
            <Link
              to="/about"
              className="text-sm font-medium text-gray-300 hover:text-gold transition-colors"
            >
              {t.about}
            </Link>
            <Link
              to="/contacts"
              className="text-sm font-medium text-gray-300 hover:text-gold transition-colors"
            >
              {t.contacts}
            </Link>
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-3">
            {/* Quick contact — real phone/WhatsApp, always reachable without
                scrolling to the footer (mobile audit flagged this as the
                main conversion blocker: no fast way to reach a manager) */}
            <a
              href="tel:+998951854797"
              className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg border border-gold-700/30 text-gray-300 hover:text-gold hover:border-gold/50 transition-all"
              aria-label={lang === 'uz' ? "Qo'ng'iroq qilish" : 'Позвонить'}
            >
              <Phone size={16} />
            </a>
            <a
              href="https://wa.me/998951854797"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9 rounded-lg border border-green-700/30 text-green-400 hover:border-green-500/60 transition-all"
              aria-label="WhatsApp"
            >
              <MessageCircle size={14} className="sm:hidden" /><MessageCircle size={16} className="hidden sm:block" />
            </a>

            {/* Currency switcher */}
            <div className="flex rounded-lg overflow-hidden border border-gold-700/30">
              {(['UZS', 'USD'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    currency === c
                      ? 'bg-gold text-anthracite-900'
                      : 'text-gray-400 hover:text-gold'
                  }`}
                >
                  {c === 'UZS' ? (lang === 'uz' ? "so'm" : 'сум') : '$'}
                </button>
              ))}
            </div>

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

            {/* Cart — icon-only on phones: the full label ("Спецификация")
                was wide enough, combined with the language switcher and
                WhatsApp button, to push the hamburger toggle off the right
                edge of narrow screens (real-device report: had to pinch-
                zoom out for the page to fit). */}
            <button
              onClick={() => navigate('/cart')}
              aria-label={t.cart}
              className="relative flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg border border-gold-700/30 text-gray-300 hover:text-gold hover:border-gold/50 transition-all"
            >
              <ShoppingCart size={18} />
              <span className="hidden sm:inline text-sm font-medium">{t.cart}</span>
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
              aria-label={menuOpen ? (lang === 'uz' ? 'Menyuni yopish' : 'Закрыть меню') : (lang === 'uz' ? 'Menyuni ochish' : 'Открыть меню')}
              aria-expanded={menuOpen}
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
            to="/catalog"
            className="block py-2 text-gray-300 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {t.catalog}
          </Link>
          <Link
            to="/delivery"
            className="block py-2 text-gray-300 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {t.delivery}
          </Link>
          <Link
            to="/about"
            className="block py-2 text-gray-300 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {t.about}
          </Link>
          <Link
            to="/contacts"
            className="block py-2 text-gray-300 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {t.contacts}
          </Link>
          <Link
            to="/cart"
            className="block py-2 text-gray-300 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {t.cart} {cartCount > 0 && `(${cartCount})`}
          </Link>
          <a
            href="tel:+998951854797"
            className="flex items-center gap-2 py-2 text-gray-300 hover:text-gold transition-colors"
          >
            <Phone size={16} /> +998 95 185 47 97
          </a>
        </div>
      )}
    </header>
  )
}
