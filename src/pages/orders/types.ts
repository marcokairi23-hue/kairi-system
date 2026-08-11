import { uid } from '../../lib/uid'

export type ItemFamily = 'curtain' | 'shading'
// טקסט חופשי (לא enum) — ניתן לעריכה מעמוד ההגדרות, ראו migration 0011.
export type ShadingSubtype = string
export type ItemStatus = 'new' | 'cut' | 'sewing' | 'ready' | 'installed' | 'cancelled'

export interface CurtainItem {
  id: string
  db_id?: string          // id אמיתי ב-order_items (undefined = פריט חדש שטרם נשמר)
  family: 'curtain'
  location: string
  width_m: string
  heights_m: string        // מופרד בפסיקים: "3.06,3.06,3.07"
  sewing_type: string
  hem_cm: string
  shtaif_cm: string
  is_split: boolean
  fabric_text: string
  price: string
  for_execution: boolean
  item_status: ItemStatus
  notes: string
}

export interface ShadingItem {
  id: string
  db_id?: string          // id אמיתי ב-order_items (undefined = פריט חדש שטרם נשמר)
  family: 'shading'
  subtype: ShadingSubtype
  location: string
  width_m: string
  heights_m: string
  mount_type: string        // רגלי קיר / תקרה
  mechanism_side: string    // ימין / שמאל
  color_fabric_text: string
  price: string
  for_execution: boolean
  item_status: ItemStatus
  notes: string
}

export type OrderItem = CurtainItem | ShadingItem

export interface OrderAccessory {
  id: string
  name: string
  quantity: string
  unit_price: string
}

export interface OrderForm {
  // פרטי לקוח
  customer_name: string
  phone: string
  address: string
  agent_name: string
  // פריטים
  curtain_items: CurtainItem[]
  shading_items: ShadingItem[]
  accessories: OrderAccessory[]
  // תשלום
  is_quote: boolean
  installation_fee: string
  discount: string
  final_total: string
  paid_on_account: string
  payment_method: string
  send_email: string
  signature_name: string
  signatureDataUrl?: string | null
  agentSignatureDataUrl?: string | null
  notes: string
}

export const SEWING_TYPES = ['שטוח הפוך', 'קפלים', 'טאבים', 'שרוול', 'אחר']
// ברירת מחדל בלבד — הרשימה בפועל נטענת מ-settings.shading_subtypes (ניתנת לעריכה בהגדרות)
export const SHADING_SUBTYPES = ['זברה', 'ונציאני', 'רומי', 'גלילה']
export const MOUNT_TYPES = ['תקרה', 'רגלי קיר']
export const MECHANISM_SIDES = ['ימין', 'שמאל', 'שני צדדים']
export const PAYMENT_METHODS = ['מזומן', 'אשראי', 'העברה בנקאית', 'ביט', "צ'ק"]
export const ITEM_STATUSES: { value: ItemStatus; label: string }[] = [
  { value: 'new', label: 'חדש' },
  { value: 'cut', label: 'נגזר' },
  { value: 'sewing', label: 'במתפרה' },
  { value: 'ready', label: 'מוכן' },
  { value: 'installed', label: 'הותקן' },
  { value: 'cancelled', label: 'מבוטל' },
]

export function newCurtainItem(): CurtainItem {
  return {
    id: uid(),
    family: 'curtain',
    location: '',
    width_m: '',
    heights_m: '',
    sewing_type: 'שטוח הפוך',
    hem_cm: '10',
    shtaif_cm: '10',
    is_split: false,
    fabric_text: '',
    price: '',
    for_execution: true,
    item_status: 'new',
    notes: '',
  }
}

export function newShadingItem(): ShadingItem {
  return {
    id: uid(),
    family: 'shading',
    subtype: 'זברה',
    location: '',
    width_m: '',
    heights_m: '',
    mount_type: 'תקרה',
    mechanism_side: 'ימין',
    color_fabric_text: '',
    price: '',
    for_execution: true,
    item_status: 'new',
    notes: '',
  }
}

export function emptyForm(agentName: string): OrderForm {
  return {
    customer_name: '',
    phone: '',
    address: '',
    agent_name: agentName,
    curtain_items: [],
    shading_items: [],
    accessories: [],
    is_quote: false,
    installation_fee: '',
    discount: '',
    final_total: '',
    paid_on_account: '',
    payment_method: '',
    send_email: '',
    signature_name: '',
    signatureDataUrl: null,
    agentSignatureDataUrl: null,
    notes: '',
  }
}

// חישוב סה"כ פריטים לביצוע
export function calcItemsTotal(form: OrderForm): number {
  const curtains = form.curtain_items
    .filter(i => i.for_execution)
    .reduce((s, i) => s + (parseFloat(i.price) || 0), 0)
  const shadings = form.shading_items
    .filter(i => i.for_execution)
    .reduce((s, i) => s + (parseFloat(i.price) || 0), 0)
  const accessories = form.accessories
    .reduce((s, a) => s + (parseFloat(a.quantity) || 0) * (parseFloat(a.unit_price) || 0), 0)
  return curtains + shadings + accessories
}

// סה"כ רוחב (מטר קיר) — סכום רוחבי הפריטים לביצוע (width_m כבר במטרים)
export function calcTotalWidth(form: OrderForm): number {
  const curtains = form.curtain_items
    .filter(i => i.for_execution)
    .reduce((s, i) => s + (parseFloat(i.width_m) || 0), 0)
  const shadings = form.shading_items
    .filter(i => i.for_execution)
    .reduce((s, i) => s + (parseFloat(i.width_m) || 0), 0)
  return curtains + shadings
}

// חישוב אוטומטי = סה"כ פריטים - הנחה
export function calcAutoTotal(form: OrderForm): number {
  return calcItemsTotal(form) - (parseFloat(form.discount) || 0)
}

// נשאר לתשלום
export function calcRemaining(form: OrderForm): number {
  const total = parseFloat(form.final_total) || 0
  const paid = parseFloat(form.paid_on_account) || 0
  return total - paid
}
