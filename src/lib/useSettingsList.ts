import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// קורא רשימת ערכים (string[]) מ-settings.value לפי key — משמש לרשימות בחירה
// הניתנות לעריכה מעמוד ההגדרות (סוגי תפירה, אמצעי תשלום, סוג מוצר הצללה...).
// fallback משמש רק כברירת מחדל זמנית עד שהטעינה מסתיימת / אם השורה חסרה ב-DB.
export function useSettingsList(key: string, fallback: string[] = []): string[] {
  const [values, setValues] = useState<string[]>(fallback)

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', key).maybeSingle()
      .then(({ data }) => {
        if (Array.isArray(data?.value) && data.value.length > 0) setValues(data.value)
      })
  }, [key])

  return values
}
