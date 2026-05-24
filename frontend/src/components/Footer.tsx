import { Phone, MapPin, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLocale } from '../contexts/LocaleContext'

export default function Footer() {
  const { t } = useLocale()
  const year = new Date().getFullYear()

  return (
    <footer className="bg-anthracite-900 border-t border-gold-700/20 mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Brand */}
          <div>
            <Link to="/" className="inline-block mb-4">
              <img
                src="/public_assets/logo-vertical.png"
                alt="SR Lux"
                className="h-16 w-auto"
                onError={(e) => {
                  const el = e.currentTarget
                  el.style.display = 'none'
                  const span = el.nextElementSibling as HTMLElement
                  if (span) span.style.display = 'block'
                }}
              />
              <span
                className="hidden text-2xl font-bold bg-gold-gradient bg-clip-text text-transparent"
                style={{ display: 'none' }}
              >
                SR LUX
              </span>
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed">
              Premium системы отопления и климат-контроля.
              Официальный дистрибьютор в Узбекистане.
            </p>
          </div>

          {/* Contacts */}
          <div>
            <h3 className="text-gold font-semibold mb-4 uppercase tracking-wider text-sm">
              {t.contactUs}
            </h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-gray-400 text-sm">
                <Phone size={15} className="text-gold shrink-0" />
                <span>+998 71 123 45 67</span>
              </li>
              <li className="flex items-start gap-3 text-gray-400 text-sm">
                <MapPin size={15} className="text-gold shrink-0 mt-0.5" />
                <span>г. Ташкент, ул. Амира Темура 107Б</span>
              </li>
              <li className="flex items-center gap-3 text-gray-400 text-sm">
                <Clock size={15} className="text-gold shrink-0" />
                <span>Пн–Пт 9:00–18:00</span>
              </li>
            </ul>
          </div>

          {/* Nav */}
          <div>
            <h3 className="text-gold font-semibold mb-4 uppercase tracking-wider text-sm">
              Навигация
            </h3>
            <ul className="space-y-2">
              <li>
                <Link to="/" className="text-gray-400 hover:text-gold text-sm transition-colors">
                  {t.catalog}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-gold-700/10 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-gray-500 text-xs">
            © {year} SR Lux. {t.rights}.
          </p>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
            <span className="text-gray-500 text-xs">Powered by SR Lux ERP</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
