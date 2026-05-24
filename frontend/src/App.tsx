import React, { useState, useEffect } from 'react'
import axios from 'axios'

type Lang = 'ru' | 'uz' | 'en'

interface Product {
  id: number
  label: string
  price: number
  quantity: number
  description?: string
}

interface CartItem extends Product {
  cart_quantity: number
}

// === TRANSLATIONS ===

const translations = {
  ru: {
    title: 'SR Lux - Премиальное отопление',
    catalog: 'Каталог',
    cart: 'Корзина',
    profile: 'Профиль',
    login: 'Вход',
    signup: 'Регистрация',
    logout: 'Выход',
    products: 'Товары',
    categories: 'Категории',
    price: 'Цена',
    quantity: 'Количество',
    addToCart: 'Добавить в корзину',
    checkout: 'Оформить заказ',
    viewDetails: 'Подробнее',
    noProducts: 'Товары не найдены',
    loading: 'Загрузка...',
    empty: 'Корзина пуста',
    total: 'Итого',
  },
  uz: {
    title: 'SR Lux - Premium isitish',
    catalog: 'Katalog',
    cart: 'Savat',
    profile: 'Profil',
    login: 'Kirish',
    signup: 'Ro\'yxatdan o\'tish',
    logout: 'Chiqish',
    products: 'Mahsulotlar',
    categories: 'Kategoriyalar',
    price: 'Narxi',
    quantity: 'Miqdori',
    addToCart: 'Savatga qo\'shish',
    checkout: 'Buyurtmani tayyorlash',
    viewDetails: 'Batafsil',
    noProducts: 'Mahsulotlar topilmadi',
    loading: 'Yuklanmoqda...',
    empty: 'Savat bo\'sh',
    total: 'Jami',
  },
  en: {
    title: 'SR Lux - Premium Heating',
    catalog: 'Catalog',
    cart: 'Cart',
    profile: 'Profile',
    login: 'Login',
    signup: 'Sign Up',
    logout: 'Logout',
    products: 'Products',
    categories: 'Categories',
    price: 'Price',
    quantity: 'Quantity',
    addToCart: 'Add to Cart',
    checkout: 'Checkout',
    viewDetails: 'Details',
    noProducts: 'No products found',
    loading: 'Loading...',
    empty: 'Cart is empty',
    total: 'Total',
  }
}

// === COLORS ===

const colors = {
  primary: '#B8A000',      // Золотистый (из логотипа)
  secondary: '#D4AF37',    // Светлое золото
  dark: '#2D2D2D',         // Тёмно-серый
  light: '#F5F5F5',        // Светлый фон
  text: '#1a1a1a',         // Тёмный текст
  white: '#FFFFFF',
}

// === STYLES ===

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: colors.light,
    fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  },
  header: {
    backgroundColor: colors.dark,
    color: colors.white,
    padding: '1rem',
    position: 'sticky' as const,
    top: 0,
    zIndex: 100,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '1rem',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    textDecoration: 'none',
    color: colors.white,
    fontSize: '1.5rem',
    fontWeight: 'bold',
  },
  logoImg: {
    height: '40px',
    width: 'auto',
  },
  nav: {
    display: 'flex',
    gap: '2rem',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  navButton: {
    background: 'transparent',
    color: colors.white,
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    transition: 'background 0.2s',
  },
  langButton: {
    padding: '0.25rem 0.75rem',
    marginRight: '0.5rem',
  },
  main: {
    maxWidth: '1200px',
    margin: '2rem auto',
    padding: '0 1rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '2rem',
    marginTop: '2rem',
  },
  productCard: {
    backgroundColor: colors.white,
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    transition: 'transform 0.2s, boxShadow 0.2s',
    cursor: 'pointer',
  },
  productImage: {
    width: '100%',
    height: '200px',
    backgroundColor: '#f0f0f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '3rem',
  },
  productInfo: {
    padding: '1rem',
  },
  productName: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem',
    color: colors.text,
  },
  productPrice: {
    fontSize: '1.5rem',
    color: colors.primary,
    fontWeight: 'bold',
    marginBottom: '1rem',
  },
  button: {
    backgroundColor: colors.primary,
    color: colors.dark,
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '1rem',
    transition: 'background 0.2s',
  },
  footer: {
    backgroundColor: colors.dark,
    color: colors.white,
    textAlign: 'center' as const,
    padding: '2rem',
    marginTop: '4rem',
  },
}

// === MAIN APP ===

