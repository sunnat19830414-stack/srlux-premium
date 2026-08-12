import { Trash2, ShoppingCart, Paperclip, X, FileText } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Product, UploadedFile, Variant } from '../api/client'
import { placeOrder, uploadOrderFile } from '../api/client'
import { useEffect } from 'react'
import { useLocale } from '../contexts/LocaleContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { setSeo } from '../lib/seo'

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[]
    renderOptIn?: () => void
    gapi?: { load: (name: string, cb: () => void) => void; surveyoptin: { render: (opts: Record<string, unknown>) => void } }
  }
}

interface CartItem extends Product {
  variant: Variant | null
  cartQty: number
  customRal?: string
}

interface Props {
  items: CartItem[]
  onCartChange: (items: CartItem[]) => void
}

export default function CartPage({ items, onCartChange }: Props) {
  const { lang, t } = useLocale()
  const { currency, formatPrice: fmt } = useCurrency()

  useEffect(() => {
    setSeo({
      title: lang === 'uz' ? 'Savat — SR Lux' : 'Корзина — SR Lux',
      description: lang === 'uz' ? 'SR Lux isitish va iqlim-nazorat tizimlariga buyurtma berish.' : 'Оформление заказа систем отопления и климат-контроля SR Lux.',
      path: '/cart',
    })
  }, [lang])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  // Captured only on successful submit, alongside the order's own number —
  // used to trigger the Google Customer Reviews opt-in survey below, kept
  // separate from the live `email` field so clearing the form after
  // checkout doesn't blank the value the success screen still needs.
  const [placedOrder, setPlacedOrder] = useState<{ orderNumber: string; email: string } | null>(null)
  const [projectFile, setProjectFile] = useState<UploadedFile | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [fileError, setFileError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Custom-RAL requests have no final price yet (manager confirms it after
  // discussing the colour), so they're excluded from the checkout total.
  const total = items.reduce((sum, item) => {
    if (item.customRal) return sum
    const price = item.variant
      ? item.price_uzs + Number(item.variant.price_modifier)
      : item.price_uzs
    return sum + price * item.cartQty
  }, 0)
  const hasCustomRal = items.some((i) => i.customRal)

  const remove = (id: number, variantId: number | null) => {
    onCartChange(
      items.filter((i) => !(i.id === id && (i.variant?.id ?? null) === variantId)),
    )
  }

  const changeQty = (id: number, variantId: number | null, delta: number) => {
    onCartChange(
      items
        .map((i) =>
          i.id === id && (i.variant?.id ?? null) === variantId
            ? { ...i, cartQty: Math.max(1, i.cartQty + delta) }
            : i,
        ),
    )
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['pdf', 'dwg', 'dxf'].includes(ext)) {
      setFileError(lang === 'uz' ? 'Faqat PDF, DWG, DXF' : 'Только PDF, DWG, DXF')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setFileError(lang === 'uz' ? 'Fayl 25 MB dan katta' : 'Файл больше 25 МБ')
      return
    }
    setFileError('')
    setUploadingFile(true)
    try {
      const res = await uploadOrderFile(file)
      setProjectFile(res.data)
    } catch {
      setFileError(lang === 'uz' ? 'Yuklab bo\'lmadi' : 'Не удалось загрузить файл')
    } finally {
      setUploadingFile(false)
    }
  }

  const handleOrder = async () => {
    if (!name.trim() || !phone.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const res = await placeOrder({
        customer_name: name,
        customer_phone: phone,
        customer_address: address || undefined,
        customer_email: email || undefined,
        items: items.map((i) => ({
          product_id: i.id,
          variant_id: i.variant?.id,
          quantity: i.cartQty,
          custom_ral_note: i.customRal,
        })),
        project_file_url: projectFile?.url,
        project_file_name: projectFile?.filename,
      })
      setSuccess(true)
      setPlacedOrder({ orderNumber: res.data.order_number, email })
      onCartChange([])
      setProjectFile(null)
      // Google Ads "Покупка" conversion (AW-18326560711/FVQYCMiyj9EcEMe_5KJE)
      // is wired up in GTM off this dataLayer event, not a direct gtag() call —
      // GTM only exposes dataLayer to page scripts, not a global gtag().
      window.dataLayer = window.dataLayer || []
      window.dataLayer.push({
        event: 'purchase',
        value: total,
        currency: 'UZS',
        transaction_id: res.data.order_number,
      })
    } catch {
      setError(t.orderError)
    } finally {
      setSubmitting(false)
    }
  }

  // Google Customer Reviews opt-in survey — only fires when the customer
  // gave an email, per the program's required fields (merchant_id, order_id,
  // email, delivery_country, estimated_delivery_date). delivery_country
  // isn't actually collected at checkout (address is free text), so this
  // defaults to "UZ" — the business's home market and the vast majority of
  // orders. estimated_delivery_date uses the shipping policy's own filed
  // max transit time (8 days, see Merchant Center shipping rule) as a safe
  // upper-bound estimate, not a number invented here.
  useEffect(() => {
    if (!placedOrder?.email) return

    const deliveryDate = new Date()
    deliveryDate.setDate(deliveryDate.getDate() + 8)
    const estimatedDeliveryDate = deliveryDate.toISOString().slice(0, 10)
    const { orderNumber, email: customerEmail } = placedOrder

    window.renderOptIn = () => {
      window.gapi?.load('surveyoptin', () => {
        window.gapi?.surveyoptin.render({
          merchant_id: 5836233869,
          order_id: orderNumber,
          email: customerEmail,
          delivery_country: 'UZ',
          estimated_delivery_date: estimatedDeliveryDate,
        })
      })
    }

    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/platform.js?onload=renderOptIn'
    script.async = true
    script.defer = true
    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [placedOrder])

  if (success) {
    return (
      <div className="min-h-screen bg-anthracite-900 flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-green-900/40 flex items-center justify-center mb-2">
          <ShoppingCart size={28} className="text-green-400" />
        </div>
        <h2 className="text-xl font-bold text-white">{t.orderSuccess}</h2>
        <Link
          to="/"
          className="mt-4 px-6 py-2.5 rounded-xl bg-gold text-anthracite-900 font-bold text-sm hover:bg-gold-600 transition-colors"
        >
          {t.catalog}
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-anthracite-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-2xl font-bold text-white mb-2">{t.cart}</h1>
        <p className="text-sm text-gray-500 mb-8">
          {lang === 'uz'
            ? "Pozitsiyalarni to'plang — muhandisimiz hisob-kitobni tayyorlaydi va tarkibni siz bilan tasdiqlaydi"
            : 'Соберите список позиций — наш инженер подготовит расчёт и свяжется с вами для подтверждения комплектации'}
        </p>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-500 gap-4">
            <ShoppingCart size={52} className="opacity-20" />
            <p>{t.emptyCart}</p>
            <Link
              to="/"
              className="text-gold hover:underline text-sm"
            >
              ← {t.catalog}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Items */}
            <div className="lg:col-span-2 space-y-3">
              {items.map((item, itemIdx) => {
                const itemName = lang === 'uz' ? (item.name_uz || item.name_ru) : item.name_ru
                const variantName = item.variant
                  ? (lang === 'uz' ? (item.variant.name_uz || item.variant.name_ru) : item.variant.name_ru)
                  : null
                const unitPrice = item.variant
                  ? item.price_uzs + Number(item.variant.price_modifier)
                  : item.price_uzs

                return (
                  <div
                    key={`${item.id}-${item.variant?.id ?? 'base'}-${itemIdx}`}
                    className="flex gap-4 bg-anthracite-800 rounded-xl p-4 border border-gold-700/10"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm line-clamp-2">{itemName}</p>
                      {variantName && (
                        <p className="text-xs text-gray-500 mt-0.5">{variantName}</p>
                      )}
                      {item.customRal && (
                        <p className="text-xs text-gold mt-0.5">
                          🎨 {item.customRal}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1 font-mono">{t.sku} {item.sku}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center border border-gray-700 rounded-lg overflow-hidden">
                          <button
                            onClick={() => changeQty(item.id, item.variant?.id ?? null, -1)}
                            className="px-2 py-1 text-gray-400 hover:text-white transition-colors text-sm"
                          >
                            −
                          </button>
                          <span className="px-3 text-white text-sm border-x border-gray-700">
                            {item.cartQty}
                          </span>
                          <button
                            onClick={() => changeQty(item.id, item.variant?.id ?? null, 1)}
                            className="px-2 py-1 text-gray-400 hover:text-white transition-colors text-sm"
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={() => remove(item.id, item.variant?.id ?? null)}
                          className="text-gray-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {item.customRal ? (
                        <p className="text-gold font-bold text-sm">
                          {lang === 'uz' ? 'Narxi aniqlanadi' : 'Цена уточняется'}
                        </p>
                      ) : (
                        <>
                          <p className="text-gold font-bold">
                            {fmt(unitPrice * item.cartQty)}
                          </p>
                          <p className="text-[10px] text-gray-500">{currency === 'USD' ? '$' : t.sum}</p>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Order form */}
            <div className="bg-anthracite-800 rounded-xl border border-gold-700/15 p-5 h-fit space-y-4">
              <h2 className="text-white font-semibold text-base">{t.checkout}</h2>

              <div className="border-t border-gold-700/10 pt-4 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">{t.total}</span>
                  <span className="text-gold font-bold">{fmt(total)} {currency === 'USD' ? '$' : t.sum}</span>
                </div>
                {hasCustomRal && (
                  <p className="text-[11px] text-gray-500">
                    {lang === 'uz'
                      ? "+ RAL rangdagi buyurtma(lar) narxi alohida aniqlanadi"
                      : '+ товар(ы) с индивидуальным цветом RAL — цена уточняется отдельно'}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder={t.orderName}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-anthracite-700 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gold/50"
                />
                <input
                  type="tel"
                  placeholder={t.orderPhone}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-anthracite-700 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gold/50"
                />
                <input
                  type="email"
                  placeholder={t.orderEmail}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-anthracite-700 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gold/50"
                />
                <textarea
                  placeholder={t.orderAddress}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  className="w-full bg-anthracite-700 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gold/50 resize-none"
                />
              </div>

              {/* Project file — PDF/DWG/DXF for designers and contractors
                  to attach a spec alongside the order */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.dwg,.dxf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {projectFile ? (
                  <div className="flex items-center gap-2 bg-anthracite-700 border border-gray-700 rounded-lg px-3 py-2.5 text-sm">
                    <FileText size={16} className="text-gold shrink-0" />
                    <span className="text-gray-300 truncate flex-1">{projectFile.filename}</span>
                    <button
                      type="button"
                      onClick={() => setProjectFile(null)}
                      className="text-gray-500 hover:text-red-400 transition-colors shrink-0"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="w-full flex items-center justify-center gap-2 border border-dashed border-gray-700 hover:border-gold/50 rounded-lg px-3 py-2.5 text-sm text-gray-400 hover:text-gold transition-colors disabled:opacity-50"
                  >
                    <Paperclip size={15} />
                    {uploadingFile
                      ? t.loading
                      : (lang === 'uz' ? 'Loyiha fayli (PDF, DWG)' : 'Прикрепить файл проекта (PDF, DWG)')}
                  </button>
                )}
                {fileError && <p className="text-red-400 text-xs mt-1">{fileError}</p>}
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}

              <button
                onClick={handleOrder}
                disabled={submitting || !name.trim() || !phone.trim()}
                className="w-full py-3 rounded-xl bg-gold hover:bg-gold-600 text-anthracite-900 font-bold text-sm transition-all shadow-gold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? t.loading : t.placeOrder}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
