import { ChevronRight, Package } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ModelCard } from '../api/client'
import { fetchModels } from '../api/client'
import ModelCardComponent from '../components/ModelCard'
import { useLocale } from '../contexts/LocaleContext'

export default function CatalogPage() {
  const { t } = useLocale()
  const [allModels, setAllModels] = useState<ModelCard[]>([])
  const [loading, setLoading]     = useState(true)
  const [selectedCat, setSelectedCat] = useState<string | null>(null)

  useEffect(() => {
    fetchModels()
      .then((r) => setAllModels(r.data.models))
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(() => {
    const seen = new Set<string>()
    const cats: string[] = []
    allModels.forEach((m) => {
      if (m.category_name && !seen.has(m.category_name)) {
        seen.add(m.category_name)
        cats.push(m.category_name)
      }
    })
    return cats.sort()
  }, [allModels])

  const models = selectedCat
    ? allModels.filter((m) => m.category_name === selectedCat)
    : allModels

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
                  <li key={cat}>
                    <button
                      onClick={() => setSelectedCat(cat)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                        selectedCat === cat
                          ? 'text-gold bg-gold/5 border-r-2 border-gold'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Package size={15} />
                      {cat}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Grid */}
          <div className="flex-1 min-w-0">
            {/* Mobile pills */}
            {categories.length > 0 && (
              <div className="lg:hidden flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide">
                <button
                  onClick={() => setSelectedCat(null)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selectedCat === null
                      ? 'bg-gold text-anthracite-900 border-gold'
                      : 'border-gray-700 text-gray-400'
                  }`}
                >
                  {t.allCategories}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCat(cat)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      selectedCat === cat
                        ? 'bg-gold text-anthracite-900 border-gold'
                        : 'border-gray-700 text-gray-400'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {!loading && (
              <p className="text-xs text-gray-500 mb-4">
                {models.length > 0 ? `Моделей: ${models.length}` : ''}
              </p>
            )}

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-anthracite-800 rounded-xl h-80 animate-pulse border border-gold-700/10"
                  />
                ))}
              </div>
            ) : models.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-gray-500">
                <Package size={48} className="mb-4 opacity-30" />
                <p>{t.noProducts}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {models.map((m) => (
                  <ModelCardComponent key={m.code} model={m} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
