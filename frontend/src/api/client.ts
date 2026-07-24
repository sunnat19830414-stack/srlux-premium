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
  sort_order: number
  parent_id: number | null
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
  custom_ral_note?: string
}

export interface OrderIn {
  customer_name: string
  customer_phone: string
  customer_address?: string
  items: OrderItemIn[]
  project_file_url?: string
  project_file_name?: string
}

export interface UploadedFile {
  url: string
  filename: string
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

// Project drawing (PDF/DWG/DXF) attached at checkout — longer timeout since
// files can run up to 25 MB on a 4G connection.
export const uploadOrderFile = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post<UploadedFile>('/api/orders/upload-file', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  })
}

// ── Model catalog (Variant 1) ──────────────────────────────────────────────────

export interface ModelVariant {
  id: number
  sku: string
  slug: string
  name_ru: string
  color: string | null
  sections: number | null
  height_mm: number | null
  columns_count: number | null
  connection_type: string | null
  category_id: number | null
  power_w_dt50: number | null
  power_w_dt64_5: number | null
  power_w_fcu45: number | null
  power_w_fcu60: number | null
  power_w_electric: number | null
  price_uzs: number
  stock: number
  image_url: string | null
  images: string[]
  description_ru: string | null
  weight: number | null
}

export interface ModelCard {
  code: string
  name_ru: string
  name_uz: string | null
  category_name: string | null
  category_name_uz: string | null
  category_id: number | null
  category_ids: number[]
  image_url: string | null
  category_images: Record<string, string>
  colors: string[]
  price_from: number
  price_to: number
  total_stock: number
}

export interface ModelList {
  total: number
  models: ModelCard[]
}

export interface ModelDetail {
  code: string
  name_ru: string
  name_uz: string | null
  description_ru: string | null
  description_uz: string | null
  category_name: string | null
  category_name_uz: string | null
  color_images: Record<string, string | null>
  colors: string[]
  sections_available: number[]
  height_mm_available: number[]
  connection_types_available: string[]
  variants: ModelVariant[]
}

export const fetchModels = () => api.get<ModelList>('/api/models')
export const fetchModel = (code: string) => api.get<ModelDetail>(`/api/models/${code}`)

export interface RelatedModels {
  similar: ModelCard[]
  complementary: ModelCard[]
}

export const fetchRelatedModels = (code: string) => api.get<RelatedModels>(`/api/models/${code}/related`)
