import { Award, ChevronRight, Home, Phone, Package, Shield, ShoppingCart, Thermometer, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Category, ModelCard } from '../api/client'
import { fetchCategories, fetchModels } from '../api/client'
import ModelCardComponent from '../components/ModelCard'
import { useLocale } from '../contexts/LocaleContext'
import { useCategoryTiles } from '../lib/categoryTiles'
import { organizationJsonLd, setSeo } from '../lib/seo'

interface HomePageProps {
  cartCount?: number
}

// Reused verbatim from AboutPage's STATS/FEATURES — real, already-approved
// claims (EN442 calc, RAL repaint, Tashkent warehouse), not new marketing copy.
const TRUST_STATS = [
  { value: '30+', labelRu: 'видов оборудования', labelUz: 'uskuna turi' },
  { value: '100%', labelRu: 'оригинал', labelUz: 'original' },
  { value: 'EN442', labelRu: 'стандарт мощности', labelUz: 'quvvat standarti' },
  { value: '200+', labelRu: 'цветов RAL', labelUz: 'RAL rangi' },
]

const USPS = [
  {
    icon: Award,
    titleRu: 'Покраска в любой RAL',
    titleUz: 'Istalgan RAL rangda bo\'yash',
    textRu: 'Вертикальные радиаторы — в любом из 200+ цветов палитры RAL под заказ.',
    textUz: 'Vertikal radiatorlar — buyurtma bilan RAL palitrasidan 200+ rangda.',
  },
  {
    icon: Shield,
    titleRu: 'Расчёт по EN442',
    titleUz: 'EN442 bo\'yicha hisob',
    textRu: 'Точная тепловая мощность, вес и размеры каждой модели — реальный расчёт, а не общие цифры.',
    textUz: "Har bir modelning aniq issiqlik quvvati, og'irligi va o'lchamlari — aniq hisob-kitob.",
  },
  {
    icon: Thermometer,
    titleRu: 'Бесплатная консультация',
    titleUz: 'Bepul maslahat',
    textRu: 'Наши инженеры подберут оптимальное решение для вашего объекта.',
    textUz: "Muhandislarimiz ob'yektingiz uchun optimal yechimni tanlaydi.",
  },
  {
    icon: Zap,
    titleRu: 'Склад в Ташкенте',
    titleUz: 'Toshkentda ombor',
    textRu: 'Доставка в день заказа или на следующий день.',
    textUz: 'Buyurtma kuni yoki keyingi kuni yetkazib beramiz.',
  },
]

// "Готовые решения" — two curated collections, each pointing at a real
// category branch rather than an invented "system design" flow SR Lux
// doesn't offer (unlike a boiler/underfloor-heating retailer, SR Lux sells
// individual designer units, not whole-house project consulting).
const COLLECTIONS = [
  {
    catId: 16,
    titleRu: 'Для ванной',
    titleUz: 'Hammom uchun',
    textRu: 'Полотенцесушители электрические — от лаконичных до дизайнерских',
    textUz: 'Elektr sochiq isitgichlari — laqonikdan dizaynerlikgacha',
    // Dedicated small WebP tile — PageSpeed flagged the full-size product
    // photo (800x800) being served into this ~515px card (2026-07-14).
    image: '/static/uploads/dol_2341_tile.webp',
  },
  {
    catId: 14,
    titleRu: 'Чугунные радиаторы',
    titleUz: "Cho'yan radiatorlar",
    textRu: 'Декоративное литьё в ретро-стиле — с покраской под бронзу, золото или матовый цвет',
    textUz: "Retro uslubidagi dekorativ liteyka — bronza, oltin yoki mat rangda bo'yash bilan",
    image: '/static/uploads/dol_2396_tile.webp',
  },
]

// "Подобрать по помещению" — same idea as a needs-based quiz, but mapped to
// categories that actually exist in the catalog instead of a multi-step form.
const ROOM_PICKS = [
  { catId: 16, emoji: '🛁', labelRu: 'Ванная', labelUz: 'Hammom' },
  { catId: 1, emoji: '🛋', labelRu: 'Гостиная', labelUz: 'Mehmonxona' },
  { catId: 13, emoji: '🏢', labelRu: 'Офис / коммерция', labelUz: "Ofis / tijorat" },
]

