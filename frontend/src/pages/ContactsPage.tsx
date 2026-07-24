import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { useEffect } from 'react'
import { useLocale } from '../contexts/LocaleContext'
import { setSeo } from '../lib/seo'

export default function ContactsPage() {
  const { lang } = useLocale()

  useEffect(() => {
    setSeo({
      title: lang === 'uz' ? 'Kontaktlar — SR Lux' : 'Контакты — SR Lux',
      description: lang === 'uz' ? "SR Lux bilan bog'laning: telefon, WhatsApp, Toshkentdagi shourum manzili, ish vaqti." : 'Свяжитесь с SR Lux: телефон, WhatsApp, адрес шоурума в Ташкенте, режим работы.',
      path: '/contacts',
    })
  }, [lang])

  const PHONE_PRIMARY = '+998 95 185 47 97'
  const PHONE_SECONDARY = '+998 90 185 47 97'
  const ADDRESS = lang === 'uz' ? "Toshkent sh., Usta Shirin ko'chasi 111D" : 'г. Ташкент, ул. Уста Ширин 111D'
  const HOURS_WEEKDAY = lang === 'uz' ? 'Du–Shanba: 9:00–18:00' : 'Пн–Сб: 9:00–18:00'
  const HOURS_SUN = lang === 'uz' ? 'Yakshanba: dam olish kuni' : 'Вс: выходной'

  return (
    <div className="min-h-screen bg-anthracite-900">
      {/* Hero */}
      <section className="relative bg-dark-gradient border-b border-gold-700/20 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-1/3 w-72 h-72 bg-gold rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <p className="text-gold text-xs font-semibold uppercase tracking-widest mb-3">
            {lang === 'uz' ? 'Aloqa' : 'Контакты'}
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-4">
            {lang === 'uz' ? 'Biz bilan bog\'laning' : 'Свяжитесь с нами'}
          </h1>
          <p className="text-gray-400 text-lg">
            {lang === 'uz'
              ? 'Istalgan savol bo\'yicha murojaat qiling — javob berishga tayyormiz.'
              : 'По любому вопросу — готовы ответить и помочь.'}
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Contact details */}
          <div className="space-y-5">
            {/* Phones */}
            <div className="bg-anthracite-800 rounded-2xl border border-gold-700/10 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                  <Phone size={18} className="text-gold" />
                </div>
                <h2 className="text-white font-semibold">
                  {lang === 'uz' ? 'Telefon raqamlar' : 'Телефоны'}
                </h2>
              </div>
              <a
                href={`tel:${PHONE_PRIMARY.replace(/\s/g, '')}`}
                className="block text-2xl font-bold text-gold hover:text-gold-400 transition-colors mb-2"
              >
                {PHONE_PRIMARY}
              </a>
              <a
                href={`tel:${PHONE_SECONDARY.replace(/\s/g, '')}`}
                className="block text-xl font-medium text-gray-300 hover:text-gold transition-colors"
              >
                {PHONE_SECONDARY}
              </a>
              <p className="text-xs text-gray-500 mt-3">
                {lang === 'uz' ? 'Ish vaqtida qo\'ng\'iroq qiling' : 'Звоните в рабочее время'}
              </p>
            </div>

            {/* WhatsApp */}
            <div className="bg-anthracite-800 rounded-2xl border border-gold-700/10 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-green-900/40 flex items-center justify-center">
                  <MessageCircle size={18} className="text-green-400" />
                </div>
                <h2 className="text-white font-semibold">WhatsApp</h2>
              </div>
              <a
                href="https://wa.me/998951854797"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-700 hover:bg-green-600 text-white font-semibold text-sm transition-colors"
              >
                <MessageCircle size={16} />
                {lang === 'uz' ? 'WhatsApp\'da yozing' : 'Написать в WhatsApp'}
              </a>
              <p className="text-xs text-gray-500 mt-3">
                {lang === 'uz' ? 'Tezkor javob' : 'Быстрый ответ'}
              </p>
            </div>

            {/* Email */}
            <div className="bg-anthracite-800 rounded-2xl border border-gold-700/10 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                  <Mail size={18} className="text-gold" />
                </div>
                <h2 className="text-white font-semibold">Email</h2>
              </div>
              <a
                href="mailto:info@srlux.uz"
                className="text-gold hover:text-gold-400 font-medium transition-colors"
              >
                info@srlux.uz
              </a>
            </div>
          </div>

          {/* Address + Hours */}
          <div className="space-y-5">
            <div className="bg-anthracite-800 rounded-2xl border border-gold-700/10 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                  <MapPin size={18} className="text-gold" />
                </div>
                <h2 className="text-white font-semibold">
                  {lang === 'uz' ? 'Manzil' : 'Адрес'}
                </h2>
              </div>
              <p className="text-gray-200 font-medium mb-1">{ADDRESS}</p>
              <p className="text-gray-500 text-sm mb-4">
                {lang === 'uz'
                  ? 'Ofis 3-qavat, 5-xona'
                  : 'Офис, 3 этаж, каб. 5'}
              </p>
              <a
                href="https://maps.google.com/?q=Tashkent+Usta+Shirin+111D"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-gold hover:underline"
              >
                <MapPin size={14} />
                {lang === 'uz' ? 'Xaritada ko\'rish' : 'Смотреть на карте'}
              </a>
            </div>

            <div className="bg-anthracite-800 rounded-2xl border border-gold-700/10 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                  <Clock size={18} className="text-gold" />
                </div>
                <h2 className="text-white font-semibold">
                  {lang === 'uz' ? 'Ish vaqti' : 'Режим работы'}
                </h2>
              </div>
              <ul className="space-y-2">
                <li className="flex justify-between text-sm">
                  <span className="text-gray-400">
                    {lang === 'uz' ? 'Du–Shanba' : 'Пн–Сб'}
                  </span>
                  <span className="text-white font-medium">9:00 – 18:00</span>
                </li>
                <li className="flex justify-between text-sm">
                  <span className="text-gray-400">
                    {lang === 'uz' ? 'Yakshanba' : 'Воскресенье'}
                  </span>
                  <span className="text-gray-500">
                    {lang === 'uz' ? 'Dam olish' : 'Выходной'}
                  </span>
                </li>
              </ul>
            </div>

            {/* Map placeholder */}
            <div className="bg-anthracite-800 rounded-2xl border border-gold-700/10 overflow-hidden h-48 flex items-center justify-center">
              <div className="text-center text-gray-600">
                <MapPin size={32} className="mx-auto mb-2" />
                <p className="text-sm">
                  {lang === 'uz' ? "Usta Shirin ko'chasi 111D" : 'ул. Уста Ширин 111D'}
                </p>
                <a
                  href="https://maps.google.com/?q=Tashkent+Usta+Shirin+111D"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gold hover:underline mt-1 inline-block"
                >
                  Google Maps →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
