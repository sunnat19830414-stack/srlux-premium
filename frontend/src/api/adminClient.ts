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
