import { useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import type { Product, Variant } from './api/client'
import Footer from './components/Footer'
import Header from './components/Header'
import { LocaleProvider } from './contexts/LocaleContext'
import CartPage from './pages/CartPage'
import CatalogPage from './pages/CatalogPage'
import ModelPage from './pages/ModelPage'
import ProductPage from './pages/ProductPage'

interface CartItem extends Product {
  variant: Variant | null
  cartQty: number
}

export default function App() {
  const [cartItems, setCartItems] = useState<CartItem[]>([])

  const cartCount = cartItems.reduce((s, i) => s + i.cartQty, 0)

  const addToCart = (product: Product, variant: Variant | null, qty: number) => {
    setCartItems((prev) => {
      const idx = prev.findIndex(
        (i) => i.id === product.id && (i.variant?.id ?? null) === (variant?.id ?? null),
      )
      if (idx >= 0) {
        return prev.map((item, i) =>
          i === idx ? { ...item, cartQty: item.cartQty + qty } : item,
        )
      }
      return [...prev, { ...product, variant, cartQty: qty }]
    })
  }

  return (
    <LocaleProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-anthracite-900 text-white font-sans">
          <Header cartCount={cartCount} />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<CatalogPage />} />
              <Route
                path="/model/:code"
                element={<ModelPage onAddToCart={addToCart} />}
              />
              <Route
                path="/product/:slug"
                element={<ProductPage onAddToCart={addToCart} />}
              />
              <Route
                path="/cart"
                element={<CartPage items={cartItems} onCartChange={setCartItems} />}
              />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </LocaleProvider>
  )
}
