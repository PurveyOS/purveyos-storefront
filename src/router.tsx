import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { StorefrontRoot } from './StorefrontRoot';
import { ProductPage } from './pages/ProductPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { CheckoutSuccessPage } from './pages/CheckoutSuccessPage';
import { CheckoutCancelPage } from './pages/CheckoutCancelPage';
import { TestPage } from './pages/TestPage';
import { CustomerLogin } from './pages/CustomerLogin';
import { CustomerPortal } from './pages/CustomerPortal';
import { SubscriptionManagement } from './pages/SubscriptionManagement';

export function AppRouter() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<StorefrontRoot />} />
        <Route path="/product/:productId" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
        <Route path="/checkout/test" element={<TestPage />} />
        <Route path="/checkout/cancel" element={<CheckoutCancelPage />} />
        <Route path="/login" element={<CustomerLogin />} />
        <Route path="/account" element={<CustomerPortal />} />
        <Route path="/customer/portal" element={<CustomerPortal />} />
        <Route path="/subscription/:id" element={<SubscriptionManagement />} />
      </Routes>
    </Router>
  );
}