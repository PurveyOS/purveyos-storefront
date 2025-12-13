import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, Package, Calendar, CreditCard, Settings, LogOut, ShoppingCart } from 'lucide-react';
import { RecurringOrderModal, type RecurringOrderSettings } from '../components/RecurringOrderModal';

interface Subscription {
  id: string;
  status: 'active' | 'paused' | 'cancelled' | 'completed';
  next_delivery_date: string;
  price_per_interval: number;
  interval_type: string;
  interval_count: number;
  deliveries_fulfilled: number;
  paused_until: string | null;
  pickup_location: string | null;
  delivery_notes: string | null;
  subscription_product: {
    name: string;
    description: string;
  };
}

interface OrderLine {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
}

interface Order {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  source: string;
  order_lines?: OrderLine[];
  note?: string;
  is_recurring?: boolean;
  recurrence_frequency?: number;
  recurrence_interval?: 'week' | 'month';
  recurrence_duration?: number;
}

export function CustomerPortal() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'orders' | 'settings'>('subscriptions');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [makingRecurring, setMakingRecurring] = useState<string | null>(null);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showManageRecurringModal, setShowManageRecurringModal] = useState(false);
  const [managingOrder, setManagingOrder] = useState<Order | null>(null);

  useEffect(() => {
    checkAuth();
    checkPasswordRecovery();
  }, []);

  const checkPasswordRecovery = async () => {
    // Check if this is a password recovery redirect
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');
    
    if (type === 'recovery') {
      setIsResettingPassword(true);
    }
  };

  const checkAuth = async () => {
    try {
      console.log('🔐 Checking auth state...');
      const { data: { user } } = await supabase.auth.getUser();
      console.log('👤 User:', user ? user.email : 'No user found');
      
      if (!user) {
        console.log('❌ No user found, redirecting to login');
        navigate('/login');
        return;
      }

      // Check if profile is complete
      const { data: profile } = await supabase
        .from('customer_profiles')
        .select('tenant_id, phone')
        .eq('id', user.id)
        .single();

      console.log('📋 Profile data:', profile);

      // Redirect to setup if profile incomplete (missing tenant_id - phone is optional for now)
      if (!profile?.tenant_id) {
        console.log('⚠️ Profile incomplete, redirecting to setup');
        navigate('/account/setup');
        return;
      }

      console.log('✅ Auth check passed, loading data');
      setUser(user);
      await Promise.all([loadSubscriptions(), loadOrders()]);
    } catch (error) {
      console.error('Auth check failed:', error);
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  const loadSubscriptions = async () => {
    try {
      const { data, error } = await supabase
        .from('customer_subscriptions')
        .select(`
          *,
          subscription_product:subscription_products(name, description)
        `)
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubscriptions(data || []);
    } catch (error) {
      console.error('Failed to load subscriptions:', error);
    }
  };

  const loadOrders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        console.log('No user ID found');
        return;
      }

      console.log('🔍 Loading orders for user:', user.id, user.email);

      // First try loading by user_id (primary key)
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, 
          status, 
          total_cents, 
          created_at, 
          source,
          note,
          is_subscription_order,
          is_recurring,
          recurrence_frequency,
          recurrence_interval,
          recurrence_duration,
          user_id,
          customer_email,
          order_lines(
            id,
            product_id,
            product_name,
            quantity,
            unit_price_cents,
            line_total_cents
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('❌ Query error:', error);
        throw error;
      }
      
      console.log('✅ Orders loaded successfully:', data?.length || 0, 'orders');
      console.log('📦 Order details:', data);
      setOrders(data || []);
    } catch (error) {
      console.error('❌ Failed to load orders:', error);
    }
  };

  const makeRecurringOrder = async (order: Order, settings: RecurringOrderSettings) => {
    if (!user) return;
    
    setMakingRecurring(order.id);
    setShowRecurringModal(false);
    
    try {
      // Call the edge function to securely create the recurring order
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-recurring-order`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderId: order.id,
            frequency: settings.frequency,
            interval: settings.interval,
            duration: settings.duration,
          }),
        }
      );

      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create recurring order');
      }

      alert('✅ Order converted to recurring subscription! A new order has been created and sent to POS.');
      await Promise.all([loadSubscriptions(), loadOrders()]);
    } catch (error: any) {
      console.error('Failed to create recurring order:', error);
      alert(error.message || 'Failed to create recurring order. Please try again.');
    } finally {
      setMakingRecurring(null);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match');
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      setResetSuccess(true);
      setTimeout(() => {
        setIsResettingPassword(false);
        setResetSuccess(false);
        setNewPassword('');
        setConfirmPassword('');
        // Clear hash from URL
        window.history.replaceState(null, '', window.location.pathname);
      }, 2000);
    } catch (err: any) {
      setResetError(err.message || 'Failed to update password');
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      paused: 'bg-yellow-100 text-yellow-800',
      cancelled: 'bg-red-100 text-red-800',
      completed: 'bg-blue-100 text-blue-800',
      pending: 'bg-yellow-100 text-yellow-800',
      ready: 'bg-blue-100 text-blue-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Password Reset Modal */}
      {isResettingPassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Set New Password</h2>
            <p className="text-gray-600 mb-6">Enter your new password below</p>

            {resetError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{resetError}</p>
              </div>
            )}

            {resetSuccess && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">✓ Password updated successfully!</p>
              </div>
            )}

            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="••••••••"
                  disabled={resetSuccess}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="••••••••"
                  disabled={resetSuccess}
                />
              </div>

              {!resetSuccess && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResettingPassword(false);
                      setNewPassword('');
                      setConfirmPassword('');
                      setResetError(null);
                      window.history.replaceState(null, '', window.location.pathname);
                    }}
                    className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition"
                  >
                    Update Password
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User className="h-8 w-8 text-green-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">My Account</h1>
                <p className="text-sm text-gray-600">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-8 justify-between items-center">
            <div className="flex gap-6 sm:gap-8">
              <button
                onClick={() => setActiveTab('subscriptions')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                  activeTab === 'subscriptions'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Package className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">My Subscriptions</span>
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                  activeTab === 'orders'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Order History</span>
              </button>
            </div>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium text-sm"
            >
              <ShoppingCart className="h-4 w-4" />
              Go Shopping
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                activeTab === 'settings'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">Settings</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Subscriptions Tab */}
        {activeTab === 'subscriptions' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">My Subscriptions</h2>
              <p className="text-gray-600">Manage your recurring deliveries</p>
            </div>

            {subscriptions.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No active subscriptions</h3>
                <p className="text-gray-600 mb-6">Start a subscription to get regular deliveries</p>
                <button
                  onClick={() => navigate('/')}
                  className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  Browse Products
                </button>
              </div>
            ) : (
              <div className="grid gap-6">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {sub.subscription_product?.name || 'Subscription'}
                          </h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(sub.status)}`}>
                            {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                          </span>
                        </div>
                        {sub.subscription_product?.description && (
                          <p className="text-gray-600 text-sm mb-3">{sub.subscription_product.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-gray-900">${sub.price_per_interval.toFixed(2)}</p>
                        <p className="text-sm text-gray-600">
                          per {sub.interval_type}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 py-4 border-t border-b border-gray-100">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Next Delivery</p>
                        <p className="font-medium text-gray-900">
                          {new Date(sub.next_delivery_date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Deliveries Completed</p>
                        <p className="font-medium text-gray-900">{sub.deliveries_fulfilled}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Frequency</p>
                        <p className="font-medium text-gray-900">
                          Every {sub.interval_count} {sub.interval_type}
                          {sub.interval_count > 1 ? 's' : ''}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Delivery Location</p>
                        <p className="font-medium text-gray-900">{sub.pickup_location || 'Standard location'}</p>
                      </div>
                    </div>

                    {sub.paused_until && (
                      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          ⏸️ Paused until {new Date(sub.paused_until).toLocaleDateString()}
                        </p>
                      </div>
                    )}

                    <div className="mt-4 flex gap-3 flex-wrap">
                      <button
                        onClick={() => navigate(`/subscription/${sub.id}`)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium text-sm"
                      >
                        View Details
                      </button>
                      {sub.status === 'active' && (
                        <>
                          <button
                            onClick={() => {
                              // TODO: Implement pause functionality
                              alert('Pause subscription feature coming soon!');
                            }}
                            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition font-medium text-sm"
                          >
                            Pause
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm('Are you sure you want to cancel this subscription?')) {
                                try {
                                  const { error } = await supabase
                                    .from('customer_subscriptions')
                                    .update({ status: 'cancelled' })
                                    .eq('id', sub.id);
                                  
                                  if (error) throw error;
                                  
                                  alert('Subscription cancelled successfully');
                                  await loadSubscriptions();
                                } catch (err) {
                                  console.error('Failed to cancel subscription:', err);
                                  alert('Failed to cancel subscription. Please try again.');
                                }
                              }
                            }}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium text-sm"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {sub.status === 'paused' && (
                        <button
                          onClick={async () => {
                            try {
                              const { error } = await supabase
                                .from('customer_subscriptions')
                                .update({ status: 'active', paused_until: null })
                                .eq('id', sub.id);
                              
                              if (error) throw error;
                              
                              alert('Subscription resumed successfully');
                              await loadSubscriptions();
                            } catch (err) {
                              console.error('Failed to resume subscription:', err);
                              alert('Failed to resume subscription. Please try again.');
                            }
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium text-sm"
                        >
                          Resume
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Order History</h2>
              <p className="text-gray-600">View your past orders and reorder favorites</p>
            </div>

            {orders.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No orders yet</h3>
                <p className="text-gray-600 mb-6">Your order history will appear here</p>
                <button
                  onClick={() => navigate('/')}
                  className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  Start Shopping
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order: any) => (
                  <div key={order.id} className="bg-white rounded-lg shadow-sm hover:shadow-md transition">
                    {/* Order Header - Reorganized for better layout */}
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            Order #{order.id.slice(0, 8)}
                          </h3>
                          {/* Date and Status below title */}
                          <div className="flex items-center gap-4 mb-3">
                            <span className="text-sm text-gray-600">
                              📅 {new Date(order.created_at).toLocaleDateString('en-US', { 
                                weekday: 'short', 
                                year: 'numeric', 
                                month: 'short', 
                                day: 'numeric' 
                              })}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(order.status)}`}>
                              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                            </span>
                            {order.source === 'subscription' && (
                              <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                🔄 Subscription
                              </span>
                            )}
                            {order.is_recurring && (
                              <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                🔁 Recurring
                              </span>
                            )}
                          </div>
                          {/* Delivery/Pickup info */}
                          <div className="text-sm text-gray-600">
                            {order.note && order.note.includes('delivery') && (
                              <span>🚚 Delivery</span>
                            )}
                            {(!order.note || !order.note.includes('delivery')) && (
                              <span>📦 Pickup</span>
                            )}
                          </div>
                        </div>
                        {/* Total on the right */}
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-900">${(order.total_cents / 100).toFixed(2)}</p>
                          <p className="text-sm text-gray-600">Total</p>
                        </div>
                      </div>

                      {/* Expandable Items Section */}
                      <button
                        onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                        className="flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-700 mb-4"
                      >
                        {expandedOrderId === order.id ? '▼' : '▶'} 
                        View Order Details ({order.order_lines?.length || 0} items)
                      </button>

                      {/* Expanded Items View */}
                      {expandedOrderId === order.id && order.order_lines && order.order_lines.length > 0 && (
                        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">Items in this order:</h4>
                          <div className="space-y-3">
                            {order.order_lines.map((line: any) => (
                              <div key={line.id} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
                                <div className="flex-1">
                                  <p className="font-medium text-gray-900">{line.product_name || 'Product'}</p>
                                  <p className="text-sm text-gray-600">
                                    Qty: {line.quantity} × ${(line.unit_price_cents / 100).toFixed(2)}
                                  </p>
                                </div>
                                <p className="font-medium text-gray-900 ml-4">${(line.line_total_cents / 100).toFixed(2)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-3 pt-4 border-t border-gray-100 flex-wrap">
                        {order.status === 'pending' && !order.is_recurring && (
                          <>
                            <button
                              onClick={async () => {
                                if (confirm('Are you sure you want to cancel this order?')) {
                                  try {
                                    const { error } = await supabase
                                      .from('orders')
                                      .update({ status: 'cancelled' })
                                      .eq('id', order.id);
                                    
                                    if (error) throw error;
                                    
                                    alert('Order cancelled successfully');
                                    await loadOrders();
                                  } catch (err) {
                                    console.error('Failed to cancel order:', err);
                                    alert('Failed to cancel order. Please try again.');
                                  }
                                }
                              }}
                              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium text-sm"
                            >
                              Cancel Order
                            </button>
                            <button
                              onClick={() => {
                                setSelectedOrder(order);
                                setShowRecurringModal(true);
                              }}
                              disabled={makingRecurring === order.id}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {makingRecurring === order.id ? '⏳ Processing...' : '🔄 Make Recurring'}
                            </button>
                          </>
                        )}
                        {order.is_recurring && (
                          <button
                            onClick={() => {
                              setManagingOrder(order);
                              setShowManageRecurringModal(true);
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
                          >
                            🔁 Manage Recurring
                          </button>
                        )}
                        {order.status === 'completed' && !order.is_recurring && (
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowRecurringModal(true);
                            }}
                            disabled={makingRecurring === order.id}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {makingRecurring === order.id ? '⏳ Processing...' : '🔄 Make Recurring'}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            // TODO: Implement reorder functionality
                            alert('Reorder feature coming soon! This will add all items from this order to your cart.');
                          }}
                          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium text-sm"
                        >
                          🛒 Reorder Now
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Settings</h2>
              <p className="text-gray-600">Manage your account preferences</p>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <p className="text-gray-900">{user?.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Member Since</label>
                  <p className="text-gray-900">
                    {new Date(user?.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Methods
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                Manage your payment methods for subscriptions
              </p>
              <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium">
                Manage Payment Methods
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Recurring Order Modal */}
      {selectedOrder && (
        <RecurringOrderModal
          isOpen={showRecurringModal}
          onClose={() => {
            setShowRecurringModal(false);
            setSelectedOrder(null);
          }}
          onConfirm={(settings) => makeRecurringOrder(selectedOrder, settings)}
          orderTotal={selectedOrder.total_cents}
          orderId={selectedOrder.id}
        />
      )}

      {/* Manage Recurring Modal */}
      {managingOrder && (
        <ManageRecurringModal
          isOpen={showManageRecurringModal}
          onClose={() => {
            setShowManageRecurringModal(false);
            setManagingOrder(null);
          }}
          order={managingOrder}
          onUpdate={async () => {
            await loadOrders();
            setShowManageRecurringModal(false);
            setManagingOrder(null);
          }}
        />
      )}
    </div>
  );
}

// Manage Recurring Modal Component
interface ManageRecurringModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  onUpdate: () => void;
}

function ManageRecurringModal({ isOpen, onClose, order, onUpdate }: ManageRecurringModalProps) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this recurring order? No future orders will be created.')) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ 
          is_recurring: false,
          recurrence_frequency: null,
          recurrence_interval: null,
          recurrence_duration: null,
        })
        .eq('id', order.id);

      if (error) throw error;

      alert('✅ Recurring order cancelled. This order will not repeat.');
      onUpdate();
    } catch (error) {
      console.error('Failed to cancel recurring order:', error);
      alert('Failed to cancel recurring order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">🔁 Manage Recurring Order</h2>
        
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-2">Current Schedule:</h3>
          <p className="text-gray-700">
            📅 Every {order.recurrence_frequency} {order.recurrence_interval}
            {(order.recurrence_frequency || 0) > 1 ? 's' : ''}
            {order.recurrence_duration && (
              <span className="block text-sm text-gray-600 mt-1">
                For {order.recurrence_duration} deliveries total
              </span>
            )}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            💰 ${(order.total_cents / 100).toFixed(2)} per delivery
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleCancel}
            disabled={loading}
            className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Cancelling...' : '🚫 Cancel Recurring Order'}
          </button>
          
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
          >
            Close
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          💡 Cancelling will stop future automatic orders. This order will remain in your history.
        </p>
      </div>
    </div>
  );
}
