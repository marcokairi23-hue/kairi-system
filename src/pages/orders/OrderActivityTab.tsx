import { useEffect, useState } from 'react'
import { ActivityRow, ActivityRowLine, dayLabel, fetchActivity } from '../activity/ActivityLog'

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

  const grouped = rows.reduce<Record<string, ActivityRow[]>>((acc, row) => {
    const key = dayLabel(row.changed_at)
    acc[key] = acc[key] ?? []
    acc[key].push(row)
    return acc
  }, {})

  return (
    <>
      {Object.entries(grouped).map(([day, dayRows]) => (
        <div key={day} className="card p-3 mb-3">
          <div className="text-xs text-slate-500 font-medium mb-1">{day}</div>
          {dayRows.map(row => <ActivityRowLine key={`${row.source}-${row.id}`} row={row} showOrderNumber={false} />)}
        </div>
      ))}
    </>
  )
}
