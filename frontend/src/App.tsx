import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Product, Variant } from './api/client'
import Footer from './components/Footer'
import Header from './components/Header'
import { LocaleProvider } from './contexts/LocaleContext'
import AboutPage from './pages/AboutPage'
import CartPage from './pages/CartPage'
import CatalogPage from './pages/CatalogPage'
import ContactsPage from './pages/ContactsPage'
import DeliveryPage from './pages/DeliveryPage'
import ModelPage from './pages/ModelPage'
import ProductPage from './pages/ProductPage'
import AdminLayout from './pages/admin/AdminLayout'
import AdminLogin from './pages/admin/AdminLogin'
import AdminCategories from './pages/admin/AdminCategories'
import AdminOrderDetail from './pages/admin/AdminOrderDetail'
import AdminOrders from './pages/admin/AdminOrders'
import AdminProducts from './pages/admin/AdminProducts'
import AdminStats from './pages/admin/AdminStats'
import AdminSync from './pages/admin/AdminSync'

interface CartItem extends Product {
  variant: Variant | null
  cartQty: number
}

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem('srlux_cart')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export default function App() {
  const [cartItems, setCartItems] = useState<CartItem[]>(loadCart)

  const cartCount = cartItems.reduce((s, i) => s + i.cartQty, 0)

  const saveCart = (items: CartItem[]) => {
    try { localStorage.setItem('srlux_cart', JSON.stringify(items)) } catch {}
  }

  const addToCart = (product: Product, variant: Variant | null, qty: number) => {
    setCartItems((prev) => {
      const idx = prev.findIndex(
        (i) => i.id === product.id && (i.variant?.id ?? null) === (variant?.id ?? null),
      )
      if (idx >= 0) {
        const next = prev.map((item, i) =>
          i === idx ? { ...item, cartQty: item.cartQty + qty } : item,
        )
        saveCart(next)
        return next
      }
      const next = [...prev, { ...product, variant, cartQty: qty }]
      saveCart(next)
      return next
    })
  }

  return (
    <LocaleProvider>
      <BrowserRouter>
        <Routes>
          {/* Admin panel — separate layout, no header/footer */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="orders" replace />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="orders/:id" element={<AdminOrderDetail />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="sync" element={<AdminSync />} />
            <Route path="stats" element={<AdminStats />} />
          </Route>

          {/* Main site */}
          <Route
            path="/*"
            element={
              <div className="min-h-screen flex flex-col bg-anthracite-900 text-white font-sans">
                <Header cartCount={cartCount} />
                <main className="flex-1">
                  <Routes>
                    <Route path="/" element={<CatalogPage />} />
                    <Route path="/model/:code" element={<ModelPage onAddToCart={addToCart} />} />
                    <Route path="/product/:slug" element={<ProductPage onAddToCart={addToCart} />} />
                    <Route
                      path="/cart"
                      element={
                        <CartPage
                          items={cartItems}
                          onCartChange={(items) => { setCartItems(items); saveCart(items) }}
                        />
                      }
                    />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/contacts" element={<ContactsPage />} />
                    <Route path="/delivery" element={<DeliveryPage />} />
                  </Routes>
                </main>
                <Footer />
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </LocaleProvider>
  )
}
