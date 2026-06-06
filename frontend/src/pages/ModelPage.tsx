import { ArrowLeft, ImageOff, ShoppingCart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ModelDetail, ModelVariant, Product, Variant } from '../api/client'
import { fetchModel } from '../api/client'
import { useLocale } from '../contexts/LocaleContext'

const COLOR_DISPLAY: Record<string, { label: string; hex: string; border?: boolean }> = {
  white:      { label: 'Белый',    hex: '#FFFFFF', border: true },
  anthracite: { label: 'Антрацит', hex: '#484A4E' },
  black:      { label: 'Чёрный',   hex: '#1C1C1E' },
  gold:       { label: 'Золото',   hex: '#C9A227' },
  chrome:     { label: 'Хром',     hex: '#C0C0C0', border: true },
}

function fmt(n: number) {
  return Math.round(Number(n)).toLocaleString('ru-RU')
}

interface GroupRow {
  key: string
  color: string | null
  sections: number | null
  totalStock: number
  avgPrice: number
}

function buildGroupedRows(variants: ModelVariant[]): GroupRow[] {
  const map = new Map<string, ModelVariant[]>()
  variants.forEach((v) => {
    const key = `${v.color ?? ''}|${v.sections ?? ''}`
    const g = map.get(key)
    if (g) g.push(v)
    else map.set(key, [v])
  })
  return Array.from(map.entries()).map(([key, vs]) => ({
    key,
    color:      vs[0].color,
    sections:   vs[0].sections,
    totalStock: vs.reduce((s, v) => s + v.stock, 0),
    avgPrice:   vs.reduce((s, v) => s + Number(v.price_uzs), 0) / vs.length,
  }))
}

interface Props {
  onAddToCart: (product: Product, variant: Variant | null, qty: number) => void
}

