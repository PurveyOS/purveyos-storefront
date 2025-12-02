import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { usePersistedCart } from '../hooks/usePersistedCart';
import { useTenantFromDomain } from '../hooks/useTenantFromDomain';
import { supabase } from '../lib/supabase';

export function CheckoutSuccessPage() {
  console.log('CheckoutSuccessPage component mounted!');
  
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');
  const [countdown, setCountdown] = useState(5);
  const { cart, clearCart } = usePersistedCart();
  const { tenant } = useTenantFromDomain();
  const [orderCreated, setOrderCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if Supabase is available
  if (!supabase) {
    console.error('Supabase client not initialized');
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Configuration Error</h1>
          <p className="text-gray-700">Database connection not available. Please contact support.</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    // Create order and clear cart when payment succeeds
    async function processOrder() {
      console.log('ProcessOrder called:', { sessionId, hasTenant: !!tenant, cartItemsCount: cart.items.length, orderCreated });
      
      if (!sessionId || !tenant || !cart.items.length || orderCreated) {
        console.log('Skipping order creation - missing requirements');
        return;
      }
      
      console.log('Creating order from successful payment');
      
      try {
        // Get checkout form data from localStorage (saved during checkout)
        const checkoutDataStr = localStorage.getItem('checkout-form-data');
        const checkoutData = checkoutDataStr ? JSON.parse(checkoutDataStr) : {};
        
        // Create order
        const totalCents = Math.round(cart.total * 100);
        const orderData = {
          tenant_id: tenant.id,
          customer_email: checkoutData.customerEmail || '',
          customer_name: checkoutData.customerName || 'Customer',
          customer_phone: checkoutData.customerPhone || '',
          status: 'paid',
          total: cart.total,
          total_cents: totalCents,
          subtotal_cents: totalCents, // For now, same as total
          tax_cents: 0, // TODO: Calculate tax if applicable
          source: 'storefront',
          note: `Payment: Card (Stripe)\nDelivery: ${checkoutData.deliveryMethod || 'pickup'}\nSession: ${sessionId}`,
        };
        
        const { data: order, error: orderError } = await supabase!
          .from('orders')
          .insert(orderData)
          .select()
          .single();
        
        if (orderError) {
          console.error('Failed to create order:', orderError);
          return;
        }
        
        console.log('Order created:', order.id);
        
        // Create order lines from cart
        const orderLines = cart.items.map(item => ({
          order_id: order.id,
          tenant_id: tenant.id,
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.unitPriceCents ? item.unitPriceCents / 100 : 0,
        }));
        
        const { error: linesError } = await supabase!
          .from('order_lines')
          .insert(orderLines);
        
        if (linesError) {
          console.error('Failed to create order lines:', linesError);
        } else {
          console.log('Order lines created:', orderLines.length);
        }
        
        // Clear cart and checkout data
        clearCart();
        localStorage.removeItem('checkout-form-data');
        setOrderCreated(true);
        
      } catch (err) {
        console.error('Error creating order:', err);
        setError(err instanceof Error ? err.message : 'Failed to create order');
      }
    }
    
    processOrder().catch(err => {
      console.error('ProcessOrder promise rejected:', err);
      setError(err instanceof Error ? err.message : 'Failed to process order');
    });
  }, [sessionId, tenant, cart.items.length, orderCreated]);

  useEffect(() => {
    // Redirect to customer portal after 5 seconds
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/customer/portal');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  console.log('CheckoutSuccessPage rendering:', { sessionId, hasTenant: !!tenant, cartItemsCount: cart.items.length, error });

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}
        
        <div className="mb-6">
          <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Payment Successful!
        </h1>
        
        <p className="text-lg text-gray-600 mb-2">
          Thank you for your order.
        </p>
        
        <p className="text-sm text-gray-500 mb-8">
          You'll receive a confirmation email shortly.
        </p>

        {sessionId && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-xs text-gray-500 mb-1">Session ID</p>
            <p className="text-xs font-mono text-gray-700 break-all">{sessionId}</p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => navigate('/customer/portal')}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            View My Orders
          </button>
          
          <button
            onClick={() => navigate('/')}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Back to Store
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          Redirecting to your orders in {countdown} seconds...
        </p>
      </div>
    </div>
  );
}
