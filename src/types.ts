export type UserRole = 'admin' | 'office' | 'sales' | 'viewer'

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  role: UserRole
  is_active: boolean
}

export interface Fabric {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  supplier: string | null
  color: string | null
  gsm: number | null
  weight_per_meter: number | null
  roll_width_cm: number | null
  composition: string | null
  price_per_meter: number | null
  is_stock_managed: boolean
  low_stock_threshold_m: number | null
  is_active: boolean
  created_at: string
  fabric_images?: FabricImage[]
}

export interface FabricImage {
  id: string
  fabric_id: string
  storage_path: string
  is_primary: boolean
  sort_order: number
}
