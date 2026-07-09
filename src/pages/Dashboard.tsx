import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Dashboard() {
  const { profile } = useAuth()
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">שלום, {profile?.full_name}</h1>
      <p className="text-slate-500 mb-6">מה עושים היום?</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link to="/fabrics" className="card p-5 hover:shadow-md transition-shadow">
          <div className="text-lg font-bold text-brand">קטלוג בדים</div>
          <div className="text-sm text-slate-500 mt-1">
            חיפוש בדים, מחירים, תמונות ומלאי
          </div>
        </Link>
        <div className="card p-5 opacity-60">
          <div className="text-lg font-bold">הזמנות</div>
          <div className="text-sm text-slate-500 mt-1">בבנייה — שלב 4 בתוכנית</div>
        </div>
        <div className="card p-5 opacity-60">
          <div className="text-lg font-bold">לידים</div>
          <div className="text-sm text-slate-500 mt-1">בבנייה — שלב 3 בתוכנית</div>
        </div>
        <div className="card p-5 opacity-60">
          <div className="text-lg font-bold">מלאי</div>
          <div className="text-sm text-slate-500 mt-1">קליטת גלילים ושקילה — בקרוב</div>
        </div>
      </div>
    </div>
  )
}
