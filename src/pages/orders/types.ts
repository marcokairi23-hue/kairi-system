export type ItemFamily = 'curtain' | 'shading'
export type ShadingSubtype = 'zebra' | 'venetian' | 'roman' | 'roller'
export type ItemStatus = 'new' | 'cut' | 'sewing' | 'ready' | 'installed' | 'cancelled'

export interface CurtainItem {
  id: string
  family: 'curtain'
  location: string
  width_cm: string
  heights_cm: string        // מופרד בפסיקים: "306,306,307"
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
  family: 'shading'
  subtype: ShadingSubtype
  location: string
  width_cm: string
  heights_cm: string
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
  notes: string
}

export const SEWING_TYPES = ['שטוח הפוך', 'קפלים', 'טאבים', 'שרוול', 'אחר']
export const SHADING_SUBTYPES: { value: ShadingSubtype; label: string }[] = [
  { value: 'zebra', label: 'זברה' },
  { value: 'venetian', label: 'ונציאני' },
  { value: 'roman', label: 'רומי' },
  { value: 'roller', label: 'גלילה' },
]
export const MOUNT_TYPES = ['תקרה', 'רגלי קיר']
export const MECHANISM_SIDES = ['ימין', 'שמאל', 'שני צדדים']
export const PAYMENT_METHODS = ['מזומן', 'אשראי', 'העברה בנקאית', 'ביט', "צ'ק"]
export const ITEM_STATUSES: { value: ItemStatus; label: string }[] = [
  { value: 'new', label: 'חדש' },
  { value: 'cut', label: 'נגזר' },
  { value: 'sewing', label: 'בתפירה' },
  { value: 'ready', label: 'מוכן' },
  { value: 'installed', label: 'הותקן' },
  { value: 'cancelled', label: 'מבוטל' },
]

export function newCurtainItem(): CurtainItem {
  return {
    id: crypto.randomUUID(),
    family: 'curtain',
    location: '',
    width_cm: '',
    heights_cm: '',
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
    id: crypto.randomUUID(),
    family: 'shading',
    subtype: 'zebra',
    location: '',
    width_cm: '',
    heights_cm: '',
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

// סה"כ רוחב (מטר קיר) — סכום רוחבי הפריטים לביצוע
export function calcTotalWidth(form: OrderForm): number {
  const curtains = form.curtain_items
    .filter(i => i.for_execution)
    .reduce((s, i) => s + (parseFloat(i.width_cm) || 0), 0)
  const shadings = form.shading_items
    .filter(i => i.for_execution)
    .reduce((s, i) => s + (parseFloat(i.width_cm) || 0), 0)
  return (curtains + shadings) / 100
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
