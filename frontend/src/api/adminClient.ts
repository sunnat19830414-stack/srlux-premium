import axios from 'axios'

const ADMIN_KEY_KEY = 'srlux_admin_key'

export const getAdminKey = () => sessionStorage.getItem(ADMIN_KEY_KEY) || ''
export const setAdminKey = (key: string) => sessionStorage.setItem(ADMIN_KEY_KEY, key)
export const clearAdminKey = () => sessionStorage.removeItem(ADMIN_KEY_KEY)

const adminApi = axios.create({ baseURL: '', timeout: 30000 })

adminApi.interceptors.request.use((config) => {
  const key = getAdminKey()
  if (key) config.headers['X-Api-Key'] = key
  return config
})

adminApi.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      clearAdminKey()
      window.location.href = '/admin/login'
    }
    return Promise.reject(err)
  },
)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecentOrderMini {
  id: number
  order_number: string
  customer_name: string
  total_uzs: number
  status: string
  created_at: string
}

export interface LowStockProduct {
  id: number
  sku: string
  name_ru: string
  stock: number
}

export interface AdminStats {
  total_orders: number
  orders_today: number
  orders_this_week: number
  total_revenue: number
  total_products: number
  active_products: number
  total_categories: number
  pending_orders: number
  recent_orders: RecentOrderMini[]
  low_stock_products: LowStockProduct[]
}

export interface OrderStatusCounts {
  pending: number
  processing: number
  completed: number
  cancelled: number
  total: number
}

export interface AdminOrderItem {
  id: number
  product_name_snapshot: string
  quantity: number
  unit_price_snapshot: number
}

export interface AdminOrder {
  id: number
  order_number: string
  customer_name: string
  customer_phone: string
  customer_address: string | null
  total_uzs: number
  status: string
  created_at: string
  items: AdminOrderItem[]
}

export interface AdminOrderList {
  total: number
  page: number
  limit: number
  orders: AdminOrder[]
  counts: OrderStatusCounts
}

export interface AdminProduct {
  id: number
  sku: string
  name_ru: string
  price_uzs: number
  stock: number
  is_active: boolean
  is_featured: boolean
  sort_order: number
  image_url: string | null
  category_id: number | null
  parent_model: string | null
  color: string | null
}

export interface AdminProductList {
  total: number
  page: number
  limit: number
  products: AdminProduct[]
}

export type CategoryDisplayStyle = 'grid' | 'large-grid' | 'list' | 'featured'

export interface AdminCategory {
  id: number
  slug: string
  name_ru: string
  name_uz: string
  icon: string
  dolibarr_id: number | null
  product_count: number
  sort_order: number
  display_style: CategoryDisplayStyle
  is_featured: boolean
}

export interface SyncStatus {
  running: boolean
  last_run: string | null
  last_result: string | null
  last_success: boolean
}

export interface CatalogPhoto {
  id: number
  model_code: string
  image_url: string
  sort_order: number
}

export interface CatalogModel {
  code: string
  name_ru: string
  description_ru: string | null
  category_name: string | null
  category_id: number | null
  category_ids: number[]
  colors: string[]
  sections_list: number[]
  height_mm_list: number[]
  image_url: string | null
  price_usd_from: number | null
  price_usd_to: number | null
  photos: CatalogPhoto[]
}

export interface CatalogModelList {
  total: number
  models: CatalogModel[]
}

export interface CatalogSettings {
  company_name: string
  catalog_title: string
  logo_url: string | null
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const adminCheckAuth = () => adminApi.get<AdminStats>('/api/admin/stats')

export const adminGetStats = () => adminApi.get<AdminStats>('/api/admin/stats')

export const adminGetOrders = (params: { page?: number; limit?: number; status?: string; search?: string }) =>
  adminApi.get<AdminOrderList>('/api/admin/orders', { params })

export const adminGetOrder = (id: number) =>
  adminApi.get<AdminOrder>(`/api/admin/orders/${id}`)

export const adminUpdateOrderStatus = (id: number, status: string) =>
  adminApi.patch<AdminOrder>(`/api/admin/orders/${id}/status`, { status })

export const adminUploadProductImage = (id: number, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return adminApi.post<AdminProduct>(`/api/admin/products/${id}/image`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const adminGetProducts = (params: {
  page?: number; limit?: number; search?: string
  is_active?: boolean; category_id?: number
  sort_by?: string; sort_dir?: string
}) => adminApi.get<AdminProductList>('/api/admin/products', { params })

export const adminUpdateProduct = (id: number, data: Partial<AdminProduct>) =>
  adminApi.patch<AdminProduct>(`/api/admin/products/${id}`, data)

export const adminGetCategories = () =>
  adminApi.get<AdminCategory[]>('/api/admin/categories-list')

export const adminCreateCategory = (data: {
  name_ru: string; name_uz: string; icon: string
  display_style: CategoryDisplayStyle; is_featured: boolean; sort_order: number
}) => adminApi.post<AdminCategory>('/api/admin/categories-list', data)

export const adminUpdateCategory = (id: number, data: Partial<AdminCategory>) =>
  adminApi.patch<AdminCategory>(`/api/admin/categories-list/${id}`, data)

export const adminDeleteCategory = (id: number) =>
  adminApi.delete(`/api/admin/categories-list/${id}`)

export const adminGetSyncStatus = () =>
  adminApi.get<SyncStatus>('/api/admin/sync/status')

export const adminTriggerSync = () =>
  adminApi.post<SyncStatus>('/api/admin/sync/trigger')

// ── Catalog PDF generator ────────────────────────────────────────────────────

export const adminListCatalogModels = (categoryId?: number | null) =>
  adminApi.get<CatalogModelList>('/api/admin/catalog/models', {
    params: categoryId != null ? { category_id: categoryId } : undefined,
  })

export const adminUploadCatalogPhoto = (modelCode: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return adminApi.post<CatalogPhoto>(`/api/admin/catalog/photos/${encodeURIComponent(modelCode)}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const adminSetCatalogPhotoPrimary = (photoId: number) =>
  adminApi.patch<CatalogPhoto>(`/api/admin/catalog/photos/${photoId}/primary`)

export const adminDeleteCatalogPhoto = (photoId: number) =>
  adminApi.delete(`/api/admin/catalog/photos/${photoId}`)

export const adminGetCatalogSettings = () =>
  adminApi.get<CatalogSettings>('/api/admin/catalog/settings')

export const adminUpdateCatalogSettings = (data: { company_name?: string; catalog_title?: string }) =>
  adminApi.patch<CatalogSettings>('/api/admin/catalog/settings', data)

export const adminUploadCatalogLogo = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return adminApi.post<CatalogSettings>('/api/admin/catalog/logo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const adminGenerateCatalog = (categoryId: number | null, cardsPerRow: number = 2) =>
  adminApi.post(
    '/api/admin/catalog/generate',
    { category_id: categoryId, cards_per_row: cardsPerRow },
    { responseType: 'blob' },
  )

// ── Currency display rate ────────────────────────────────────────────────────
// GET is the public /api/currencies/{code} endpoint (see api/client.ts's
// fetchCurrencyRate) — same admin session, no need for a second read path.

export const adminUpdateCurrencyRate = (code: string, rateToUzs: number) =>
  adminApi.patch<{ code: string; rate_to_uzs: number }>(`/api/admin/currencies/${code}`, { rate_to_uzs: rateToUzs })
