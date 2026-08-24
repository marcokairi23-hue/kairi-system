import { useState } from 'react'
import { useFeatureFlagsAdmin, evaluateFeature, FeatureFlag } from '../../lib/featureFlags'

const ROLES: { value: string; label: string }[] = [
  { value: 'admin', label: 'אדמין' },
  { value: 'office', label: 'משרד' },
  { value: 'sales', label: 'סוכן' },
  { value: 'viewer', label: 'צפייה' },
]

type SaveStatus = 'saving' | 'saved' | 'error'

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={onChange}
      className={
        'inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors shrink-0 ' +
        (disabled ? 'bg-slate-200 cursor-not-allowed' : checked ? 'bg-brand justify-end' : 'bg-slate-300 justify-start')
      }
    >
      <span className="h-5 w-5 rounded-full bg-white shadow" />
    </button>
  )
}

function RolePill({ label, allowed, locked, onClick }: { label: string; allowed: boolean; locked?: boolean; onClick: () => void }) {
  return (
    <button
      type="button" disabled={locked} onClick={onClick}
      className={
        'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ' +
        (locked
          ? 'bg-brand/10 text-brand border-brand/30 cursor-not-allowed'
          : allowed
            ? 'bg-brand text-white border-brand hover:bg-brand-dark'
            : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200')
      }
    >
      {label}
    </button>
  )
}

function StatusTag({ status }: { status?: SaveStatus }) {
  if (!status) return null
  if (status === 'saving') return <span className="text-xs text-slate-400">שומר...</span>
  if (status === 'error') return <span className="text-xs text-red-600">שגיאה בשמירה</span>
  return <span className="text-xs text-green-600">✓ נשמר</span>
}

export default function ScreenManager() {
  const { flags, permissions, loading, setFlagEnabled, setPermissionAllowed } = useFeatureFlagsAdmin()
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<Record<string, SaveStatus>>({})
  const [previewRole, setPreviewRole] = useState<string>('admin')

  const toggleOpen = (key: string) => setOpenKeys(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const flashStatus = (id: string, ok: boolean) => {
    setStatus(s => ({ ...s, [id]: ok ? 'saved' : 'error' }))
    setTimeout(() => setStatus(s => { const copy = { ...s }; delete copy[id]; return copy }), ok ? 1500 : 3000)
  }

  const handleToggleFlag = async (key: string, next: boolean) => {
    const id = `flag:${key}`
    setStatus(s => ({ ...s, [id]: 'saving' }))
    flashStatus(id, await setFlagEnabled(key, next))
  }

  const handleTogglePermission = async (featureKey: string, role: string, next: boolean) => {
    const id = `perm:${featureKey}:${role}`
    setStatus(s => ({ ...s, [id]: 'saving' }))
    flashStatus(id, await setPermissionAllowed(featureKey, role, next))
  }

  if (loading) return <div className="text-slate-500 p-4">טוען...</div>

  const screens = flags.filter(f => f.type === 'screen')
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))

  const componentsByParent: Record<string, FeatureFlag[]> = {}
  flags.filter(f => f.type === 'component').forEach(c => {
    const p = c.parent_key ?? ''
    ;(componentsByParent[p] ??= []).push(c)
  })
  Object.values(componentsByParent).forEach(arr => arr.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)))

  const allowedCount = (key: string) => permissions.filter(p => p.feature_key === key && p.allowed).length

  // בקרת המסך/קומפוננטה — סוויצ' גלובלי + pills הרשאה. משמש גם לכרטיס מסך פתוח וגם לכל קומפוננטה מוקננת תחתיו.
  const renderControls = (flag: FeatureFlag) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          {flag.type === 'screen' ? 'המסך פעיל במערכת' : 'הקומפוננטה פעילה'}
          {flag.is_locked && <span className="text-xs text-slate-400 mr-2"> (מסך מערכת — לא ניתן לכיבוי)</span>}
        </div>
        <div className="flex items-center gap-2">
          <StatusTag status={status[`flag:${flag.key}`]} />
          <Toggle
            checked={flag.enabled_global} disabled={flag.is_locked}
            onChange={() => handleToggleFlag(flag.key, !flag.enabled_global)}
          />
        </div>
      </div>

      <div className={flag.enabled_global ? '' : 'opacity-40 pointer-events-none'}>
        <div className="text-xs text-slate-500 mb-1.5">הרשאות תפקיד</div>
        <div className="flex items-center gap-2 flex-wrap">
          {ROLES.map(r => {
            const perm = permissions.find(p => p.feature_key === flag.key && p.role === r.value)
            const allowed = perm?.allowed ?? true
            const locked = flag.is_locked && r.value === 'admin'
            return (
              <RolePill
                key={r.value} label={r.label} allowed={locked ? true : allowed} locked={locked}
                onClick={() => handleTogglePermission(flag.key, r.value, !allowed)}
              />
            )
          })}
          <StatusTag status={ROLES.map(r => status[`perm:${flag.key}:${r.value}`]).find(Boolean)} />
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">ניהול מסכים</h1>
      <p className="text-sm text-slate-500 mb-4">
        הדלקה/כיבוי של מסכים וקומפוננטות והרשאות לפי תפקיד. כל שינוי נשמר מיד.
      </p>

      <div className="card p-3 mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-slate-600">תצוגה מקדימה לפי תפקיד:</span>
        {ROLES.map(r => (
          <button
            key={r.value} type="button" onClick={() => setPreviewRole(r.value)}
            className={
              'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ' +
              (previewRole === r.value
                ? 'bg-brand-dark text-white border-brand-dark'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50')
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {screens.map(screen => {
          const open = openKeys.has(screen.key)
          const children = componentsByParent[screen.key] ?? []
          const visibleToPreview = evaluateFeature(screen.key, previewRole, flags, permissions)
          return (
            <div className="card overflow-hidden" key={screen.key}>
              <button
                type="button" onClick={() => toggleOpen(screen.key)}
                className="w-full flex items-center justify-between gap-3 p-3 text-right"
              >
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="font-semibold text-sm">{screen.label}</span>
                  <span className={'text-xs px-2 py-0.5 rounded-full ' + (screen.enabled_global ? 'bg-brand/10 text-brand' : 'bg-slate-100 text-slate-400')}>
                    {screen.enabled_global ? 'פעיל' : 'כבוי'}
                  </span>
                  <span className={'text-xs ' + (visibleToPreview ? 'text-green-600' : 'text-slate-400')}>
                    {visibleToPreview ? `✓ נראה ל${ROLES.find(r => r.value === previewRole)?.label}` : `✗ לא נראה ל${ROLES.find(r => r.value === previewRole)?.label}`}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                  <span>{allowedCount(screen.key)}/4 מורשים</span>
                  <span>{open ? '▲' : '▼'}</span>
                </div>
              </button>

              {open && (
                <div className="border-t border-slate-100 p-3 space-y-4">
                  {renderControls(screen)}

                  {children.length > 0 && (
                    <div className="pr-4 border-r-2 border-slate-200 space-y-4">
                      {children.map(child => {
                        const childVisible = evaluateFeature(child.key, previewRole, flags, permissions)
                        return (
                          <div key={child.key}>
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className="font-medium text-sm">{child.label}</span>
                              <span className={'text-xs px-2 py-0.5 rounded-full ' + (child.enabled_global ? 'bg-brand/10 text-brand' : 'bg-slate-100 text-slate-400')}>
                                {child.enabled_global ? 'פעיל' : 'כבוי'}
                              </span>
                              <span className={'text-xs ' + (childVisible ? 'text-green-600' : 'text-slate-400')}>
                                {childVisible ? '✓' : '✗'}
                              </span>
                            </div>
                            {renderControls(child)}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
