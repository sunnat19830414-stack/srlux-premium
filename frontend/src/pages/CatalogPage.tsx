import {
  Flame, Thermometer, Wrench, Wind, Droplets,
  Zap, Settings, Package, Layers, ChevronRight,
} from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import type { Category, Product, Variant } from '../api/client'
import { fetchCategories, fetchProducts } from '../api/client'
import ProductCard from '../components/ProductCard'
import { useLocale } from '../contexts/LocaleContext'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Flame, Thermometer, Wrench, Wind, Droplets,
  Zap, Settings, Package, Layers,
}

function CategoryIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Ic = ICON_MAP[name] || Package
  return <Ic size={size} />
}

interface CartItem extends Product {
  variant: Variant | null
  cartQty: number
}

interface Props {
  onCartChange: (items: CartItem[]) => void
  cartItems: CartItem[]
}

const LIMIT = 20

export default function CatalogPage({ onCartChange, cartItems }: Props) {
  const { lang, t } = useLocale()
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [selectedCat, setSelectedCat] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    fetchCategories().then((r) => setCategories(r.data))
  }, [])

  const loadProducts = useCallback(
    async (p: number, catId: number | null, replace: boolean) => {
      p === 1 ? setLoading(true) : setLoadingMore(true)
      try {
        const res = await fetchProducts({ page: p, limit: LIMIT, category_id: catId ?? undefined })
        const data = res.data
        setTotal(data.total)
        setProducts((prev) => (replace ? data.products : [...prev, ...data.products]))
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [],
  )

  useEffect(() => {
    setPage(1)
    loadProducts(1, selectedCat, true)
  }, [selectedCat, loadProducts])

  const handleLoadMore = () => {
    const next = page + 1
    setPage(next)
    loadProducts(next, selectedCat, false)
  }

  const addToCart = (product: Product, variant: Variant | null, qty: number) => {
    const existing = cartItems.findIndex(
      (i) => i.id === product.id && (i.variant?.id ?? 'base') === (variant?.id ?? 'base'),
    )
    if (existing >= 0) {
      const updated = cartItems.map((item, idx) =>
        idx === existing ? { ...item, cartQty: item.cartQty + qty } : item,
      )
      onCartChange(updated)
    } else {
      onCartChange([...cartItems, { ...product, variant, cartQty: qty }])
    }
  }

  const hasMore = products.length < total

  return (
    <div className="min-h-screen bg-anthracite-900">
      {/* Hero */}
      <section className="relative bg-dark-gradient border-b border-gold-700/20 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-gold rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-gold-600 rounded-full blur-2xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-4 leading-tight">
            {t.heroTitle}
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-8">
            {t.heroSubtitle}
          </p>
          <a
            href="#catalog"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gold hover:bg-gold-600 text-anthracite-900 font-bold text-sm transition-all shadow-gold hover:shadow-gold-lg"
          >
            {t.heroCta}
            <ChevronRight size={16} />
          </a>
        </div>
      </section>

      {/* Catalog */}
      <section id="catalog" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="hidden lg:block w-56 shrink-0">
            <div className="sticky top-24 bg-anthracite-800 rounded-xl border border-gold-700/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-gold-700/10">
                <p className="text-xs font-semibold text-gold uppercase tracking-wider">
                  {t.allCategories}
                </p>
              </div>
              <ul>
                <li>
                  <button
                    onClick={() => setSelectedCat(null)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                      selectedCat === null
                        ? 'text-gold bg-gold/5 border-r-2 border-gold'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Package size={15} />
                    {t.allCategories}
                  </button>
                </li>
                {categories.map((cat) => (
                  <li key={cat.id}>
                    <button
                      onClick={() => setSelectedCat(cat.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                        selectedCat === cat.id
                          ? 'text-gold bg-gold/5 border-r-2 border-gold'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <CategoryIcon name={cat.icon} size={15} />
                      {lang === 'uz' ? cat.name_uz : cat.name_ru}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Products grid */}
          <div className="flex-1 min-w-0">
            {/* Mobile category pills */}
            {categories.length > 0 && (
              <div className="lg:hidden flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide">
                <button
                  onClick={() => setSelectedCat(null)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selectedCat === null
                      ? 'bg-gold text-anthracite-900 border-gold'
                      : 'border-gray-700 text-gray-400'
                  }`}
                >
                  <Package size={12} />
                  {t.allCategories}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCat(cat.id)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      selectedCat === cat.id
                        ? 'bg-gold text-anthracite-900 border-gold'
                        : 'border-gray-700 text-gray-400'
                    }`}
                  >
                    <CategoryIcon name={cat.icon} size={12} />
                    {lang === 'uz' ? cat.name_uz : cat.name_ru}
                  </button>
                ))}
              </div>
            )}

            {/* Count */}
            {!loading && (
              <p className="text-xs text-gray-500 mb-4">
                {total > 0 ? `Показано ${products.length} из ${total}` : ''}
              </p>
            )}

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-anthracite-800 rounded-xl h-80 animate-pulse border border-gold-700/10" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-gray-500">
                <Package size={48} className="mb-4 opacity-30" />
                <p>{t.noProducts}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {products.map((p) => (
                    <ProductCard key={`${p.id}-${p.slug}`} product={p} onAddToCart={addToCart} />
                  ))}
                </div>

                {hasMore && (
                  <div className="flex justify-center mt-10">
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="px-8 py-3 rounded-xl border border-gold/50 text-gold hover:bg-gold/10 font-semibold text-sm transition-all disabled:opacity-50"
                    >
                      {loadingMore ? t.loading : t.loadMore}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