// A handful of flagship models spanning every featured category — shown as
// "Хиты продаж" so the front door proves the catalog's range in one glance
// instead of an arbitrary "first N" slice.
const FEATURED_MODELS: { code: string; catId: number }[] = [
  { code: 'JDC22', catId: 1 },
  { code: 'GZ3', catId: 1 },
  { code: 'CM20', catId: 16 },
  { code: 'BZ-570_bg', catId: 1 },
  { code: 'HY610_WIFI', catId: 12 },
  { code: 'NCR03', catId: 1 },
]
// CM20 groups a black and a chrome variant whose names sort opposite their
// image paths (MIN(name_ru) lands on the chrome one, MAX(image_url) lands on
// the black one) — pin both to the same (chrome) variant so the card doesn't
// show a chrome-labelled photo of the black unit.
const FEATURED_MODEL_OVERRIDE: Record<string, Partial<ModelCard>> = {
  CM20: {
    name_ru: 'SR Lux Дуо Хромированная круглая',
    name_uz: 'SR Lux Duo Xromlangan dumaloq',
    image_url: '/static/uploads/dol_2343.jpg',
  },
}
const FEATURED_TABS = [
  { catId: null, labelRu: 'Все', labelUz: 'Barchasi' },
  { catId: 1, labelRu: 'Радиаторы', labelUz: 'Radiatorlar' },
  { catId: 16, labelRu: 'Полотенцесушители', labelUz: 'Sochiq isitgichlari' },
  { catId: 12, labelRu: 'Термостаты', labelUz: 'Termostatlar' },
]

