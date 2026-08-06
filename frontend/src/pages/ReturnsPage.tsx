import { Package, PhoneCall, RotateCcw, ShieldCheck, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { useLocale } from '../contexts/LocaleContext'
import { setSeo } from '../lib/seo'

export default function ReturnsPage() {
  const { lang, t } = useLocale()

  useEffect(() => {
    setSeo({
      title: lang === 'uz' ? 'Mahsulotni qaytarish — SR Lux' : 'Возврат товара — SR Lux',
      description: lang === 'uz'
        ? "SR Lux mahsulotlarini qaytarish shartlari: 14 kun, O'zbekiston va Qozog'iston."
        : 'Условия возврата товаров SR Lux: 14 дней, Узбекистан и Казахстан.',
      path: '/returns',
    })
  }, [lang])

  return (
    <div className="min-h-screen bg-anthracite-900">
      {/* Hero */}
      <section className="relative bg-dark-gradient border-b border-gold-700/20 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-1/3 w-72 h-72 bg-gold rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <p className="text-gold text-xs font-semibold uppercase tracking-widest mb-3">
            {lang === 'uz' ? 'Mahsulotni qaytarish' : 'Возврат товара'}
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-4">
            {lang === 'uz' ? 'Qaytarish shartlari' : 'Условия возврата'}
          </h1>
          <p className="text-gray-400 text-lg">
            {lang === 'uz'
              ? "O'zbekiston va Qozog'iston bo'ylab barcha buyurtmalar uchun"
              : 'Для всех заказов по Узбекистану и Казахстану'}
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-14">
        {/* Return terms */}
        <div>
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <RotateCcw size={20} className="text-gold" />
            {lang === 'uz' ? 'Qaytarish tartibi' : 'Порядок возврата'}
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            {lang === 'uz'
              ? "Qaytarish shartlari O'zbekiston va Qozog'istondagi barcha mijozlar uchun bir xil"
              : 'Условия одинаковы для клиентов в Узбекистане и Казахстане'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-anthracite-800 rounded-2xl border border-gold-700/10 p-5 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                <RotateCcw size={20} className="text-gold" />
              </div>
              <h3 className="text-white font-semibold text-sm">
                {lang === 'uz' ? 'Muddat — 14 kun' : 'Срок — 14 дней'}
              </h3>
              <p className="text-gray-400 text-xs leading-relaxed">
                {lang === 'uz'
                  ? 'Mahsulotni olgan kundan boshlab 14 kun ichida qaytarish mumkin.'
                  : 'Товар можно вернуть в течение 14 дней с момента получения.'}
              </p>
            </div>
            <div className="bg-anthracite-800 rounded-2xl border border-gold-700/10 p-5 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                <Truck size={20} className="text-gold" />
              </div>
              <h3 className="text-white font-semibold text-sm">
                {lang === 'uz' ? "Qaytarish yetkazib berishi" : 'Доставка при возврате'}
              </h3>
              <p className="text-gray-400 text-xs leading-relaxed">
                {lang === 'uz'
                  ? "Mahsulotni qaytarib yuborish xarajatini xaridor to'laydi."
                  : 'Расходы на обратную доставку товара оплачивает покупатель.'}
              </p>
            </div>
            <div className="bg-anthracite-800 rounded-2xl border border-gold-700/10 p-5 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                <PhoneCall size={20} className="text-gold" />
              </div>
              <h3 className="text-white font-semibold text-sm">
                {lang === 'uz' ? "Qanday qaytarish kerak" : 'Как оформить возврат'}
              </h3>
              <p className="text-gray-400 text-xs leading-relaxed">
                {lang === 'uz'
                  ? "Qaytarishni rasmiylashtirish uchun +998 95 185 47 97 raqamiga qo'ng'iroq qiling."
                  : 'Чтобы оформить возврат, позвоните нам: +998 95 185 47 97.'}
              </p>
            </div>
          </div>
        </div>

        {/* Warranty cross-link */}
        <div className="bg-anthracite-800 rounded-2xl border border-gold-700/15 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck size={22} className="text-gold" />
            <h2 className="text-xl font-bold text-white">
              {lang === 'uz' ? 'Kafolat' : 'Гарантия'}
            </h2>
          </div>
          <p className="text-gray-300 text-sm leading-7">
            {lang === 'uz'
              ? "Qaytarish muddati tugagandan so'ng ham mahsulotlarga zavod kafolatiga murojaat qilishingiz mumkin. Batafsil: "
              : 'Помимо возврата, на всю продукцию действует заводская гарантия — подробнее на странице '}
            <Link to="/delivery" className="text-gold hover:underline">
              {lang === 'uz' ? "yetkazib berish va to'lov" : 'доставки и оплаты'}
            </Link>
            .
          </p>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gold hover:bg-gold-600 text-anthracite-900 font-bold text-sm transition-all shadow-gold"
          >
            <Package size={16} />
            {t.catalog}
          </Link>
        </div>
      </div>
    </div>
  )
}
