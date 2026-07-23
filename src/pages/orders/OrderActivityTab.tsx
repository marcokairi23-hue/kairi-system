import { useEffect, useState } from 'react'
import { ActivityRow, ActivityRowLine, fetchActivity } from '../activity/ActivityLog'

export default function OrderActivityTab({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchActivity({ orderId, ascending: true }).then(data => {
      setRows(data)
      setLoading(false)
    })
  }, [orderId])

  if (loading) return <p className="text-slate-400 text-sm">טוען…</p>
  if (rows.length === 0) return <p className="text-slate-400 text-sm">אין פעילות</p>

  return (
    <div className="card p-3">
      {rows.map(row => <ActivityRowLine key={`${row.source}-${row.id}`} row={row} showOrderNumber={false} />)}
    </div>
  )
}
