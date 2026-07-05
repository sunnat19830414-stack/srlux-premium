import { BadgeCheck, Building2, CreditCard, Package, ShieldCheck, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLocale } from '../contexts/LocaleContext'

const DELIVERY_OPTIONS = [
  {
    icon: Truck,
    titleRu: 'Доставка по Ташкенту',
    titleUz: 'Toshkent bo\'yicha yetkazib berish',
    textRu: 'Доставка в день заказа или на следующий рабочий день. Бесплатно при заказе от 1 000 000 сум.',
    textUz: 'Buyurtma kuni yoki keyingi ish kunida yetkazib berish. 1 000 000 so\'mdan yuqori buyurtmada bepul.',
    badge: null,
    badgeColor: '',
  },
  {
    icon: Building2,
    titleRu: 'Доставка по регионам',
    titleUz: 'Viloyatlarga yetkazib berish',
    textRu: 'Доставка транспортными компаниями по всему Узбекистану. Срок — 2–5 рабочих дней.',
    textUz: 'O\'zbekiston bo\'ylab transport kompaniyalari orqali yetkazib berish. Muddat — 2–5 ish kuni.',
    badge: null,
    badgeColor: '',
  },
  {
    icon: Package,
    titleRu: 'Самовывоз',
    titleUz: 'O\'zi olib ketish',
    textRu: 'Бесплатно со склада по адресу: г. Ташкент, ул. Амира Темура 107Б. Пн–Пт 9:00–18:00.',
    textUz: 'Ombordan bepul: Toshkent, Amir Temur ko\'chasi 107B. Du–Ju 9:00–18:00.',
    badge: 'Бесплатно',
    badgeColor: 'bg-green-900/50 text-green-400',
  },
]

const PAYMENT_OPTIONS = [
  {
    icon: CreditCard,
    titleRu: 'Банковская карта',
    titleUz: 'Bank kartasi',
    textRu: 'Оплата картами Visa, MasterCard, Uzcard, Humo при получении или онлайн.',
    textUz: 'Visa, MasterCard, Uzcard, Humo kartalar bilan olishda yoki onlayn to\'lov.',
  },
  {
    icon: BadgeCheck,
    titleRu: 'Наличные',
    titleUz: 'Naqd pul',
    textRu: 'Оплата наличными при самовывозе или курьеру при доставке.',
    textUz: 'O\'zi olib ketishda yoki kuryer orqali naqd pul to\'lov.',
  },
  {
    icon: Building2,
    titleRu: 'Безналичный расчёт',
    titleUz: 'Naqdsiz hisob-kitob',
    textRu: 'Для юридических лиц — перевод на расчётный счёт, выставление счёта и договора.',
    textUz: 'Yuridik shaxslar uchun — hisob-faktura va shartnoma bilan hisob-raqamga o\'tkazma.',
  },
  {
    icon: ShieldCheck,
    titleRu: 'Рассрочка',
    titleUz: 'Bo\'lib to\'lash',
    textRu: 'Рассрочка 0% на 6–12 месяцев через партнёрские банки Узбекистана.',
    textUz: '6–12 oy muddatga 0% bo\'lib to\'lash, O\'zbekiston sherik banklari orqali.',
  },
]

export default function DeliveryPage() {
  const { lang, t } = useLocale()

  return (
    <div className="min-h-screen bg-anthracite-900">
      {/* Hero */}
      <section className="relative bg-dark-gradient border-b border-gold-700/20 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-1/3 w-72 h-72 bg-gold rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <p className="text-gold text-xs font-semibold uppercase tracking-widest mb-3">
            {lang === 'uz' ? 'Yetkazib berish va to\'lov' : 'Доставка и оплата'}
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-4">
            {lang === 'uz' ? 'Qulay yetkazib berish' : 'Удобная доставка'}
          </h1>
          <p className="text-gray-400 text-lg">
            {lang === 'uz'
              ? 'Toshkent va butun O\'zbekiston bo\'ylab tezkor yetkazib berish'
              : 'Быстрая доставка по Ташкенту и всему Узбекистану'}
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-14">
        {/* Delivery */}
        <div>
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <Truck size={20} className="text-gold" />
            {lang === 'uz' ? 'Yetkazib berish usullari' : 'Способы доставки'}
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            {lang === 'uz'
              ? 'Siz uchun qulay usulni tanlang'
              : 'Выберите удобный для вас способ'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {DELIVERY_OPTIONS.map((o) => (
              <div
                key={o.titleRu}
                className="bg-anthracite-800 rounded-2xl border border-gold-700/10 p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                    <o.icon size={20} className="text-gold" />
                  </div>
                  {o.badge && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${o.badgeColor}`}>
                      {o.badge}
                    </span>
                  )}
                </div>
                <h3 className="text-white font-semibold text-sm">
                  {lang === 'uz' ? o.titleUz : o.titleRu}
                </h3>
                <p className="text-gray-400 text-xs leading-relaxed">
                  {lang === 'uz' ? o.textUz : o.textRu}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Payment */}
        <div>
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <CreditCard size={20} className="text-gold" />
            {lang === 'uz' ? 'To\'lov usullari' : 'Способы оплаты'}
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            {lang === 'uz'
              ? 'Barcha qulay to\'lov usullarini qabul qilamiz'
              : 'Принимаем все удобные способы оплаты'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {PAYMENT_OPTIONS.map((o) => (
              <div
                key={o.titleRu}
                className="bg-anthracite-800 rounded-2xl border border-gold-700/10 p-5 flex gap-4"
              >
                <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                  <o.icon size={20} className="text-gold" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm mb-1">
                    {lang === 'uz' ? o.titleUz : o.titleRu}
                  </h3>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    {lang === 'uz' ? o.textUz : o.textRu}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Warranty */}
        <div className="bg-anthracite-800 rounded-2xl border border-gold-700/15 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck size={22} className="text-gold" />
            <h2 className="text-xl font-bold text-white">
              {lang === 'uz' ? 'Kafolat' : 'Гарантия'}
            </h2>
          </div>
          <p className="text-gray-300 text-sm leading-7 mb-4">
            {lang === 'uz'
              ? 'Barcha mahsulotlar rasmiy zavod kafolatiga ega — 3 yildan 10 yilgacha, mahsulot turiga qarab. Kafolat muddati cheki va xarid hujjatidan boshlanadi.'
              : 'Вся продукция имеет официальную заводскую гарантию — от 3 до 10 лет в зависимости от типа оборудования. Гарантийный срок отсчитывается с момента покупки по чеку.'}
          </p>
          <p className="text-gray-300 text-sm leading-7">
            {lang === 'uz'
              ? 'Kafolat bo\'yicha murojaat uchun bizning xizmat markazimizga murojaat qiling: +998 71 123 45 67.'
              : 'По вопросам гарантийного обслуживания обращайтесь в наш сервисный центр: +998 71 123 45 67.'}
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
