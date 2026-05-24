import { ImageOff, ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Product, Variant } from '../api/client'
import { useLocale } from '../contexts/LocaleContext'

interface Props {
  product: Product
  onAddToCart: (product: Product, variant: Variant | null, qty: number) => void
}

function fmt(n: number) {
  return n.toLocaleString('ru-RU')
}

export default function ProductCard({ product, onAddToCart }: Props) {
  const { lang, t } = useLocale()
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null)
  const [added, setAdded] = useState(false)

  const name = lang === 'uz' ? (product.name_uz || product.name_ru) : product.name_ru
  const inStock = product.stock > 0

  const effectivePrice = selectedVariant
    ? product.price_uzs + Number(selectedVariant.price_modifier)
    : product.price_uzs

  const handleAdd = () => {
    onAddToCart(product, selectedVariant, 1)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <div className="group flex flex-col bg-anthracite-800 rounded-xl border border-gold-700/10 hover:border-gold/40 shadow-card hover:shadow-gold transition-all duration-300 overflow-hidden animate-slide-up">
      {/* Image */}
      <Link to={`/product/${product.slug}`} className="block relative overflow-hidden bg-anthracite-700 aspect-[4/3]">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              const placeholder = e.currentTarget.nextElementSibling as HTMLElement
              if (placeholder) placeholder.style.display = 'flex'
            }}
          />
        ) : null}
        {/* ImageOff placeholder */}
        <div
          className={`${product.image_url ? 'hidden' : 'flex'} absolute inset-0 items-center justify-center flex-col gap-2 text-gray-600`}
        >
          <ImageOff size={36} />
          <span className="text-xs text-gray-500">{t.noImage}</span>
        </div>

        {/* Stock badge */}
        <div className="absolute top-2 right-2">
          <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold backdrop-blur-sm ${
            inStock
              ? 'bg-green-900/80 text-green-400'
              : 'bg-red-900/80 text-red-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${inStock ? 'bg-green-400' : 'bg-red-400'}`} />
            {inStock ? t.inStock : t.outOfStock}
          </span>
        </div>
      </Link>

      {/* Info */}
      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* SKU */}
        <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">
          {t.sku} {product.sku}
        </p>

        {/* Name */}
        <Link to={`/product/${product.slug}`}>
          <h3 className="text-white font-semibold text-sm leading-snug line-clamp-2 hover:text-gold transition-colors">
            {name}
          </h3>
        </Link>

        {/* Variants */}
        {product.variants.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{t.variant}</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedVariant(null)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                  !selectedVariant
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-gray-700 text-gray-400 hover:border-gold/50'
                }`}
              >
                Base
              </button>
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariant(v)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                    selectedVariant?.id === v.id
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-gray-700 text-gray-400 hover:border-gold/50'
                  }`}
                >
                  {lang === 'uz' ? (v.name_uz || v.name_ru) : v.name_ru}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Weight */}
        {product.weight && (
          <p className="text-[11px] text-gray-500">
            {t.weight}: <span className="text-gray-400">{product.weight} {t.kg}</span>
          </p>
        )}

        {/* Price + button */}
        <div className="mt-auto pt-3 border-t border-gold-700/10 flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] text-gray-500 mb-0.5">от</p>
            <p className="text-xl font-bold bg-gold-gradient bg-clip-text text-transparent">
              {fmt(effectivePrice)}
            </p>
            <p className="text-[10px] text-gray-500">{t.sum}</p>
          </div>

          <button
            onClick={handleAdd}
            disabled={!inStock}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              inStock
                ? added
                  ? 'bg-green-600 text-white scale-95'
                  : 'bg-gold hover:bg-gold-600 text-anthracite-900 hover:shadow-gold'
                : 'bg-anthracite-700 text-gray-600 cursor-not-allowed'
            }`}
          >
            <ShoppingCart size={14} />
            {added ? '✓' : t.addToCart}
          </button>
        </div>
      </div>
    </div>
  )
}
