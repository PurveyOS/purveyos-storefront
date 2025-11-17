import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { StorefrontRoot } from './StorefrontRoot'
import { ProductPage } from './pages/ProductPage'
import { CartPage } from './pages/CartPage'
import { CheckoutPage } from './pages/CheckoutPage'
import './App.css'
import { useEffect } from 'react'
import { trackPageView } from './utils/analytics'

function RouteAnalytics() {
  const location = useLocation()
  useEffect(() => {
    trackPageView(location.pathname)
  }, [location])
  return null
}

function App() {
  return (
    <Router>
      <RouteAnalytics />
      <Routes>
        <Route path="/" element={<StorefrontRoot />} />
        <Route path="/product/:productId" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
      </Routes>
    </Router>
  )
}

export default App

