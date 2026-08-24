import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

export interface FeatureFlag {
  key: string
  label: string
  type: 'screen' | 'component'
  parent_key: string | null
  enabled_global: boolean
  in_navbar: boolean
  is_locked: boolean
  sort_order: number | null
}

export interface FeaturePermission {
  feature_key: string
  role: string
  allowed: boolean
}

interface FeatureFlagsState {
  flags: FeatureFlag[]
  permissions: FeaturePermission[]
  loading: boolean
  refresh: () => Promise<void>
  // עדכון אופטימיסטי: משנה את ה-state המשותף (navbar/routes/מסך הניהול קוראים
  // ממנו) מיד, כותב ל-DB ברקע, ומחזיר את ה-state הקודם אם הכתיבה נכשלה.
  // מחזיר true בהצלחה / false בכישלון, כדי שהקורא יציג הודעת שגיאה.
  setFlagEnabled: (key: string, enabled_global: boolean) => Promise<boolean>
  setPermissionAllowed: (featureKey: string, role: string, allowed: boolean) => Promise<boolean>
}

const noop = async () => {}
const FeatureFlagsContext = createContext<FeatureFlagsState>({
  flags: [], permissions: [], loading: true,
  refresh: noop,
  setFlagEnabled: async () => false,
  setPermissionAllowed: async () => false,
})

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [permissions, setPermissions] = useState<FeaturePermission[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = async () => {
    const [flagsRes, permsRes] = await Promise.all([
      supabase.from('feature_flags').select('*'),
      supabase.from('feature_permissions').select('*'),
    ])
    setFlags(flagsRes.data ?? [])
    setPermissions(permsRes.data ?? [])
  }

  useEffect(() => {
    fetchAll().then(() => setLoading(false))
  }, [])

  const refresh = async () => { await fetchAll() }

  const setFlagEnabled = async (key: string, enabled_global: boolean) => {
    let prev: FeatureFlag[] = []
    setFlags(fs => { prev = fs; return fs.map(f => f.key === key ? { ...f, enabled_global } : f) })
    const { error } = await supabase.from('feature_flags').update({ enabled_global }).eq('key', key)
    if (error) { setFlags(prev); return false }
    return true
  }

  const setPermissionAllowed = async (featureKey: string, role: string, allowed: boolean) => {
    let prev: FeaturePermission[] = []
    setPermissions(ps => {
      prev = ps
      return ps.map(p => (p.feature_key === featureKey && p.role === role) ? { ...p, allowed } : p)
    })
    const { error } = await supabase.from('feature_permissions')
      .update({ allowed }).eq('feature_key', featureKey).eq('role', role)
    if (error) { setPermissions(prev); return false }
    return true
  }

  return (
    <FeatureFlagsContext.Provider value={{ flags, permissions, loading, refresh, setFlagEnabled, setPermissionAllowed }}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}

// חשיפת ה-state המלא + פעולות הכתיבה למסכי ניהול (ScreenManager).
export function useFeatureFlagsAdmin() {
  return useContext(FeatureFlagsContext)
}

// לוגיקת ההערכה הטהורה (ללא hooks) — כדי לא לשבור את rules-of-hooks בקריאה
// רקורסיבית על parent_key, כל ה-hooks נקראים פעם אחת ב-useFeature וה-recursion
// רץ על פונקציה רגילה.
export function evaluateFeature(
  key: string,
  role: string | undefined,
  flags: FeatureFlag[],
  permissions: FeaturePermission[],
): boolean {
  const flag = flags.find(f => f.key === key)
  if (!flag) return true // fail-open: פיצ'ר לא מוגדר

  if (flag.enabled_global === false) return false // גלובלי גובר על הכל

  // תוקן בספרינט C: is_locked לא עוקף את בדיקת ה-role (זה היה מאפשר לכל role
  // לראות מסך נעול, בניגוד לכוונה ולטבלת ההרשאות בפועל — screenManager
  // היה נגיש דרך URL ישיר לכל משתמש מחובר). is_locked ממשיך למנוע כיבוי
  // גלובלי (UI בלבד — ה-DB שומר enabled_global=true) אבל לא משפיע כאן.
  const perm = permissions.find(p => p.feature_key === key && p.role === role)
  const allowedForRole = perm ? perm.allowed : true // fail-open: הרשאה לא מוגדרת

  if (!allowedForRole) return false

  if (flag.parent_key) return evaluateFeature(flag.parent_key, role, flags, permissions)

  return allowedForRole
}

// useFeature: fail-open בכל מקום שאין נתון חד-משמעי לחסימה — דגל/הרשאה חסרים -> מציג.
export function useFeature(key: string): boolean {
  const { flags, permissions } = useContext(FeatureFlagsContext)
  const { profile } = useAuth()

  return evaluateFeature(key, profile?.role, flags, permissions)
}
