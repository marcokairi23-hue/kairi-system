import { ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { useFeature } from './lib/featureFlags'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import FabricsList from './pages/fabrics/FabricsList'
import FabricForm from './pages/fabrics/FabricForm'
import OrdersList from './pages/orders/OrdersList'
import NewOrder from './pages/orders/NewOrder'
import OrderDetail from './pages/orders/OrderDetail'
import EditOrder from './pages/orders/EditOrder'
import ItemsList from './pages/items/ItemsList'
import ProductionBoard from './pages/items/ProductionBoard'
import ActivityLog from './pages/activity/ActivityLog'
import UsersList from './pages/users/UsersList'
import SettingsPage from './pages/settings/SettingsPage'

// שומר route: מרנדר את children רק אם useFeature(featureKey) === true,
// אחרת מפנה ל-"/". "/" (dashboard) עצמו לא עטוף בשומר הזה כדי לא ליצור
// redirect-loop אם dashboard אי-פעם יכובה.
function FeatureRoute({ featureKey, children }: { featureKey: string; children: ReactNode }) {
  const allowed = useFeature(featureKey)
  return allowed ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-500">
        טוען את המערכת…
      </div>
    )
  }

  if (!session) return <Login />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/fabrics" element={<FeatureRoute featureKey="fabrics"><FabricsList /></FeatureRoute>} />
        <Route path="/fabrics/new" element={<FeatureRoute featureKey="fabrics"><FabricForm /></FeatureRoute>} />
        <Route path="/fabrics/:id" element={<FeatureRoute featureKey="fabrics"><FabricForm /></FeatureRoute>} />
        <Route path="/orders" element={<FeatureRoute featureKey="orders"><OrdersList /></FeatureRoute>} />
        <Route path="/orders/new" element={<FeatureRoute featureKey="newOrder"><NewOrder /></FeatureRoute>} />
        <Route path="/orders/:id" element={<FeatureRoute featureKey="orderDetail"><OrderDetail /></FeatureRoute>} />
        <Route path="/orders/:id/edit" element={<FeatureRoute featureKey="orderDetail"><EditOrder /></FeatureRoute>} />
        <Route path="/items" element={<FeatureRoute featureKey="items"><ItemsList /></FeatureRoute>} />
        <Route path="/production" element={<FeatureRoute featureKey="production"><ProductionBoard /></FeatureRoute>} />
        <Route path="/activity" element={<FeatureRoute featureKey="activityLog"><ActivityLog /></FeatureRoute>} />
        <Route path="/users" element={<FeatureRoute featureKey="users"><UsersList /></FeatureRoute>} />
        <Route path="/settings" element={<FeatureRoute featureKey="settings"><SettingsPage /></FeatureRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
