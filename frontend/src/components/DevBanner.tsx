import { useState } from 'react'
import { useLocale } from '../contexts/LocaleContext'

export default function DevBanner() {
  const { lang } = useLocale()
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('srlux_dev_banner_dismissed') === '1' } catch { return false }
  })

  if (dismissed) return null

  const dismiss = () => {
    try { localStorage.setItem('srlux_dev_banner_dismissed', '1') } catch {}
    setDismissed(true)
  }

  const text = lang === 'uz'
    ? 'Sayt ishlab chiqilmoqda. Ba\'zi ma\'lumotlar (narxlar, rasmlar, tavsiflot) to\'liq bo\'lmasligi yoki noto\'g\'ri bo\'lishi mumkin.'
    : 'Сайт находится в разработке. Часть информации (цены, фотографии, описания) может быть неполной или неточной.'

  const btnLabel = lang === 'uz' ? 'Tushundim' : 'Понятно'

  return (
    <div className="bg-amber-600 text-white text-sm py-2 px-4 flex items-center justify-between gap-4">
      <span className="flex items-center gap-2">
        <span className="text-base">🚧</span>
        <span>{text}</span>
      </span>
      <button
        onClick={dismiss}
        className="shrink-0 text-white/80 hover:text-white border border-white/40 hover:border-white/70 rounded px-2 py-0.5 text-xs transition-colors"
      >
        {btnLabel}
      </button>
    </div>
  )
}
