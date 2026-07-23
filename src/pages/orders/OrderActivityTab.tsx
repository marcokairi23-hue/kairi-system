import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ActivityRow, ActivityRowLine } from '../activity/ActivityLog'

export default function OrderActivityTab({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('order_status_history')
      .select('*, profiles(full_name), orders(order_number), order_items(location)')
      .eq('order_id', orderId)
      .order('changed_at', { ascending: true })
      .then(({ data }) => {
        setRows((data ?? []) as unknown as ActivityRow[])
        setLoading(false)
      })
  }, [orderId])

  if (loading) return <p className="text-slate-400 text-sm">טוען…</p>
  if (rows.length === 0) return <p className="text-slate-400 text-sm">אין פעילות</p>

  return (
    <div className="card p-3">
      {rows.map(row => <ActivityRowLine key={row.id} row={row} showOrderNumber={false} />)}
    </div>
  )
}
