import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, Package, Calendar, Settings, LogOut, ShoppingCart } from 'lucide-react';

interface BoxItem {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  isOptional: boolean;
}

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
    id: string;
    name: string;
    description: string;
  };
  boxItems?: BoxItem[];
}

interface OrderLine {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  weight_lbs?: number | null;
  bin_weight?: number | null;
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
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('customer_subscriptions')
        .select(`
          *,
          subscription_product:subscription_products(id, name, description)
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const subData: Subscription[] = data || [];

      // Fetch box items for each subscription product
      const subProductIds = subData
        .map((s) => s.subscription_product?.id)
        .filter(Boolean) as string[];

      if (subProductIds.length > 0) {
        const { data: rawBoxItems } = await supabase
          .from('subscription_box_items')
          .select('subscription_product_id, product_id, default_quantity, is_optional')
          .in('subscription_product_id', subProductIds)
          .eq('is_substitution_option', false);

        if (rawBoxItems && rawBoxItems.length > 0) {
          const productIds = [...new Set(rawBoxItems.map((b: any) => b.product_id))];
          const { data: products } = await supabase
            .from('products')
            .select('id, name, unit')
            .in('id', productIds);

          const productMap = new Map<string, { id: string; name: string; unit: string }>(
            (products || []).map((p: any) => [p.id, p])
          );

          const boxBySubProduct = new Map<string, BoxItem[]>();
          for (const item of rawBoxItems as any[]) {
            const prod = productMap.get(item.product_id);
            if (!prod) continue;
            if (!boxBySubProduct.has(item.subscription_product_id)) {
              boxBySubProduct.set(item.subscription_product_id, []);
            }
            boxBySubProduct.get(item.subscription_product_id)!.push({
              productId: item.product_id,
              productName: prod.name,
              quantity: item.default_quantity || 1,
              unit: prod.unit || 'ea',
              isOptional: item.is_optional || false,
            });
          }

          setSubscriptions(
            subData.map((sub) => ({
              ...sub,
              boxItems: boxBySubProduct.get(sub.subscription_product?.id) || [],
            }))
          );
          return;
        }
      }

      setSubscriptions(subData);
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
            line_total_cents,
            weight_lbs,
            bin_weight
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

                    {sub.boxItems && sub.boxItems.length > 0 && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Box Contents</h4>
                        <ul className="space-y-1">
                          {sub.boxItems.map((item) => (
                            <li key={item.productId} className="flex items-center justify-between text-sm">
                              <span className="text-gray-800">
                                {item.productName}
                                {item.isOptional && (
                                  <span className="ml-1 text-xs text-gray-500">(optional)</span>
                                )}
                              </span>
                              <span className="text-gray-600">
                                {item.quantity} {item.unit}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {sub.paused_until && (
                      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          Paused until {new Date(sub.paused_until).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    {sub.status === 'paused' && !sub.paused_until && (
                      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">Paused indefinitely. Resume when you're ready.</p>
                      </div>
                    )}

                    <div className="mt-4 flex gap-3 flex-wrap">
                      {sub.status === 'active' && (
                        <>
                          <button
                            onClick={async () => {
                              if (!confirm('Pause this subscription? Deliveries will be paused until you resume.')) return;
                              try {
                                const { error } = await supabase
                                  .from('customer_subscriptions')
                                  .update({ status: 'paused', paused_until: null })
                                  .eq('id', sub.id);
                                if (error) throw error;
                                await loadSubscriptions();
                              } catch (err) {
                                console.error('Failed to pause subscription:', err);
                                alert('Failed to pause subscription. Please try again.');
                              }
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
                            {order.order_lines.map((line: any) => {
                              const weightLbs: number | null = line.weight_lbs ?? null;
                              const binWeight: number | null = line.bin_weight ?? null;
                              const isByWeight = weightLbs != null || binWeight != null;
                              const displayWeight = weightLbs ?? binWeight ?? 0;
                              return (
                                <div key={line.id} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
                                  <div className="flex-1">
                                    <p className="font-medium text-gray-900">{line.product_name || 'Product'}</p>
                                    <p className="text-sm text-gray-600">
                                      {isByWeight
                                        ? `${displayWeight} lb × $${(line.unit_price_cents / 100).toFixed(2)}/lb`
                                        : `Qty: ${line.quantity} × $${(line.unit_price_cents / 100).toFixed(2)}`
                                      }
                                    </p>
                                  </div>
                                  <p className="font-medium text-gray-900 ml-4">${(line.line_total_cents / 100).toFixed(2)}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      {order.status === 'pending' && (
                        <div className="pt-4 border-t border-gray-100">
                          <button
                            onClick={async () => {
                              if (confirm('Are you sure you want to cancel this order?')) {
                                try {
                                  const { error } = await supabase
                                    .from('orders')
                                    .update({ status: 'cancelled' })
                                    .eq('id', order.id);
                                  if (error) throw error;
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
                        </div>
                      )}
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

          </div>
        )}
      </main>
    </div>
  );
}

