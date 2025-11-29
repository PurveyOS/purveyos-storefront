import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, Package, Calendar, CreditCard, Settings, LogOut } from 'lucide-react';

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

interface Order {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  source: string;
}

export function CustomerPortal() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'orders' | 'settings'>('subscriptions');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/login');
        return;
      }

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
      if (!user?.email) return;

      const { data, error } = await supabase
        .from('orders')
        .select('id, status, total_cents, created_at, source')
        .eq('customer_email', user.email)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Failed to load orders:', error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
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
          <nav className="flex gap-8">
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                activeTab === 'subscriptions'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Package className="h-4 w-4 inline mr-2" />
              My Subscriptions
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                activeTab === 'orders'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Calendar className="h-4 w-4 inline mr-2" />
              Order History
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                activeTab === 'settings'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Settings className="h-4 w-4 inline mr-2" />
              Settings
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

                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={() => navigate(`/subscription/${sub.id}`)}
                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                      >
                        Manage Subscription
                      </button>
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
              <p className="text-gray-600">View your past orders</p>
            </div>

            {orders.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No orders yet</h3>
                <p className="text-gray-600">Your order history will appear here</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Order ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Source
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {orders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          #{order.id.slice(0, 8)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(order.status)}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {order.source === 'subscription' ? '🔄 Subscription' : '🛒 Store'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                          ${(order.total_cents / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
    </div>
  );
}
