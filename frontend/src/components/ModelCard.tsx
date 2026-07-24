import { ChevronRight, ImageOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ModelCard } from '../api/client'
import SmartImage from './SmartImage'
import { useLocale } from '../contexts/LocaleContext'

const COLOR_HEX: Record<string, { hex: string; border?: boolean }> = {
  white:      { hex: '#FFFFFF', border: true },
  anthracite: { hex: '#484A4E' },
  black:      { hex: '#1C1C1E' },
  gold:       { hex: '#C9A227' },
  chrome:     { hex: '#C0C0C0', border: true },
}

function fmt(n: number) {
  return Number(n).toLocaleString('ru-RU')
}

export default function ModelCard({ model, catIds }: { model: ModelCard; catIds?: number[] | null }) {
  const { t, lang } = useLocale()
  const inStock = model.total_stock > 0
  const priceFrom = Number(model.price_from)
  const priceTo   = Number(model.price_to)
  const displayName = lang === 'uz' ? (model.name_uz || model.name_ru) : model.name_ru
  const displayCategory = lang === 'uz' ? (model.category_name_uz || model.category_name) : model.category_name

  // Prefer a photo actually taken from the category branch the customer is
  // browsing (e.g. a Вертикальные-appropriate shot, not a Горизонтальные one)
  // when this model spans more than one orientation — falls back to the
  // model's generic cover photo otherwise.
  const scopedImage = catIds?.length
    ? catIds.map(String).map((id) => model.category_images[id]).find((url) => !!url)
    : undefined
  const displayImage = scopedImage ?? model.image_url

  return (
    <Link
      to={catIds && catIds.length ? `/model/${model.code}?cats=${catIds.join(',')}` : `/model/${model.code}`}
      className="group flex flex-col bg-anthracite-800 rounded-xl border border-gold-700/10 hover:border-gold/40 shadow-card hover:shadow-gold transition-all duration-300 overflow-hidden animate-slide-up"
    >
      {/* Image */}
      <div className="relative overflow-hidden bg-anthracite-700 aspect-square">
        {displayImage ? (
          <SmartImage
            src={displayImage}
            alt={displayName}
            className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-500"
            onLoadError={() => {}}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              const next = e.currentTarget.nextElementSibling as HTMLElement
              if (next) next.style.display = 'flex'
            }}
          />
        ) : null}
        <div
          className={`${displayImage ? 'hidden' : 'flex'} absolute inset-0 items-center justify-center flex-col gap-2 text-gray-600`}
        >
          <ImageOff size={36} />
        </div>

        {/* Stock badge — hidden on mobile: precise counts ('130 шт') read as
            discount-store b2b clutter on a premium storefront; kept on
            desktop where there is room for it to sit unobtrusively. */}
        <div className="hidden sm:block absolute top-2 right-2">
          <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold backdrop-blur-sm ${
            inStock ? 'bg-green-900/80 text-green-400' : 'bg-red-900/80 text-red-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${inStock ? 'bg-green-400' : 'bg-red-400'}`} />
            {inStock ? `${model.total_stock} ${t.qty}` : t.outOfStockShort}
          </span>
        </div>

        {/* Color dots */}
        {model.colors.length > 0 && (
          <div className="absolute bottom-2 left-2 flex gap-1">
            {model.colors.map((c) => {
              const s = COLOR_HEX[c] || { hex: '#888' }
              return (
                <span
                  key={c}
                  className="w-4 h-4 rounded-full shadow"
                  style={{
                    backgroundColor: s.hex,
                    border: s.border ? '1px solid #555' : '1px solid #333',
                  }}
                  title={c}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 p-4 gap-3">
        {displayCategory && (
          <p className="text-[10px] text-gold uppercase tracking-widest font-semibold">
            {displayCategory}
          </p>
        )}

        <h3 className="text-white font-semibold text-sm leading-snug group-hover:text-gold transition-colors">
          {displayName}
        </h3>

        <div className="mt-auto pt-3 border-t border-gold-700/10 flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] text-gray-400 mb-0.5">{t.from}</p>
            <p className="text-xl font-bold bg-gold-gradient bg-clip-text text-transparent">
              {fmt(priceFrom)}
            </p>
            {priceTo > priceFrom && (
              <p className="text-[10px] text-gray-400">
                {lang === 'uz' ? `${fmt(priceTo)} so'mgacha` : `до ${fmt(priceTo)} сум`}
              </p>
            )}
            {priceTo === priceFrom && (
              <p className="text-[10px] text-gray-400">{t.sum}</p>
            )}
          </div>
          <span className="flex items-center gap-1 text-gold text-xs font-semibold group-hover:gap-2 transition-all">
            {t.select} <ChevronRight size={14} />
          </span>
        </div>
      </div>
    </Link>
  )
}
