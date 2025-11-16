import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { StorefrontRoot } from './StorefrontRoot';
import { ProductPage } from './pages/ProductPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';

export function AppRouter() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<StorefrontRoot />} />
        <Route path="/product/:productId" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
      </Routes>
    </Router>
  );
}