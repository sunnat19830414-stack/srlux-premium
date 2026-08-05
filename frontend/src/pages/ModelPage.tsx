import DOMPurify from 'dompurify'
import { ArrowLeft, ImageOff, Palette, ShoppingCart } from 'lucide-react'
import ModelCardComponent from '../components/ModelCard'
import SmartImage from '../components/SmartImage'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ModelDetail, ModelVariant, Product, RelatedModels, Variant } from '../api/client'
import { fetchModel, fetchRelatedModels } from '../api/client'
import { useLocale } from '../contexts/LocaleContext'
import { absoluteUrl, setSeo } from '../lib/seo'

const COLOR_DISPLAY: Record<string, { label_ru: string; label_uz: string; hex: string; border?: boolean }> = {
  white:      { label_ru: 'Белый',       label_uz: "Oq",        hex: '#FFFFFF', border: true },
  anthracite: { label_ru: 'Антрацит',    label_uz: 'Antratsit', hex: '#484A4E' },
  black:      { label_ru: 'Чёрный',      label_uz: 'Qora',      hex: '#1C1C1E' },
  gold:       { label_ru: 'Золото',      label_uz: 'Oltin',     hex: '#C9A227' },
  chrome:     { label_ru: 'Хром',        label_uz: 'Xrom',      hex: '#C0C0C0', border: true },
  silver:     { label_ru: 'Серебристый', label_uz: 'Kumush',    hex: '#C4C6C8', border: true },
  raw:        { label_ru: 'Без покраски',  label_uz: "Bo'yalmagan", hex: '#B8B7AE', border: true },
}

function colorLabel(d: { label_ru: string; label_uz: string }, lang: 'ru' | 'uz') {
  return lang === 'uz' ? d.label_uz : d.label_ru
}

function fmt(n: number) {
  return Math.round(Number(n)).toLocaleString('ru-RU')
}

// Restricts the model's variants to a specific category branch (e.g. only
// "Вертикальные" heights, not "Горизонтальные") when the user arrived via a
// scoped catalog link. Falls back to the full variant list if the scope
// would otherwise leave nothing to show (stale/bad link, etc.).
function scopeVariants(variants: ModelVariant[], catFilter: Set<number> | null): ModelVariant[] {
  if (!catFilter) return variants
  const filtered = variants.filter((v) => v.category_id != null && catFilter.has(v.category_id))
  return filtered.length ? filtered : variants
}

interface Props {
  onAddToCart: (product: Product, variant: Variant | null, qty: number, customRal?: string) => void
}

const VERTICAL_RADIATOR_CATEGORY_IDS = new Set([39, 5, 6, 9, 49, 10, 11, 42, 45, 47])

