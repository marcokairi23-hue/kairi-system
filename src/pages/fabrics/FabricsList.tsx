import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Fabric } from '../../types'

function publicImageUrl(path: string) {
  return supabase.storage.from('fabric-images').getPublicUrl(path).data.publicUrl
}

export default function FabricsList() {
  const [fabrics, setFabrics] = useState<Fabric[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('fabrics')
      .select('*, fabric_images(*)')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError('לא הצלחנו לטעון את הקטלוג. רעננו את הדף ונסו שוב.')
        else setFabrics(data ?? [])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return fabrics
    return fabrics.filter((f) =>
      [f.name, f.sku, f.supplier, f.color, f.barcode]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [fabrics, query])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">קטלוג בדים</h1>
        <Link to="/fabrics/new" className="btn-primary">+ בד חדש</Link>
      </div>

      <input
        className="input mb-5"
        placeholder="חיפוש לפי שם, מק״ט, ספק או צבע…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading && <div className="text-slate-500">טוען בדים…</div>}
      {error && <div className="text-red-600">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="card p-8 text-center text-slate-500">
          {fabrics.length === 0
            ? 'הקטלוג ריק. הוסיפו את הבד הראשון או ייבאו מהמערכת הקיימת.'
            : 'לא נמצאו בדים שמתאימים לחיפוש.'}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((f) => {
          const img = f.fabric_images?.find((i) => i.is_primary) ?? f.fabric_images?.[0]
          return (
            <Link key={f.id} to={`/fabrics/${f.id}`}
                  className="card overflow-hidden hover:shadow-md transition-shadow">
              <div className="aspect-square bg-slate-100 grid place-items-center overflow-hidden">
                {img ? (
                  <img src={publicImageUrl(img.storage_path)} alt={f.name}
                       className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <span className="text-slate-400 text-sm">אין תמונה</span>
                )}
              </div>
              <div className="p-3">
                <div className="font-semibold truncate">{f.name}</div>
                <div className="text-xs text-slate-500 flex justify-between mt-1">
                  <span>{f.sku ?? ''}</span>
                  {f.price_per_meter != null && <span>{f.price_per_meter} ₪/מ׳</span>}
                </div>
                {!f.is_active && (
                  <div className="mt-1 text-xs text-amber-600">לא פעיל</div>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
