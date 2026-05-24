import { Trash2, ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Product, Variant } from '../api/client'
import { placeOrder } from '../api/client'
import { useLocale } from '../contexts/LocaleContext'

interface CartItem extends Product {
  variant: Variant | null
  cartQty: number
}

interface Props {
  items: CartItem[]
  onCartChange: (items: CartItem[]) => void
}

function fmt(n: number) {
  return n.toLocaleString('ru-RU')
}

export default function CartPage({ items, onCartChange }: Props) {
  const { lang, t } = useLocale()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const total = items.reduce((sum, item) => {
    const price = item.variant
      ? item.price_uzs + Number(item.variant.price_modifier)
      : item.price_uzs
    return sum + price * item.cartQty
  }, 0)

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

  const handleOrder = async () => {
    if (!name.trim() || !phone.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await placeOrder({
        customer_name: name,
        customer_phone: phone,
        customer_address: address || undefined,
        items: items.map((i) => ({
          product_id: i.id,
          variant_id: i.variant?.id,
          quantity: i.cartQty,
        })),
      })
      setSuccess(true)
      onCartChange([])
    } catch {
      setError(t.orderError)
    } finally {
      setSubmitting(false)
    }
  }

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
        <h1 className="text-2xl font-bold text-white mb-8">{t.cart}</h1>

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
              {items.map((item) => {
                const itemName = lang === 'uz' ? (item.name_uz || item.name_ru) : item.name_ru
                const variantName = item.variant
                  ? (lang === 'uz' ? (item.variant.name_uz || item.variant.name_ru) : item.variant.name_ru)
                  : null
                const unitPrice = item.variant
                  ? item.price_uzs + Number(item.variant.price_modifier)
                  : item.price_uzs

                return (
                  <div
                    key={`${item.id}-${item.variant?.id ?? 'base'}`}
                    className="flex gap-4 bg-anthracite-800 rounded-xl p-4 border border-gold-700/10"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm line-clamp-2">{itemName}</p>
                      {variantName && (
                        <p className="text-xs text-gray-500 mt-0.5">{variantName}</p>
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
                      <p className="text-gold font-bold">
                        {fmt(unitPrice * item.cartQty)}
                      </p>
                      <p className="text-[10px] text-gray-500">{t.sum}</p>
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
                  <span className="text-gold font-bold">{fmt(total)} {t.sum}</span>
                </div>
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
                <textarea
                  placeholder={t.orderAddress}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  className="w-full bg-anthracite-700 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gold/50 resize-none"
                />
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
