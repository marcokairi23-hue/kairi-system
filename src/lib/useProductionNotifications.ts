import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'
import { emptyNotificationFeed, fetchProductionNotifications, NOTIFICATION_REFRESH_MS, PRODUCTION_REFRESH_EVENT, ProductionTask } from './productionNotifications'

export function useProductionNotifications(open: boolean, state: 'active' | 'history', requestedCount: number) {
  const { profile } = useAuth()
  const enabled = !!profile?.is_active && ['admin','office'].includes(profile.role)
  const [feed,setFeed] = useState(emptyNotificationFeed)
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState<string | null>(null)
  const [reading,setReading] = useState<string | null>(null)
  const pullRef = useRef<(() => Promise<void>) | null>(null)
  const readLock = useRef(false)
  const identity = useRef(profile?.id)
  const access = useRef('')

  useEffect(() => {
    if (!enabled) { setFeed(emptyNotificationFeed); setError(null); setLoading(false); return }
    const key=`${profile?.id}:${profile?.role}:${profile?.is_active}`
    if (access.current!==key) { access.current=key; identity.current=profile?.id; setFeed(emptyNotificationFeed) }
    else setFeed(previous => ({ ...previous,tasks:[],has_more:false }))
    let cancelled=false, busy=false, queued=false, timer:number | undefined, controller:AbortController | undefined
    const visible = () => document.visibilityState!=='hidden'
    const pull = async (followup = false) => {
      if (cancelled || !visible()) return
      if (busy) { if (followup) queued=true; return }
      if (timer) window.clearTimeout(timer)
      busy=true; setLoading(true)
      controller=new AbortController()
      try {
        const result=await fetchProductionNotifications(open ? state : 'active',open ? requestedCount : 1,controller.signal)
        if (!cancelled) { setFeed(open ? result : { ...result,tasks:[] }); setError(null) }
      } catch (error) {
        if (!cancelled) setError('לא ניתן לעדכן את ההתראות. '+((error as { message?:string }).message ?? 'נסו לרענן.'))
      } finally {
        busy=false
        if (!cancelled) {
          setLoading(false)
          if (queued) { queued=false; void pull() }
          else if (visible()) timer=window.setTimeout(() => { void pull() },NOTIFICATION_REFRESH_MS)
        }
      }
    }
    pullRef.current=pull
    const wake = () => { if (visible()) void pull() }
    const changed = () => { if (visible()) void pull(true) }
    window.addEventListener('focus',wake)
    window.addEventListener(PRODUCTION_REFRESH_EVENT,changed)
    document.addEventListener('visibilitychange',wake)
    void pull()
    return () => {
      cancelled=true; controller?.abort(); if (timer) window.clearTimeout(timer)
      window.removeEventListener('focus',wake)
      window.removeEventListener(PRODUCTION_REFRESH_EVENT,changed)
      document.removeEventListener('visibilitychange',wake)
      if (pullRef.current===pull) pullRef.current=null
    }
  }, [enabled,profile?.id,profile?.role,profile?.is_active,open,state,requestedCount])

  const refresh = useCallback(() => { void pullRef.current?.() },[])
  const read = async (task: ProductionTask): Promise<boolean> => {
    if (task.first_read_at) return true
    if (readLock.current) return false
    const actor=profile?.id
    readLock.current=true; setReading(task.id)
    try {
      const { error }=await supabase.rpc('production_notification_read_v1',{ p_task:task.id })
      if (error) throw error
      if (actor===identity.current) { setError(null); window.dispatchEvent(new Event(PRODUCTION_REFRESH_EVENT)) }
      return actor===identity.current
    } catch (error) {
      if (actor===identity.current) setError('לא ניתן לסמן כנקראה. '+((error as { message?:string }).message ?? 'נסו שוב.'))
      return false
    } finally { readLock.current=false; setReading(null) }
  }
  return { enabled,feed,loading,error,reading,refresh,read }
}
