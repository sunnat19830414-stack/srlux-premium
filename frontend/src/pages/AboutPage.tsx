import { Award, Clock, MapPin, Phone, Shield, Star, Thermometer, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLocale } from '../contexts/LocaleContext'

const FEATURES = [
  {
    icon: Award,
    titleRu: 'Официальный дистрибьютор',
    titleUz: 'Rasmiy distribyutor',
    textRu: 'Эксклюзивный представитель ведущих европейских брендов систем отопления в Узбекистане.',
    textUz: "O'zbekistonda yetakchi Yevropa isitish tizimlari brendlarining eksklyuziv vakili.",
  },
  {
    icon: Shield,
    titleRu: 'Гарантия качества',
    titleUz: 'Sifat kafolati',
    textRu: 'Вся продукция сертифицирована и имеет официальную заводскую гарантию от 3 до 10 лет.',
    textUz: 'Barcha mahsulotlar sertifikatlangan va 3 yildan 10 yilgacha rasmiy zavod kafolatiga ega.',
  },
  {
    icon: Thermometer,
    titleRu: 'Экспертная консультация',
    titleUz: 'Ekspert maslahati',
    textRu: 'Наши инженеры подберут оптимальное решение для вашего объекта — бесплатно.',
    textUz: "Muhandislarimiz ob'yektingiz uchun optimal yechimni bepul tanlaydi.",
  },
  {
    icon: Zap,
    titleRu: 'Быстрая доставка',
    titleUz: 'Tez yetkazib berish',
    textRu: 'Товары на складе в Ташкенте — доставка в день заказа или на следующий день.',
    textUz: 'Tovarlar Toshkentdagi omborda — buyurtma kuni yoki keyingi kuni yetkazib beramiz.',
  },
]

const STATS = [
  { value: '12+', labelRu: 'лет на рынке', labelUz: 'yil bozorda' },
  { value: '5 000+', labelRu: 'объектов сдано', labelUz: "ob'ekt topshirildi" },
  { value: '30+', labelRu: 'видов оборудования', labelUz: 'uskuna turi' },
  { value: '100%', labelRu: 'оригинальная продукция', labelUz: 'original mahsulot' },
]

export default function AboutPage() {
  const { lang, t } = useLocale()

  return (
    <div className="min-h-screen bg-anthracite-900">
      {/* Hero */}
      <section className="relative bg-dark-gradient border-b border-gold-700/20 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-gold rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-gold-600 rounded-full blur-2xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <p className="text-gold text-xs font-semibold uppercase tracking-widest mb-4">
            {lang === 'uz' ? 'Kompaniya haqida' : 'О компании'}
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-6 leading-tight">
            SR Lux — {lang === 'uz' ? 'premium isitish tizimlari' : 'премиальные системы отопления'}
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            {lang === 'uz'
              ? 'O\'zbekistonda isitish va iqlim-nazorat tizimlarining rasmiy distribyutori. 2012 yildan beri mijozlarga xizmat ko\'rsatib kelmoqdamiz.'
              : 'Официальный дистрибьютор систем отопления и климат-контроля в Узбекистане. Обслуживаем клиентов с 2012 года.'}
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-gold-700/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map((s) => (
              <div key={s.value} className="text-center">
                <p className="text-3xl sm:text-4xl font-extrabold bg-gold-gradient bg-clip-text text-transparent mb-1">
                  {s.value}
                </p>
                <p className="text-sm text-gray-400">{lang === 'uz' ? s.labelUz : s.labelRu}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl font-bold text-white text-center mb-12">
          {lang === 'uz' ? 'Nima uchun bizni tanlashadi?' : 'Почему выбирают нас?'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.titleRu}
              className="bg-anthracite-800 rounded-2xl border border-gold-700/10 p-6 flex gap-4"
            >
              <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                <f.icon size={22} className="text-gold" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">
                  {lang === 'uz' ? f.titleUz : f.titleRu}
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {lang === 'uz' ? f.textUz : f.textRu}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* About text */}
      <section className="bg-anthracite-800 border-y border-gold-700/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="flex items-center gap-3 mb-6">
            <Star size={20} className="text-gold" />
            <h2 className="text-xl font-bold text-white">
              {lang === 'uz' ? 'Bizning missiyamiz' : 'Наша миссия'}
            </h2>
          </div>
          <p className="text-gray-300 text-base leading-8 mb-6">
            {lang === 'uz'
              ? 'SR Lux - O\'zbekistondagi har bir uyda va har bir binoda qulay, energiya tejamkor va ishonchli isitish tizimini yaratishga intiladi. Biz faqat sertifikatlangan Yevropa ishlab chiqaruvchilarining mahsulotlarini taqdim etamiz va har bir buyurtmani individual yondashuv bilan bajaramiz.'
              : 'SR Lux стремится создать комфортную, энергоэффективную и надёжную систему отопления в каждом доме и каждом здании Узбекистана. Мы предлагаем только сертифицированную продукцию европейских производителей и выполняем каждый заказ с индивидуальным подходом.'}
          </p>
          <p className="text-gray-300 text-base leading-8">
            {lang === 'uz'
              ? 'Kompaniyamiz 2012 yilda tashkil etilgan va bugungi kunda mamlakatning yirik shaharlari va viloyatlarida 5 000 dan ortiq ob\'ektni xizmat ko\'rsatib kelmoqda. Bizning xodimlarimiz muntazam ravishda Yevropa ishlab chiqaruvchi zavodlarida treningdan o\'tadi.'
              : 'Компания основана в 2012 году и сегодня обслуживает более 5 000 объектов в крупных городах и регионах страны. Наши сотрудники регулярно проходят обучение на заводах европейских производителей.'}
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">
          {lang === 'uz' ? 'Savollaringiz bormi?' : 'Остались вопросы?'}
        </h2>
        <p className="text-gray-400 mb-8">
          {lang === 'uz'
            ? 'Mutaxassislarimiz bilan bog\'laning — bepul maslahat beramiz.'
            : 'Свяжитесь с нашими специалистами — мы дадим бесплатную консультацию.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/contacts"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gold hover:bg-gold-600 text-anthracite-900 font-bold text-sm transition-all shadow-gold"
          >
            <Phone size={16} />
            {t.contacts}
          </Link>
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-gold-700/40 text-gold hover:bg-gold/5 font-medium text-sm transition-all"
          >
            {t.catalog}
          </Link>
        </div>
      </section>
    </div>
  )
}
