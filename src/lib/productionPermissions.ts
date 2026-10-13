import { Profile, UserRole } from '../types'
import { ACTIVE_ORDER_STATUSES, getItemRoute, nextItemStatus } from './statusHelpers'

export interface ProductionItem {
  id: string
  order_id: string
  family: string
  assigned_worker?: string | null // Legacy data only; never an authorization input.
  item_status: string
  for_execution: boolean
  issue_kind?: string | null
  production_version: number
  orders?: { status: string; payment_approved?: boolean | null }
}

export const MAX_PRODUCTION_ACTION_ITEMS = 200

// The user confirmed that the cutter's existing role is OFFICE; SALES fills
// the order form. cutter remains a route name, not a new user role.
export function productionTaskRole(family: string): UserRole | null {
  return ['curtain', 'shading'].includes(family) ? 'office' : null
}

// Order visibility comes from RLS; never infer visibility from assignment.
export function productionNext(item: ProductionItem, profile: Profile | null): string | null {
  if (!profile?.is_active || profile.role === 'viewer' ||
      !ACTIVE_ORDER_STATUSES.includes(item.orders?.status ?? '') ||
      item.orders?.payment_approved !== true || !item.for_execution) return null
  const next = nextItemStatus(getItemRoute(item.family), item.item_status)
  if (!next || (next === 'done' && item.issue_kind)) return null
  if (profile.role === 'admin') return next
  if (item.family === 'shading' && next === 'ready') return next
  if (item.family === 'shading' && next === 'preparation') return profile.role === 'office' ? next : null
  return productionTaskRole(item.family) === profile.role ? next : null
}

export function canPrintProduction(profile: Profile | null): boolean {
  // Caller supplies RLS-visible items. Printing never grants mutation permission.
  return !!profile?.is_active
}

export function defaultWorkPrint(item: Pick<ProductionItem, 'family' | 'for_execution' | 'item_status'> & { orders?: { status?: string; payment_approved?: boolean | null } }, profile: Profile | null): boolean {
  return canPrintProduction(profile) && profile?.role === productionTaskRole(item.family) &&
    item.family === 'curtain' && item.for_execution && item.item_status === 'new' &&
    ACTIVE_ORDER_STATUSES.includes(item.orders?.status ?? '') && item.orders?.payment_approved === true
}

export function productionSelection<T extends ProductionItem>(items: T[], profile: Profile | null): T[] {
  return items.filter(item => productionNext(item, profile) !== null)
}

export function nextProductionSelection(previous: Set<string>, ids: string[]): Set<string> | null {
  const next = new Set(previous)
  const remove = ids.every(id => next.has(id))
  ids.forEach(id => remove ? next.delete(id) : next.add(id))
  return next.size <= MAX_PRODUCTION_ACTION_ITEMS ? next : null
}

// Filters select whole orders. Every visible sibling remains in the result.
export function filterProductionOrders<T extends ProductionItem & {
  location: string; fabric_text: string | null; color_fabric_text: string | null
  orders?: { status: string; customer_name_snapshot: string; order_number: number | null }
}>(items: T[], route: string, statuses: string[], search: string): T[] {
  const q = search.trim().toLowerCase()
  const orderIds = new Set(items.filter(item => {
    if (route !== 'all' && getItemRoute(item.family) !== route) return false
    if (statuses.length && !statuses.includes(item.item_status)) return false
    return !q || [item.location, item.fabric_text, item.color_fabric_text,
      item.orders?.customer_name_snapshot, String(item.orders?.order_number ?? '')]
      .some(value => value?.toLowerCase().includes(q))
  }).map(item => item.order_id))
  return items.filter(item => orderIds.has(item.order_id))
}