export default function ModelPage({ onAddToCart }: Props) {
  const { code } = useParams<{ code: string }>()
  const { t } = useLocale()
  const [model, setModel]               = useState<ModelDetail | null>(null)
  const [loading, setLoading]           = useState(true)
  const [notFound, setNotFound]         = useState(false)
  const [selectedColor, setSelectedColor]         = useState<string | null>(null)
  const [selectedSections, setSelectedSections]   = useState<number | null>(null)
  const [qty, setQty]     = useState(1)
  const [added, setAdded] = useState(false)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (!code) return
    setLoading(true)
    setNotFound(false)
    fetchModel(code)
      .then((r) => {
        const m = r.data
        setModel(m)
        const defaultColor = m.colors.includes('white') ? 'white' : (m.colors[0] ?? null)
        setSelectedColor(defaultColor)
        setSelectedSections(m.sections_available[0] ?? null)
        document.title = `${m.name_ru} — SR Lux`
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
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
        <Link to="/" className="text-gold hover:underline text-sm">← {t.catalog}</Link>
      </div>
    )
  }

  // All variants matching current selection
  const groupCandidates = model.variants.filter((v) => {
    const colorOk    = !selectedColor    || v.color    === selectedColor
    const sectionsOk = !selectedSections || v.sections === selectedSections
    return colorOk && sectionsOk
  })

  // Pick the variant with highest stock for cart
  const selectedVariant: ModelVariant | null =
    [...groupCandidates].sort((a, b) => b.stock - a.stock)[0] ?? null

  // Aggregated price/stock for the selected group
  const groupTotalStock = groupCandidates.reduce((s, v) => s + v.stock, 0)
  const groupAvgPrice   = groupCandidates.length
    ? groupCandidates.reduce((s, v) => s + Number(v.price_uzs), 0) / groupCandidates.length
    : 0

  const inStock = groupTotalStock > 0

  // Sections available for the currently selected color
  const sectionsForColor = model.sections_available.filter((s) =>
    model.variants.some((v) => v.color === selectedColor && v.sections === s),
  )

  const currentImage = selectedColor ? (model.color_images[selectedColor] ?? null) : null

  // Grouped rows for the table (merges duplicates from multiple manufacturers)
  const groupedRows = buildGroupedRows(model.variants)

  const handleAdd = () => {
    if (!selectedVariant) return
    const productForCart: Product = {
      id:             selectedVariant.id,
      sku:            selectedVariant.sku,
      slug:           selectedVariant.slug,
      name_ru:        selectedVariant.name_ru,
      name_uz:        null,
      description_ru: model.description_ru,
      description_uz: null,
      price_uzs:      Number(selectedVariant.price_uzs),
      stock:          selectedVariant.stock,
      weight:         null,
      image_url:      selectedVariant.image_url ?? currentImage,
      category:       null,
      variants:       [],
    }
    onAddToCart(productForCart, null, qty)
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
            {currentImage && !imgError ? (
              <img
                src={currentImage}
                alt={model.name_ru}
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
            {model.category_name && (
              <p className="text-xs text-gold uppercase tracking-wider font-semibold">
                {model.category_name}
              </p>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              {model.name_ru}
            </h1>

            {/* Color selector */}
            {model.colors.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Цвет</p>
                <div className="flex flex-wrap gap-2">
                  {model.colors.map((c) => {
                    const d = COLOR_DISPLAY[c] || { label: c, hex: '#888' }
                    return (
                      <button
                        key={c}
                        onClick={() => { setSelectedColor(c); setImgError(false) }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                          selectedColor === c
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
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Sections selector */}
            {sectionsForColor.length > 1 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Секций</p>
                <div className="flex flex-wrap gap-2">
                  {sectionsForColor.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSelectedSections(s)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                        selectedSections === s
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
            {groupCandidates.length > 0 ? (
              <div className="bg-anthracite-800 rounded-xl p-4 border border-gold-700/15">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Цена</p>
                    <p className="text-3xl font-extrabold bg-gold-gradient bg-clip-text text-transparent">
                      {fmt(groupAvgPrice)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{t.sum}</p>
                  </div>
                  <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                    inStock ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${inStock ? 'bg-green-400' : 'bg-red-400'}`} />
                    {inStock ? `${groupTotalStock} ${t.qty}` : t.outOfStock}
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-anthracite-800 rounded-xl p-4 border border-gold-700/15 text-gray-500 text-sm">
                Выберите цвет{model.sections_available.length > 1 ? ' и количество секций' : ''}
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
                disabled={!inStock || !selectedVariant}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                  inStock && selectedVariant
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

            {/* Description — render HTML from Dolibarr */}
            {model.description_ru && (
              <div className="bg-anthracite-800 rounded-xl p-4 border border-gold-700/10">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Описание</p>
                <div
                  className="text-gray-300 text-sm leading-relaxed [&_strong]:text-gray-200 [&_br]:block"
                  dangerouslySetInnerHTML={{ __html: model.description_ru }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Variants table — grouped by (color, sections) */}
        {groupedRows.length > 1 && (
          <div className="mt-12">
            <h2 className="text-lg font-bold text-white mb-4">Все варианты</h2>
            <div className="overflow-x-auto rounded-xl border border-gold-700/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gold-700/20 bg-anthracite-800">
                    {model.sections_available.length > 0 && (
                      <th className="text-left py-3 px-4 text-gray-500 font-normal">Секций</th>
                    )}
                    {model.colors.length > 1 && (
                      <th className="text-left py-3 px-4 text-gray-500 font-normal">Цвет</th>
                    )}
                    <th className="text-right py-3 px-4 text-gray-500 font-normal">Цена, сум</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-normal">Наличие</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map((row) => {
                    const cd = row.color ? (COLOR_DISPLAY[row.color] ?? { label: row.color, hex: '#888' }) : null
                    const isSelected =
                      row.color    === selectedColor &&
                      row.sections === selectedSections
                    return (
                      <tr
                        key={row.key}
                        onClick={() => {
                          if (row.color !== null)    { setSelectedColor(row.color); setImgError(false) }
                          if (row.sections !== null)   setSelectedSections(row.sections)
                        }}
                        className={`border-b border-gold-700/10 cursor-pointer transition-colors ${
                          isSelected ? 'bg-gold/5' : 'hover:bg-anthracite-800'
                        }`}
                      >
                        {model.sections_available.length > 0 && (
                          <td className="py-2.5 px-4 text-gray-300">{row.sections ?? '—'}</td>
                        )}
                        {model.colors.length > 1 && (
                          <td className="py-2.5 px-4">
                            {cd && (
                              <span className="flex items-center gap-2">
                                <span
                                  className="w-3 h-3 rounded-full"
                                  style={{
                                    backgroundColor: cd.hex,
                                    border: cd.border ? '1px solid #666' : '1px solid #222',
                                  }}
                                />
                                <span className="text-gray-300">{cd.label}</span>
                              </span>
                            )}
                          </td>
                        )}
                        <td className="py-2.5 px-4 text-right font-semibold text-gold">
                          {fmt(row.avgPrice)}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <span className={row.totalStock > 0 ? 'text-green-400' : 'text-gray-600'}>
                            {row.totalStock > 0 ? `${row.totalStock} ${t.qty}` : '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
