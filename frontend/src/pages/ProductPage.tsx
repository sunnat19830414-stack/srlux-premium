import { ArrowLeft, ImageOff, Package, ShoppingCart } from 'lucide-react'
import SmartImage from '../components/SmartImage'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Product, Variant } from '../api/client'
import { fetchProduct } from '../api/client'
import { useLocale } from '../contexts/LocaleContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { absoluteUrl, setSeo } from '../lib/seo'
import { CONVECTOR_FAN_OPTIONS } from '../lib/convectorFans'

interface Props {
  onAddToCart: (product: Product, variant: Variant | null, qty: number) => void
}

export default function ProductPage({ onAddToCart }: Props) {
  const { slug } = useParams<{ slug: string }>()
  const { currency, formatPrice: fmt } = useCurrency()
  const { lang, t } = useLocale()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [withFan, setWithFan] = useState(false)
  const [fanProduct, setFanProduct] = useState<Product | null>(null)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    setNotFound(false)
    fetchProduct(slug)
      .then((r) => {
        setProduct(r.data)
        setSelectedImage(r.data.image_url)
        setImgError(false)
        setWithFan(false)
        const fanOption = CONVECTOR_FAN_OPTIONS[r.data.sku]
        setFanProduct(null)
        if (fanOption) {
          fetchProduct(fanOption.fanSlug).then((fr) => setFanProduct(fr.data)).catch(() => setFanProduct(null))
        }
        const name = lang === 'uz' ? (r.data.name_uz || r.data.name_ru) : r.data.name_ru
        const descRaw = (lang === 'uz' ? (r.data.description_uz || r.data.description_ru) : r.data.description_ru) || ''
        const descClean = descRaw.replace(/\s+/g, ' ').trim()
        const desc = descClean
          ? (descClean.length > 160 ? `${descClean.slice(0, 157)}...` : descClean)
          : `${name} — купить в Ташкенте. SR Lux, официальный дистрибьютор систем отопления в Узбекистане.`
        setSeo({
          title: `${name} — SR Lux`,
          description: desc,
          path: `/product/${slug}`,
          image: absoluteUrl(r.data.image_url),
          type: 'product',
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name,
            description: desc,
            image: absoluteUrl(r.data.image_url),
            brand: { '@type': 'Brand', name: 'SR Lux' },
            offers: {
              '@type': 'Offer',
              priceCurrency: 'UZS',
              price: r.data.price_uzs,
              availability: r.data.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            },
          },
        })
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug, lang])

  if (loading) {
    return (
      <div className="min-h-screen bg-anthracite-900 flex items-center justify-center">
        <div className="text-gold animate-pulse text-lg">{t.loading}</div>
      </div>
    )
  }

  if (notFound || !product) {
    return (
      <div className="min-h-screen bg-anthracite-900 flex flex-col items-center justify-center gap-4">
        <Package size={56} className="text-gray-600" />
        <p className="text-gray-400">{t.noProducts}</p>
        <Link to="/" className="text-gold hover:underline text-sm">← {t.catalog}</Link>
      </div>
    )
  }

  const name = lang === 'uz' ? (product.name_uz || product.name_ru) : product.name_ru
  const description = lang === 'uz'
    ? (product.description_uz || product.description_ru)
    : product.description_ru
  const inStock = product.stock > 0

  const fanOption = CONVECTOR_FAN_OPTIONS[product.sku]
  const fanTotalPrice = fanOption && fanProduct ? Number(fanProduct.price_uzs) * fanOption.fanQty : 0

  const effectivePrice = selectedVariant
    ? product.price_uzs + Number(selectedVariant.price_modifier)
    : product.price_uzs

  const totalPrice = effectivePrice + (withFan ? fanTotalPrice : 0)

  const handleAdd = () => {
    onAddToCart(product, selectedVariant, qty)
    if (withFan && fanOption && fanProduct) {
      onAddToCart(fanProduct, null, qty * fanOption.fanQty)
    }
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div className="min-h-screen bg-anthracite-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-gold text-sm mb-8 transition-colors"
        >
          <ArrowLeft size={16} />
          {t.catalog}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Image */}
          <div>
            <div className="bg-anthracite-800 rounded-2xl overflow-hidden border border-gold-700/15 aspect-square flex items-center justify-center">
              {selectedImage && !imgError ? (
                <SmartImage
                  src={selectedImage}
                  alt={name}
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

            {product.images.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto">
                {product.images.map((url) => (
                  <button
                    key={url}
                    onClick={() => { setSelectedImage(url); setImgError(false) }}
                    className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 flex items-center justify-center bg-anthracite-800 transition-colors ${
                      selectedImage === url ? 'border-gold' : 'border-gold-700/15 hover:border-gold-700/40'
                    }`}
                  >
                    <img src={url} alt="" className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col gap-5">
            {/* Category */}
            {product.category && (
              <p className="text-xs text-gold uppercase tracking-wider font-semibold">
                {lang === 'uz' ? product.category.name_uz : product.category.name_ru}
              </p>
            )}

            {/* Name */}
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">{name}</h1>

            {/* SKU */}
            <p className="text-xs text-gray-500 font-mono">
              {t.sku} <span className="text-gray-400">{product.sku}</span>
            </p>

            {/* Stock */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full w-fit text-sm font-medium ${
              inStock ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${inStock ? 'bg-green-400' : 'bg-red-400'}`} />
              {inStock ? t.inStock : t.outOfStock}
            </div>

            {/* Price */}
            <div className="bg-anthracite-800 rounded-xl p-4 border border-gold-700/15">
              <p className="text-xs text-gray-500 mb-1">Цена</p>
              <p className="text-3xl font-extrabold bg-gold-gradient bg-clip-text text-transparent">
                {fmt(totalPrice)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {currency === 'USD' ? '$' : t.sum}
                {withFan && fanOption && (
                  <span className="ml-1.5 text-gray-600">
                    {lang === 'uz'
                      ? `(konvektor ${fmt(effectivePrice)} + ${fanOption.fanQty}× ventilyator ${fmt(fanTotalPrice)})`
                      : `(конвектор ${fmt(effectivePrice)} + ${fanOption.fanQty}× вентилятор ${fmt(fanTotalPrice)})`}
                  </span>
                )}
              </p>
            </div>

            {/* Естественная / принудительная конвекция — только у моделей,
                для которых заведён вентиляторный комплект (см. convectorFans.ts) */}
            {fanOption && (
              <div className="bg-anthracite-800 rounded-xl p-4 border border-gold-700/15">
                <div className="flex items-center justify-between mb-3 gap-3">
                  <p className="text-sm font-medium text-white">
                    {lang === 'uz' ? 'Konfiguratsiya' : 'Комплектация'}
                  </p>
                  <div className="flex rounded-lg border border-gray-700 overflow-hidden text-xs font-semibold shrink-0">
                    <button
                      onClick={() => setWithFan(false)}
                      className={`px-3 py-1.5 transition-colors ${!withFan ? 'bg-gold text-anthracite-900' : 'bg-anthracite-700 text-gray-400 hover:text-white'}`}
                    >
                      {lang === 'uz' ? 'Ventilyatorsiz' : 'Без вентилятора'}
                    </button>
                    <button
                      onClick={() => setWithFan(true)}
                      className={`px-3 py-1.5 transition-colors ${withFan ? 'bg-gold text-anthracite-900' : 'bg-anthracite-700 text-gray-400 hover:text-white'}`}
                    >
                      {lang === 'uz' ? 'Ventilyator bilan' : 'С вентилятором'}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">
                    {lang === 'uz' ? "Issiqlik quvvati" : 'Тепловая мощность'}
                  </span>
                  <span className="text-white font-medium">
                    {withFan ? fanOption.powerForcedW : fanOption.powerNaturalW} Вт
                  </span>
                </div>
                {withFan && (
                  <p className="text-xs text-gray-500 mt-2">
                    {lang === 'uz'
                      ? `Savatga konvektor bilan birga ${fanOption.fanQty} dona ventilyator qo'shiladi.`
                      : `В корзину добавится ${fanOption.fanQty} шт. вентилятора вместе с конвектором.`}
                  </p>
                )}
              </div>
            )}

            {/* Variants */}
            {product.variants.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{t.variant}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedVariant(null)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      !selectedVariant ? 'border-gold bg-gold/10 text-gold' : 'border-gray-700 text-gray-400 hover:border-gold/50'
                    }`}
                  >
                    Base
                  </button>
                  {product.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVariant(v)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        selectedVariant?.id === v.id ? 'border-gold bg-gold/10 text-gold' : 'border-gray-700 text-gray-400 hover:border-gold/50'
                      }`}
                    >
                      {lang === 'uz' ? (v.name_uz || v.name_ru) : v.name_ru}
                      {Number(v.price_modifier) > 0 && (
                        <span className="ml-1 text-xs text-gray-500">+{fmt(Number(v.price_modifier))}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Qty + Add */}
            <div className="flex items-center gap-3 mt-2">
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
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                  added
                    ? 'bg-green-600 text-white'
                    : 'bg-gold hover:bg-gold-600 text-anthracite-900 shadow-gold hover:shadow-gold-lg'
                }`}
              >
                <ShoppingCart size={16} />
                {added ? `✓ ${t.addToCart}` : t.addToCart}
              </button>
            </div>

            {/* Specs */}
            <div className="border-t border-gold-700/10 pt-4 space-y-2">
              {product.weight && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t.weight}</span>
                  <span className="text-white">{product.weight} {t.kg}</span>
                </div>
              )}
              {product.category && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Категория</span>
                  <span className="text-white">
                    {lang === 'uz' ? product.category.name_uz : product.category.name_ru}
                  </span>
                </div>
              )}
            </div>

            {/* Description */}
            {description && (
              <div className="bg-anthracite-800 rounded-xl p-4 border border-gold-700/10">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Описание</p>
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{description}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