export default function App() {
  const [lang, setLang] = useState<Lang>('ru')
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState<'catalog' | 'cart'>('catalog')

  const t = translations[lang]

  // Fetch products
  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const response = await axios.get('http://localhost:8000/api/v1/products')
      if (response.data.products) {
        setProducts(response.data.products.map((p: any) => ({
          id: p.id || Math.random(),
          label: p.label || 'Product',
          price: p.price || 0,
          quantity: p.quantity || 0,
        })))
      }
    } catch (error) {
      console.error('Error fetching products:', error)
      // Fallback data
      setProducts([
        { id: 1, label: 'Радиатор премиум', price: 150000, quantity: 10, description: 'Высокоэффективный радиатор' },
        { id: 2, label: 'Котёл отопления', price: 500000, quantity: 5, description: 'Мощный котёл' },
        { id: 3, label: 'Термостат', price: 50000, quantity: 20, description: 'Интеллектуальный' },
      ])
    }
    setLoading(false)
  }

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.id === product.id)
    if (existing) {
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, cart_quantity: item.cart_quantity + 1 }
          : item
      ))
    } else {
      setCart([...cart, { ...product, cart_quantity: 1 }])
    }
  }

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.id !== productId))
  }

  const total = cart.reduce((sum, item) => sum + item.price * item.cart_quantity, 0)

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          {/* LOGO */}
          <a href="#" style={styles.logo}>
            <img src="/public_assets/logo-small.png" alt="SR Lux" style={styles.logoImg} />
            <span>SR Lux</span>
          </a>

          {/* NAV */}
          <nav style={styles.nav}>
            {/* LANG SWITCHER */}
            <div>
              {(['ru', 'uz', 'en'] as Lang[]).map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  style={{
                    ...styles.navButton,
                    ...styles.langButton,
                    backgroundColor: lang === l ? colors.primary : 'transparent',
                    color: lang === l ? colors.dark : colors.white,
                  }}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>

            {/* PAGE BUTTONS */}
            <button
              onClick={() => setPage('catalog')}
              style={{
                ...styles.navButton,
                borderBottom: page === 'catalog' ? `2px solid ${colors.primary}` : 'none',
              }}
            >
              {t.catalog}
            </button>
            <button
              onClick={() => setPage('cart')}
              style={{
                ...styles.navButton,
                borderBottom: page === 'cart' ? `2px solid ${colors.primary}` : 'none',
              }}
            >
              {t.cart} ({cart.length})
            </button>
          </nav>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main style={styles.main}>
        {page === 'catalog' ? (
          <div>
            <h1 style={{ color: colors.primary, textAlign: 'center' }}>{t.title}</h1>

            {loading ? (
              <p style={{ textAlign: 'center' }}>{t.loading}</p>
            ) : products.length === 0 ? (
              <p style={{ textAlign: 'center' }}>{t.noProducts}</p>
            ) : (
              <div style={styles.grid}>
                {products.map(product => (
                  <div
                    key={product.id}
                    style={{
                      ...styles.productCard,
                      ':hover': { transform: 'translateY(-4px)' },
                    }}
                  >
                    <div style={styles.productImage}>📦</div>
                    <div style={styles.productInfo}>
                      <div style={styles.productName}>{product.label}</div>
                      <div style={styles.productPrice}>
                        {product.price.toLocaleString()} сом
                      </div>
                      <button
                        style={styles.button}
                        onClick={() => addToCart(product)}
                      >
                        {t.addToCart}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <h1 style={{ color: colors.primary }}>{t.cart}</h1>
            {cart.length === 0 ? (
              <p style={{ fontSize: '1.2rem', color: colors.text }}>{t.empty}</p>
            ) : (
              <div>
                <div style={{ marginBottom: '2rem' }}>
                  {cart.map(item => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '1rem',
                        borderBottom: '1px solid #ddd',
                      }}
                    >
                      <div>
                        <strong>{item.label}</strong>
                        <p>{item.price.toLocaleString()} сом × {item.cart_quantity}</p>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        style={{
                          ...styles.button,
                          backgroundColor: '#e74c3c',
                          color: 'white',
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '2rem' }}>
                  {t.total}: {total.toLocaleString()} сом
                </div>
                <button style={{ ...styles.button, padding: '1rem 3rem', fontSize: '1.2rem' }}>
                  {t.checkout}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer style={styles.footer}>
        <p>© 2026 SR Lux. {lang === 'ru' ? 'Все права защищены' : lang === 'uz' ? 'Barcha huquqlar himoyalangan' : 'All rights reserved'}</p>
      </footer>
    </div>
  )
}
