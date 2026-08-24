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
}

const FeatureFlagsContext = createContext<FeatureFlagsState>({
  flags: [], permissions: [], loading: true,
})

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [permissions, setPermissions] = useState<FeaturePermission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('feature_flags').select('*'),
      supabase.from('feature_permissions').select('*'),
    ]).then(([flagsRes, permsRes]) => {
      setFlags(flagsRes.data ?? [])
      setPermissions(permsRes.data ?? [])
      setLoading(false)
    })
  }, [])

  return (
    <FeatureFlagsContext.Provider value={{ flags, permissions, loading }}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}

// לוגיקת ההערכה הטהורה (ללא hooks) — כדי לא לשבור את rules-of-hooks בקריאה
// רקורסיבית על parent_key, כל ה-hooks נקראים פעם אחת ב-useFeature וה-recursion
// רץ על פונקציה רגילה.
function evaluateFeature(
  key: string,
  role: string | undefined,
  flags: FeatureFlag[],
  permissions: FeaturePermission[],
): boolean {
  const flag = flags.find(f => f.key === key)
  if (!flag) return true // fail-open: פיצ'ר לא מוגדר

  if (flag.enabled_global === false) return false // גלובלי גובר על הכל

  let allowedForRole = true
  if (flag.is_locked) {
    allowedForRole = true // מסך מערכת תמיד גלוי
  } else {
    const perm = permissions.find(p => p.feature_key === key && p.role === role)
    allowedForRole = perm ? perm.allowed : true // fail-open: הרשאה לא מוגדרת
  }

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