export default function ModelPage({ onAddToCart }: Props) {
  const { code } = useParams<{ code: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  // "← Каталог" should behave like a real back-navigation, landing on the
  // exact catalog view (category, scroll position) the customer came from —
  // not a fresh "/" that forgets which subcategory they were browsing.
  // location.key === 'default' means this page was opened directly (no
  // in-app history to go back to), so fall back to a plain catalog link.
  const goToCatalog = () => {
    if (location.key !== 'default') navigate(-1)
    else navigate('/')
  }
  const { t, lang } = useLocale()
  // Push-фитинги Andes (parent_model начинается с "PF-") используют это поле
  // как размер в мм, а не как количество секций радиатора — подпись должна
  // отличаться от t.sections, которая верна для радиаторов/полотенцесушителей.
  const sectionLabel = code?.startsWith('PF-')
    ? (lang === 'uz' ? "O'lcham, mm" : 'Размер, мм')
    : t.sections

  // Category branch the user arrived from (set by the catalog grid when
  // browsing a specific sub-category, e.g. Радиаторы → Вертикальные) — used
  // to only offer heights/variants that actually belong to that branch.
  const catsParam = searchParams.get('cats')
  const catFilter = useMemo(() => {
    if (!catsParam) return null
    const ids = catsParam.split(',').map(Number).filter((n) => !Number.isNaN(n))
    return ids.length ? new Set(ids) : null
  }, [catsParam])

  const [model, setModel]               = useState<ModelDetail | null>(null)
  const [loading, setLoading]           = useState(true)
  const [notFound, setNotFound]         = useState(false)
  const [selectedColor, setSelectedColor]         = useState<string | null>(null)
  const [selectedSections, setSelectedSections]   = useState<number | null>(null)
  const [selectedHeight, setSelectedHeight]       = useState<number | null>(null)
  const [customRalMode, setCustomRalMode] = useState(false)
  const [customRalNote, setCustomRalNote] = useState('')
  const [qty, setQty]     = useState(1)
  const [added, setAdded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [activePhoto, setActivePhoto] = useState(0)
  const [relatedModels, setRelatedModels] = useState<RelatedModels>({ similar: [], complementary: [] })

  useEffect(() => {
    if (!code) return
    setLoading(true)
    setNotFound(false)
    fetchModel(code)
      .then((r) => {
        const m = r.data
        setModel(m)
        // Colour/height/section count are left unset on load — the customer
        // picks height and colour first, and only then do we resolve a
        // specific variant (avoids silently pre-selecting a combo they
        // didn't ask for, which was the source of the "confusing filters"
        // complaint).
        setSelectedColor(null)
        setSelectedHeight(null)
        setSelectedSections(null)
        setActivePhoto(0)
        const scoped = scopeVariants(m.variants, catFilter)
        const seoImage = absoluteUrl(scoped[0]?.image_url || m.variants[0]?.image_url)
        const seoDescRaw = (m.description_ru || '').replace(/\s+/g, ' ').trim()
        const seoDesc = seoDescRaw
          ? (seoDescRaw.length > 160 ? `${seoDescRaw.slice(0, 157)}...` : seoDescRaw)
          : `${m.name_ru} — купить в Ташкенте. SR Lux, официальный дистрибьютор систем отопления в Узбекистане.`
        const prices = m.variants.map((v) => v.price_uzs).filter((p) => p > 0)
        const minPrice = prices.length ? Math.min(...prices) : undefined
        const maxPrice = prices.length ? Math.max(...prices) : undefined
        const inStock = m.variants.some((v) => v.stock > 0)
        setSeo({
          title: `${m.name_ru} — SR Lux`,
          description: seoDesc,
          path: `/model/${code}`,
          image: seoImage,
          type: 'product',
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: m.name_ru,
            description: seoDesc,
            image: seoImage,
            brand: { '@type': 'Brand', name: 'SR Lux' },
            ...(minPrice != null
              ? {
                  offers: {
                    '@type': 'AggregateOffer',
                    priceCurrency: 'UZS',
                    lowPrice: minPrice,
                    highPrice: maxPrice,
                    offerCount: m.variants.length,
                    availability: inStock
                      ? 'https://schema.org/InStock'
                      : 'https://schema.org/OutOfStock',
                  },
                }
              : {}),
          },
        })
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [code, catFilter])

  useEffect(() => {
    if (!code) return
    setRelatedModels({ similar: [], complementary: [] })
    fetchRelatedModels(code)
      .then((r) => setRelatedModels(r.data))
      .catch(() => {})
  }, [code])

  if (loading) {
    return (
      <div className="min-h-screen bg-anthracite-900 flex items-center justify-center">
        <div className="text-gold animate-pulse">{t.loading}</div>
      </div>
    )
  }
  if (notFound || !model) {
    return (
      <div className="min-h-screen bg-anthracite-900 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400">{t.noProducts}</p>
        <button onClick={goToCatalog} className="text-gold hover:underline text-sm">← {t.catalog}</button>
      </div>
    )
  }

  // Variants actually relevant to the category branch the user is browsing
  // (e.g. only Вертикальные heights if that's where they came from).
  const visibleVariants = scopeVariants(model.variants, catFilter)

  // Покраска в любой цвет RAL — услуга только для вертикальных радиаторов
  // (категория "Вертикальные", id=39, и её 9 подкатегорий-профилей).
  // Горизонтальные радиаторы, полотенцесушители и прочие товары эту услугу
  // не предлагают.
  const canCustomRal = visibleVariants.some((v) => v.category_id != null && VERTICAL_RADIATOR_CATEGORY_IDS.has(v.category_id))

  // Height and colour are independent, top-level choices — neither narrows
  // the other's option list. Section count is the one dimension that
  // depends on both, so it only appears once both are settled.
  const heightsAvailable = model.height_mm_available.filter((h) =>
    visibleVariants.some((v) => v.height_mm === h),
  )
  const colorsAvailable = model.colors.filter((c) =>
    visibleVariants.some((v) => v.color === c),
  )
  // When a dimension only has one real option there's nothing to click —
  // apply it automatically instead of showing a single-button "selector".
  const effectiveHeight = selectedHeight ?? (heightsAvailable.length === 1 ? heightsAvailable[0] : null)
  const effectiveColor  = selectedColor  ?? (colorsAvailable.length === 1 ? colorsAvailable[0] : null)

  const sectionsAvailable = model.sections_available.filter((s) =>
    visibleVariants.some((v) => {
      const colorOk  = !effectiveColor  || v.color === effectiveColor
      const heightOk = !effectiveHeight || v.height_mm === effectiveHeight
      return colorOk && heightOk && v.sections === s
    }),
  )
  const effectiveSections = selectedSections ?? (sectionsAvailable.length === 1 ? sectionsAvailable[0] : null)

  // Whether height/colour are both settled enough to reveal the sections
  // step (only relevant when the model actually offers more than one value
  // for that dimension — otherwise there's nothing to wait for).
  const readyForSections =
    (heightsAvailable.length <= 1 || effectiveHeight != null) &&
    (colorsAvailable.length  <= 1 || effectiveColor  != null)

  // Every dimension the model actually offers a choice for has been
  // settled. Required so that e.g. an untouched height selector (still
  // null) doesn't get treated as "no constraint" and match every variant
  // across every height combined — that would silently show a blended
  // price/stock for the whole model instead of prompting the customer to
  // finish choosing.
  const selectionComplete =
    readyForSections && (sectionsAvailable.length <= 1 || effectiveSections != null)

  // All variants matching the current selection (connection type — top vs.
  // bottom — is deliberately not filtered on: SR Lux radiators accept
  // either, so both count toward the same offer).
  const groupCandidates = visibleVariants.filter((v) => {
    const colorOk    = !effectiveColor    || v.color    === effectiveColor
    const sectionsOk = !effectiveSections || v.sections === effectiveSections
    const heightOk   = !effectiveHeight   || v.height_mm === effectiveHeight
    return colorOk && sectionsOk && heightOk
  })
  const resolvedCandidates = selectionComplete ? groupCandidates : []

  // Pick the variant with highest stock for cart
  const selectedVariant: ModelVariant | null =
    [...resolvedCandidates].sort((a, b) => b.stock - a.stock)[0] ?? null

  // Aggregated price/stock for the selected group
  const groupTotalStock = resolvedCandidates.reduce((s, v) => s + v.stock, 0)
  const groupAvgPrice   = resolvedCandidates.length
    ? resolvedCandidates.reduce((s, v) => s + Number(v.price_uzs), 0) / resolvedCandidates.length
    : 0

  const inStock = groupTotalStock > 0

  const currentImage = effectiveColor
    ? (model.color_images[effectiveColor] ?? null)
    : (visibleVariants[0]?.image_url ?? Object.values(model.color_images)[0] ?? null)

  // Prefer the selected variant's own photo gallery (multiple angles, when
  // Dolibarr has more than one image attached); fall back to the single
  // per-colour cover image used everywhere else on the site.
  const galleryImages = selectedVariant?.images?.length ? selectedVariant.images : (currentImage ? [currentImage] : [])
  const activeIdx = Math.min(activePhoto, Math.max(galleryImages.length - 1, 0))
  const activeImage = galleryImages[activeIdx] ?? null

  const handleAdd = () => {
    // Custom-RAL requests aren't tied to a stocked variant — fall back to
    // any variant of this model purely to carry a name/sku/photo, since the
    // final colour (and price) is confirmed by a manager afterward.
    const baseVariant = customRalMode
      ? (selectedVariant ?? model.variants[0] ?? null)
      : selectedVariant
    if (!baseVariant) return
    const productForCart: Product = {
      id:             baseVariant.id,
      sku:            baseVariant.sku,
      slug:           baseVariant.slug,
      name_ru:        baseVariant.name_ru,
      name_uz:        baseVariant.name_uz,
      description_ru: model.description_ru,
      description_uz: model.description_uz,
      price_uzs:      Number(baseVariant.price_uzs),
      stock:          baseVariant.stock,
      weight:         null,
      image_url:      baseVariant.image_url ?? currentImage,
      category:       null,
      variants:       [],
    }
    onAddToCart(
      productForCart,
      null,
      qty,
      customRalMode
        ? (lang === 'uz' ? 'RAL rang so\'rovi' : 'Запрос цвета RAL') + (customRalNote.trim() ? `: ${customRalNote.trim()}` : '')
        : undefined,
    )
    setAdded(true)
    setCustomRalMode(false)
    setCustomRalNote('')
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div className="min-h-screen bg-anthracite-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <button
          onClick={goToCatalog}
          className="inline-flex items-center gap-2 text-gray-400 hover:text-gold text-sm mb-8 transition-colors"
        >
          <ArrowLeft size={16} />
          {t.catalog}
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Image */}
          <div>
            <div className="bg-anthracite-800 rounded-2xl overflow-hidden border border-gold-700/15 aspect-square flex items-center justify-center">
              {activeImage && !imgError ? (
                <SmartImage
                  src={activeImage}
                  alt={model.name_ru}
                  className="w-full h-full object-contain"
                  onLoadError={() => setImgError(true)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 text-gray-600">
                  <ImageOff size={64} />
                  <p className="text-sm text-gray-500">{t.noImage}</p>
                </div>
              )}
            </div>

            {/* Thumbnail strip — only shown when the product has more than one photo */}
            {galleryImages.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                {galleryImages.map((url, i) => (
                  <button
                    key={url + i}
                    onClick={() => { setActivePhoto(i); setImgError(false) }}
                    className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                      i === activeIdx ? 'border-gold' : 'border-gold-700/15 hover:border-gold/50'
                    }`}
                  >
                    <SmartImage src={url} alt={`${model.name_ru} ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col gap-5">
            {model.category_name && (
              <p className="text-xs text-gold uppercase tracking-wider font-semibold">
                {lang === 'uz' ? (model.category_name_uz || model.category_name) : model.category_name}
              </p>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              {lang === 'uz' ? (model.name_uz || model.name_ru) : model.name_ru}
            </h1>

            {/* Height selector */}
            {heightsAvailable.length > 1 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">{t.height}</p>
                <div className="flex flex-wrap gap-2">
                  {heightsAvailable.map((h) => (
                    <button
                      key={h}
                      onClick={() => {
                        setSelectedHeight(h)
                        setSelectedSections(null)
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                        effectiveHeight === h
                          ? 'border-gold bg-gold/10 text-gold'
                          : 'border-gray-700 text-gray-400 hover:border-gold/50'
                      }`}
                    >
                      {h} мм
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Color selector */}
            {colorsAvailable.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">{t.color}</p>
                <div className="flex flex-wrap gap-2">
                  {colorsAvailable.map((c) => {
                    const d = COLOR_DISPLAY[c] || { label_ru: c, label_uz: c, hex: '#888' }
                    return (
                      <button
                        key={c}
                        onClick={() => {
                          setSelectedColor(c)
                          setSelectedSections(null)
                          setCustomRalMode(false)
                          setImgError(false)
                          setActivePhoto(0)
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                          effectiveColor === c
                            ? 'border-gold bg-gold/10 text-gold'
                            : 'border-gray-700 text-gray-400 hover:border-gold/50'
                        }`}
                      >
                        <span
                          className="w-4 h-4 rounded-full shrink-0"
                          style={{
                            backgroundColor: d.hex,
                            border: d.border ? '1px solid #666' : '1px solid #222',
                          }}
                        />
                        {colorLabel(d, lang)}
                      </button>
                    )
                  })}
                  {canCustomRal && (
                    <button
                      onClick={() => setCustomRalMode(true)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        customRalMode
                          ? 'border-gold bg-gold/10 text-gold'
                          : 'border-gray-700 text-gray-400 hover:border-gold/50'
                      }`}
                    >
                      <Palette size={14} className="shrink-0" />
                      {lang === 'uz' ? 'Boshqa RAL rangi' : 'Другой цвет RAL'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Custom RAL request — made-to-order colour, price confirmed by
                a manager afterward rather than computed automatically */}
            {customRalMode && (
              <div className="bg-anthracite-800 rounded-xl p-4 border border-gold/30 space-y-3">
                <p className="text-sm text-gray-300">
                  {lang === 'uz'
                    ? "RAL palitrasidan 200+ rangning istalganiga bo'yash mumkin. Bajarilish muddatini menejerimiz aniqlaydi — u siz bilan rang kodini aniqlash uchun bog'lanadi."
                    : 'Покраска в любой из 200+ цветов палитры RAL. Срок исполнения уточнит менеджер — он свяжется с вами для уточнения кода цвета.'}
                </p>
                <textarea
                  value={customRalNote}
                  onChange={(e) => setCustomRalNote(e.target.value)}
                  placeholder={lang === 'uz' ? "RAL kodi yoki rang tavsifi (ixtiyoriy)" : 'Код RAL или описание цвета (необязательно)'}
                  rows={2}
                  className="w-full bg-anthracite-700 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gold/50 resize-none"
                />
              </div>
            )}

            {/* Sections selector — appears only once height and colour (when
                the model actually offers a choice for either) are settled */}
            {readyForSections && sectionsAvailable.length > 1 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">{sectionLabel}</p>
                <div className="flex flex-wrap gap-2">
                  {sectionsAvailable.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSelectedSections(s)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                        effectiveSections === s
                          ? 'border-gold bg-gold/10 text-gold'
                          : 'border-gray-700 text-gray-400 hover:border-gold/50'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Price + stock */}
            {customRalMode ? (
              <div className="bg-anthracite-800 rounded-xl p-4 border border-gold-700/15">
                <p className="text-xs text-gray-500 mb-1">{t.price}</p>
                <p className="text-lg font-bold text-gold">
                  {lang === 'uz' ? 'Narxi aniqlanadi' : 'Цена уточняется'}
                </p>
              </div>
            ) : resolvedCandidates.length > 0 ? (
              <div className="bg-anthracite-800 rounded-xl p-4 border border-gold-700/15">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{t.price}</p>
                    <p className="text-3xl font-extrabold bg-gold-gradient bg-clip-text text-transparent">
                      {fmt(groupAvgPrice)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{t.sum}</p>
                  </div>
                  <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                    inStock ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${inStock ? 'bg-green-400' : 'bg-red-400'}`} />
                    {inStock ? t.inStock : t.outOfStock}
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-anthracite-800 rounded-xl p-4 border border-gold-700/15 text-gray-500 text-sm">
                {heightsAvailable.length > 1 && effectiveHeight == null
                  ? (lang === 'uz' ? "Avval balandlikni tanlang" : 'Сначала выберите высоту')
                  : colorsAvailable.length > 1 && effectiveColor == null
                  ? (lang === 'uz' ? 'Rangni tanlang' : 'Выберите цвет')
                  : sectionsAvailable.length > 1 && effectiveSections == null
                  ? (lang === 'uz' ? `${sectionLabel}ni tanlang` : `Выберите: ${sectionLabel.toLowerCase()}`)
                  : (lang === 'uz' ? 'Bunday birikma mavjud emas' : 'Такой комбинации нет в наличии')}
              </div>
            )}

            {/* Qty + Add to cart */}
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  className="px-3 py-2 text-gray-400 hover:text-white hover:bg-anthracite-700 transition-colors"
                >
                  −
                </button>
                <span className="px-4 py-2 text-white font-medium min-w-[3rem] text-center border-x border-gray-700">
                  {qty}
                </span>
                <button
                  onClick={() => setQty(qty + 1)}
                  className="px-3 py-2 text-gray-400 hover:text-white hover:bg-anthracite-700 transition-colors"
                >
                  +
                </button>
              </div>
              <button
                onClick={handleAdd}
                disabled={customRalMode ? model.variants.length === 0 : (!inStock || !selectedVariant)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                  (customRalMode ? model.variants.length > 0 : (inStock && selectedVariant))
                    ? added
                      ? 'bg-green-600 text-white'
                      : 'bg-gold hover:bg-gold-600 text-anthracite-900 shadow-gold hover:shadow-gold-lg'
                    : 'bg-anthracite-700 text-gray-600 cursor-not-allowed'
                }`}
              >
                <ShoppingCart size={16} />
                {added ? `✓ ${t.addToCart}` : t.addToCart}
              </button>
            </div>

            {/* Characteristics — specs of the currently selected variant, not the whole model.
                Only rendered when at least one field actually has data (e.g. the
                Electric Radiator line has no height/sections/columns/weight recorded). */}
            {selectedVariant && (
              selectedVariant.height_mm || selectedVariant.sections ||
              selectedVariant.columns_count || selectedVariant.weight != null ||
              selectedVariant.power_w_dt50 != null || selectedVariant.power_w_electric != null
            ) && (
              <div className="bg-anthracite-800 rounded-xl p-4 border border-gold-700/10">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{t.characteristics}</p>
                <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
                  {selectedVariant.power_w_dt50 != null && (
                    <>
                      <dt className="text-gray-500">
                        {lang === 'uz' ? "Quvvat (ΔT=50°C)" : 'Мощность (ΔT=50°C)'}
                      </dt>
                      <dd className="text-gray-300">{selectedVariant.power_w_dt50} Вт</dd>
                    </>
                  )}
                  {selectedVariant.power_w_dt64_5 != null && (
                    <>
                      <dt className="text-gray-500">
                        {lang === 'uz' ? "Quvvat (ΔT=64.5°C, hisob)" : 'Мощность (ΔT=64.5°C, расчёт)'}
                      </dt>
                      <dd className="text-gray-300">{selectedVariant.power_w_dt64_5} Вт</dd>
                    </>
                  )}
                  {selectedVariant.power_w_fcu45 != null && (
                    <>
                      <dt className="text-gray-500">
                        {lang === 'uz' ? "Isitish quvvati (suv 45°C)" : 'Тепловая мощность нагрева (вода 45°C)'}
                      </dt>
                      <dd className="text-gray-300">{selectedVariant.power_w_fcu45} Вт</dd>
                    </>
                  )}
                  {selectedVariant.power_w_fcu60 != null && (
                    <>
                      <dt className="text-gray-500">
                        {lang === 'uz' ? "Isitish quvvati (suv 60°C)" : 'Тепловая мощность нагрева (вода 60°C)'}
                      </dt>
                      <dd className="text-gray-300">{selectedVariant.power_w_fcu60} Вт</dd>
                    </>
                  )}
                  {selectedVariant.power_w_electric != null && (
                    <>
                      <dt className="text-gray-500">
                        {lang === 'uz' ? "Quvvat" : 'Потребляемая мощность'}
                      </dt>
                      <dd className="text-gray-300">{selectedVariant.power_w_electric} Вт</dd>
                    </>
                  )}
                  {selectedVariant.height_mm && (
                    <>
                      <dt className="text-gray-500">{t.height}</dt>
                      <dd className="text-gray-300">{selectedVariant.height_mm} мм</dd>
                    </>
                  )}
                  {/* JDC22 — панельные радиаторы; у них нет "секций" в
                      привычном смысле (это только для трубчатых/секционных
                      линеек), а есть фиксированный тип панели EN 442 (11/22/33
                      и т.д.). Вся линейка JDC22 — тип 22, это не выбираемый
                      параметр варианта, а константа модели. */}
                  {code === 'JDC22' && (
                    <>
                      <dt className="text-gray-500">{t.panelType}</dt>
                      <dd className="text-gray-300">22</dd>
                    </>
                  )}
                  {selectedVariant.sections && (
                    <>
                      <dt className="text-gray-500">{sectionLabel}</dt>
                      <dd className="text-gray-300">{selectedVariant.sections}</dd>
                    </>
                  )}
                  {selectedVariant.columns_count && (
                    <>
                      <dt className="text-gray-500">{t.columns}</dt>
                      <dd className="text-gray-300">{selectedVariant.columns_count}</dd>
                    </>
                  )}
                  {selectedVariant.weight != null && (
                    <>
                      <dt className="text-gray-500">{t.weight}</dt>
                      <dd className="text-gray-300">{selectedVariant.weight} кг</dd>
                    </>
                  )}
                </dl>
              </div>
            )}

            {/* Description — this variant's own description; falls back to the
                model's generic description only if this exact variant has none.
                In UZ mode, prefer the uz text but fall back to ru if untranslated. */}
            {(() => {
              const descRu = selectedVariant?.description_ru || model.description_ru || ''
              const descUz = selectedVariant?.description_uz || model.description_uz || ''
              const activeDesc = lang === 'uz' ? (descUz || descRu) : descRu
              if (!activeDesc) return null
              return (
                <div className="bg-anthracite-800 rounded-xl p-4 border border-gold-700/10">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{t.description}</p>
                  <div
                    className="text-gray-300 text-sm leading-relaxed whitespace-pre-line [&_strong]:text-gray-200 [&_br]:block"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(activeDesc) }}
                  />
                </div>
              )
            })()}
          </div>
        </div>

        {/* Похожие товары — other models sharing a parent category with this
            one (e.g. other radiator lines at the same orientation). */}
        {relatedModels.similar.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-bold text-white mb-4">
              {lang === 'uz' ? "O'xshash mahsulotlar" : 'Похожие товары'}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
              {relatedModels.similar.map((m) => (
                <ModelCardComponent key={m.code} model={m} />
              ))}
            </div>
          </div>
        )}

        {/* С этим покупают — curated complementary categories (valves/
            thermostats for radiators, thermostats for fan coils, etc.),
            not derived from order history — too little purchase data yet
            to compute genuine co-purchase stats. */}
        {relatedModels.complementary.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-bold text-white mb-4">
              {lang === 'uz' ? 'Bu bilan sotib olishadi' : 'С этим покупают'}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
              {relatedModels.complementary.map((m) => (
                <ModelCardComponent key={m.code} model={m} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