export default function HomePage({ cartCount = 0 }: HomePageProps) {
  const { t, lang } = useLocale()
  const [models, setModels] = useState<ModelCard[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [featuredTab, setFeaturedTab] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([fetchModels(), fetchCategories()])
      .then(([modelsRes, catsRes]) => {
        setModels(modelsRes.data.models)
        setCategories(catsRes.data)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setSeo({
      title: 'SR Lux — Премиальные системы отопления и климат-контроля',
      description: t.heroSubtitle,
      path: '/',
      image: '/public_assets/logo-horizontal.png',
      type: 'website',
      jsonLd: organizationJsonLd(),
    })
  }, [lang, t.heroSubtitle])

  // Every descendant (inclusive) of each root category, so a tile for
  // "Радиаторы" matches models filed under any of its Вертикальные/
  // Горизонтальные/... sub-branches, not just ones linked to the root itself.
  const descendantsByRoot = useMemo(() => {
    const childrenOf = new Map<number, number[]>()
    categories.forEach((c) => {
      if (c.parent_id != null) {
        childrenOf.set(c.parent_id, [...(childrenOf.get(c.parent_id) ?? []), c.id])
      }
    })
    const result = new Map<number, Set<number>>()
    // Covers ids referenced by COLLECTIONS/ROOM_PICKS (e.g. the
    // "Вертикальные" branch, id 39) so their cover-photo lookup below
    // isn't limited to an exact (never-used) match on the id itself.
    // The featured category tiles themselves are computed by the shared
    // useCategoryTiles hook below, not here.
    const allRootIds = new Set([
      ...COLLECTIONS.map((c) => c.catId),
      ...ROOM_PICKS.map((r) => r.catId),
    ])
    for (const rootId of allRootIds) {
      const ids = new Set<number>([rootId])
      const stack = [rootId]
      while (stack.length) {
        const cur = stack.pop()!
        for (const childId of childrenOf.get(cur) ?? []) {
          if (!ids.has(childId)) {
            ids.add(childId)
            stack.push(childId)
          }
        }
      }
      result.set(rootId, ids)
    }
    return result
  }, [categories])

  const categoryTiles = useCategoryTiles(categories, models)

  const featuredModels = useMemo(
    () =>
      FEATURED_MODELS
        .filter((f) => featuredTab == null || f.catId === featuredTab)
        .map((f) => {
          const m = models.find((m) => m.code === f.code)
          return m && FEATURED_MODEL_OVERRIDE[f.code] ? { ...m, ...FEATURED_MODEL_OVERRIDE[f.code] } : m
        })
        .filter(Boolean) as ModelCard[],
    [models, featuredTab],
  )

  return (
    <div className="min-h-screen bg-anthracite-900 pb-16 md:pb-0">
      {/* Hero */}
      <section className="relative bg-dark-gradient border-b border-gold-700/20 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-gold rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-gold-600 rounded-full blur-2xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-4 leading-tight">
            {t.heroTitle}
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-8">
            {t.heroSubtitle}
          </p>
          <Link
            to="/catalog"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gold hover:bg-gold-600 text-anthracite-900 font-bold text-sm transition-all shadow-gold hover:shadow-gold-lg"
          >
            {t.heroCta}
            <ChevronRight size={16} />
          </Link>

          {/* Trust stats — same figures as the "О компании" page */}
          <div className="grid grid-cols-4 gap-2 sm:gap-6 max-w-lg mx-auto mt-10">
            {TRUST_STATS.map((s) => (
              <div key={s.value} className="text-center">
                <p className="text-lg sm:text-2xl font-extrabold bg-gold-gradient bg-clip-text text-transparent mb-0.5">
                  {s.value}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-400 leading-tight">
                  {lang === 'uz' ? s.labelUz : s.labelRu}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Category tiles — the front door into the catalog */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <h2 className="text-2xl font-bold text-white mb-1">
          {lang === 'uz' ? 'Sizga nima kerak?' : 'Что вам нужно?'}
        </h2>
        <p className="text-gray-400 text-sm mb-8">
          {lang === 'uz' ? 'Kerakli uskunaga tezkor o\'tish' : 'Быстрый переход к нужному оборудованию'}
        </p>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-anthracite-800 rounded-xl h-48 animate-pulse border border-gold-700/10" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {categoryTiles.map(({ rootId, cat, image, count }) => (
              <Link
                key={rootId}
                to={`/catalog?cat=${rootId}`}
                className="group relative h-48 sm:h-56 rounded-xl overflow-hidden border border-gold-700/10 bg-anthracite-800"
              >
                {image ? (
                  <img
                    src={image}
                    alt={cat!.name_ru}
                    className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-105 transition-all duration-300"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-anthracite-900 via-anthracite-900/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="text-white font-bold text-sm sm:text-lg leading-tight">
                    {lang === 'uz' ? (cat!.name_uz || cat!.name_ru) : cat!.name_ru}
                  </p>
                  {count > 0 && (
                    <p className="text-gray-300 text-xs mt-1">
                      {count} {lang === 'uz' ? 'model' : 'моделей'}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Готовые решения — horizontal scroll on mobile, grid from sm up */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 border-t border-gold-700/10">
        <h2 className="text-2xl font-bold text-white mb-1">
          {lang === 'uz' ? 'Tayyor yechimlar' : 'Готовые решения'}
        </h2>
        <p className="text-gray-400 text-sm mb-8">
          {lang === 'uz' ? 'Har biri o\'z kategoriyasiga olib boradi' : 'Каждая ведёт в свою категорию каталога'}
        </p>
        <div className="flex sm:grid sm:grid-cols-2 gap-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory">
          {COLLECTIONS.map((c) => (
            <Link
              key={c.catId}
              to={`/catalog?cat=${c.catId}`}
              className="group relative shrink-0 w-[78%] sm:w-auto h-56 rounded-2xl overflow-hidden border border-gold-700/10 bg-anthracite-800 snap-start"
            >
              {(() => {
                const ids = descendantsByRoot.get(c.catId) ?? new Set([c.catId])
                const cover = models.find((m) => m.image_url && m.category_ids.some((cid) => ids.has(cid)))
                const image = c.image ?? cover?.image_url
                return image ? (
                  <img
                    src={image}
                    alt={c.titleRu}
                    className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-105 transition-all duration-300"
                  />
                ) : null
              })()}
              <div className="absolute inset-0 bg-gradient-to-t from-anthracite-900 via-anthracite-900/50 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <h3 className="text-white font-bold text-xl mb-1">
                  {lang === 'uz' ? c.titleUz : c.titleRu}
                </h3>
                <p className="text-gray-300 text-sm">{lang === 'uz' ? c.textUz : c.textRu}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Подобрать по помещению */}
      <section className="mx-4 sm:mx-6 lg:mx-8 rounded-2xl bg-anthracite-800 border border-gold-700/10 p-6 sm:p-8 max-w-7xl lg:mx-auto">
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
          {lang === 'uz' ? 'Nimani tanlashni bilmayapsizmi?' : 'Не знаете, что выбрать?'}
        </h2>
        <p className="text-gray-400 text-sm mb-5">
          {lang === 'uz'
            ? "Xonangizni tanlang — mos kategoriyani ko'rsatamiz."
            : 'Выберите помещение — мы покажем подходящую категорию.'}
        </p>
        <div className="grid gap-2.5">
          {ROOM_PICKS.map((r) => (
            <Link
              key={r.catId}
              to={`/catalog?cat=${r.catId}`}
              className="flex items-center justify-between bg-anthracite-900 hover:bg-black/40 rounded-xl px-4 py-3.5 text-white font-semibold text-sm transition-colors border border-gold-700/10"
            >
              <span className="flex items-center gap-2.5">
                <span className="text-lg">{r.emoji}</span>
                {lang === 'uz' ? r.labelUz : r.labelRu}
              </span>
              <ChevronRight size={16} className="text-gold" />
            </Link>
          ))}
        </div>
      </section>

      {/* Хиты продаж */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <h2 className="text-2xl font-bold text-white mb-5">
          {lang === 'uz' ? 'Xitlar' : 'Хиты продаж'}
        </h2>
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-6 pb-1">
          {FEATURED_TABS.map((tab) => (
            <button
              key={tab.labelRu}
              onClick={() => setFeaturedTab(tab.catId)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                featuredTab === tab.catId
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-gray-700 text-gray-400 hover:border-gold/50'
              }`}
            >
              {lang === 'uz' ? tab.labelUz : tab.labelRu}
            </button>
          ))}
        </div>
        {!loading && featuredModels.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-5">
            {featuredModels.map((m) => (
              <ModelCardComponent key={m.code} model={m} />
            ))}
          </div>
        )}
      </section>

      {/* УТП */}
      <section className="bg-anthracite-800 border-y border-gold-700/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {USPS.map((f) => (
              <div key={f.titleRu} className="flex flex-col items-start gap-3">
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
            to="/catalog"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-gold-700/40 text-gold hover:bg-gold/5 font-medium text-sm transition-all"
          >
            {t.catalog}
          </Link>
        </div>
      </section>

      {/* Bottom sticky nav — mobile only, mirrors the app-like pattern from
          the reference concept. "Главная" reads active since this is "/". */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 bg-anthracite-800 border-t border-gold-700/20">
        <Link to="/" className="flex flex-col items-center gap-1 py-2.5 text-gold">
          <Home size={20} />
          <span className="text-[10px] font-medium">{lang === 'uz' ? 'Bosh sahifa' : 'Главная'}</span>
        </Link>
        <Link to="/catalog" className="flex flex-col items-center gap-1 py-2.5 text-gray-400">
          <Package size={20} />
          <span className="text-[10px] font-medium">{t.catalog}</span>
        </Link>
        <Link to="/contacts" className="flex flex-col items-center gap-1 py-2.5 text-gray-400">
          <Phone size={20} />
          <span className="text-[10px] font-medium">{t.contacts}</span>
        </Link>
        <Link to="/cart" className="relative flex flex-col items-center gap-1 py-2.5 text-gray-400">
          <ShoppingCart size={20} />
          <span className="text-[10px] font-medium">{t.cart}</span>
          {cartCount > 0 && (
            <span className="absolute top-1 right-[calc(50%-20px)] w-4 h-4 rounded-full bg-gold text-anthracite-900 text-[9px] font-bold flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </Link>
      </nav>
    </div>
  )
}
