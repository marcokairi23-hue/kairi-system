import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function useItemDeepLink(ready: boolean) {
  const { hash }=useLocation()
  useEffect(() => {
    if (!ready || !hash.startsWith('#item-')) return
    const timer=window.setTimeout(() => {
      const item=document.getElementById(hash.slice(1))
      item?.scrollIntoView({ block:'center' })
      item?.focus({ preventScroll:true })
    },0)
    return () => window.clearTimeout(timer)
  }, [hash,ready])
}
