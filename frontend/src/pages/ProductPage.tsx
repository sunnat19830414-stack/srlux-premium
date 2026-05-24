import { ArrowLeft, ImageOff, Package, ShoppingCart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Product, Variant } from '../api/client'
import { fetchProduct } from '../api/client'
import { useLocale } from '../contexts/LocaleContext'

function fmt(n: number) {
  return n.toLocaleString('ru-RU')
}

interface Props {
  onAddToCart: (product: Product, variant: Variant | null, qty: number) => void
}

export default function ProductPage({ onAddToCart }: Props) {
  const { slug } = useParams<{ slug: string }>()
  const { lang, t } = useLocale()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    setNotFound(false)
    fetchProduct(slug)
      .then((r) => {
        setProduct(r.data)
        // Update meta tags for SEO
        const name = lang === 'uz' ? (r.data.name_uz || r.data.name_ru) : r.data.name_ru
        document.title = `${name} — SR Lux`
        const metaDesc = document.querySelector('meta[name="description"]')
        if (metaDesc) {
          const desc = lang === 'uz' ? (r.data.description_uz || r.data.description_ru) : r.data.description_ru
          metaDesc.setAttribute('content', desc || name)
        }
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

  const effectivePrice = selectedVariant
    ? product.price_uzs + Number(selectedVariant.price_modifier)
    : product.price_uzs

  const handleAdd = () => {
    onAddToCart(product, selectedVariant, qty)
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
          <div className="bg-anthracite-800 rounded-2xl overflow-hidden border border-gold-700/15 aspect-square flex items-center justify-center">
            {product.image_url && !imgError ? (
              <img
                src={product.image_url}
                alt={name}
                className="w-full h-full object-contain"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 text-gray-600">
                <ImageOff size={64} />
                <p className="text-sm text-gray-500">{t.noImage}</p>
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
              {inStock ? `${t.inStock} (${product.stock} ${t.qty})` : t.outOfStock}
            </div>

            {/* Price */}
            <div className="bg-anthracite-800 rounded-xl p-4 border border-gold-700/15">
              <p className="text-xs text-gray-500 mb-1">Цена</p>
              <p className="text-3xl font-extrabold bg-gold-gradient bg-clip-text text-transparent">
                {fmt(effectivePrice)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{t.sum}</p>
            </div>

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
                disabled={!inStock}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                  inStock
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
