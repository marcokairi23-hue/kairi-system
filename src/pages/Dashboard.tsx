import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Dashboard() {
  const { profile } = useAuth()
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">שלום, {profile?.full_name}</h1>
      <p className="text-slate-500 mb-6">מה עושים היום?</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link to="/orders/new" className="card p-5 hover:shadow-md transition-shadow
                                          border-2 border-brand">
          <div className="text-lg font-bold text-brand">+ הזמנה חדשה</div>
          <div className="text-sm text-slate-500 mt-1">
            מילוי טופס הזמנה בשטח
          </div>
        </Link>

        <Link to="/orders" className="card p-5 hover:shadow-md transition-shadow">
          <div className="text-lg font-bold">הזמנות</div>
          <div className="text-sm text-slate-500 mt-1">
            רשימה, סטטוסים, תשלומים ומעקב
          </div>
        </Link>

        <Link to="/items" className="card p-5 hover:shadow-md transition-shadow">
          <div className="text-lg font-bold">פריטים</div>
          <div className="text-sm text-slate-500 mt-1">
            מעקב ייצור לפי פריט — גזירה, תפירה, מוכן
          </div>
        </Link>

        <Link to="/fabrics" className="card p-5 hover:shadow-md transition-shadow">
          <div className="text-lg font-bold">קטלוג בדים</div>
          <div className="text-sm text-slate-500 mt-1">
            חיפוש בדים, מחירים ותמונות
          </div>
        </Link>
      </div>
    </div>
  )
}
