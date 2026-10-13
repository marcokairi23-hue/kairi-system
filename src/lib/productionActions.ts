import { supabase } from './supabase'
import { MAX_PRODUCTION_ACTION_ITEMS } from './productionPermissions'

export interface ProductionSnapshot { id: string; production_version: number }

// Every production screen uses one transaction and the server's sole item log.
export async function advanceProductionItems(items: ProductionSnapshot[], next: string) {
  if (!items.length || items.length > MAX_PRODUCTION_ACTION_ITEMS) {
    throw new Error('ניתן לקדם עד 200 פריטים בפעולה אחת. הפעולה לא פוצלה.')
  }
  if (items.some(item => !Number.isInteger(item.production_version))) {
    throw new Error('חסרה גרסה עדכנית לפריט. יש לרענן לפני הפעולה.')
  }
  const { error } = await supabase.rpc('production_mutate_v1', {
    p_items: items.map(item => ({ id: item.id, version: item.production_version })),
    p_action: 'advance', p_next: next,
  })
  if (error) throw error
  if (typeof window!=='undefined') window.dispatchEvent(new Event('production-data-changed'))
}
