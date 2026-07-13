import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
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
        <Route path="/fabrics" element={<FabricsList />} />
        <Route path="/fabrics/new" element={<FabricForm />} />
        <Route path="/fabrics/:id" element={<FabricForm />} />
        <Route path="/orders" element={<OrdersList />} />
        <Route path="/orders/new" element={<NewOrder />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/orders/:id/edit" element={<EditOrder />} />
        <Route path="/items" element={<ItemsList />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
