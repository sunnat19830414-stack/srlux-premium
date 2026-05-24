import axios from 'axios'
import type { Lang } from '../contexts/LocaleContext'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const lang = (localStorage.getItem('srlux_lang') as Lang) || 'ru'
  config.headers['Accept-Language'] = lang
  return config
})

export interface Category {
  id: number
  slug: string
  name_ru: string
  name_uz: string
  icon: string
}

export interface Variant {
  id: number
  name_ru: string
  name_uz: string | null
  price_modifier: number
}

export interface Product {
  id: number
  sku: string
  slug: string
  name_ru: string
  name_uz: string | null
  description_ru: string | null
  description_uz: string | null
  price_uzs: number
  stock: number
  weight: number | null
  image_url: string | null
  category: Category | null
  variants: Variant[]
}

export interface ProductList {
  total: number
  page: number
  limit: number
  products: Product[]
}

export interface OrderItemIn {
  product_id: number
  variant_id?: number
  quantity: number
}

export interface OrderIn {
  customer_name: string
  customer_phone: string
  customer_address?: string
  items: OrderItemIn[]
}

export const fetchProducts = (params: {
  page?: number
  limit?: number
  category_id?: number
}) => api.get<ProductList>('/api/products', { params })

export const fetchProduct = (slug: string) =>
  api.get<Product>(`/api/products/${slug}`)

export const fetchCategories = () =>
  api.get<Category[]>('/api/categories')

export const placeOrder = (data: OrderIn) =>
  api.post('/api/orders', data)
