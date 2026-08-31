import React, { createContext, useContext, useEffect, useState } from 'react'
import { fetchCurrencyRate } from '../api/client'

export type CurrencyCode = 'UZS' | 'USD'

// Fallback only until the live rate loads from /api/currencies/USD (admin-
// editable — see routers/admin.py's PATCH /currencies/{code}) — matches the
// same constant used server-side as erp_sync_dolibarr.py's own fallback, so
// a brief flash before the fetch resolves still shows a sane number.
const FALLBACK_RATE = 12650

interface CurrencyCtx {
  currency: CurrencyCode
  setCurrency: (c: CurrencyCode) => void
  /** Formats a UZS amount for display in the currently selected currency
   * (no unit suffix — callers append their own locale-aware "сум"/"so'm"/"$"). */
  formatPrice: (uzsAmount: number) => string
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString('ru-RU')

const CurrencyContext = createContext<CurrencyCtx>({
  currency: 'UZS',
  setCurrency: () => {},
  formatPrice: defaultFormat,
})

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<CurrencyCode>('UZS')
  const [rate, setRate] = useState(FALLBACK_RATE)

  useEffect(() => {
    fetchCurrencyRate('USD')
      .then((r) => setRate(Number(r.data.rate_to_uzs)))
      .catch(() => {})
  }, [])

  const formatPrice = (uzsAmount: number) => {
    if (currency === 'USD') {
      return (uzsAmount / rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    return defaultFormat(uzsAmount)
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatPrice }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
