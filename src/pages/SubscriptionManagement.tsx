import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Pause, Play, MapPin, AlertCircle, CheckCircle } from 'lucide-react';

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

export function SubscriptionManagement() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [pauseUntil, setPauseUntil] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  useEffect(() => {
    loadSubscription();
  }, [id]);

  const loadSubscription = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      const { data, error } = await supabase
        .from('customer_subscriptions')
        .select(`
          *,
          subscription_product:subscription_products(name, description)
        `)
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Subscription not found');

      setSubscription(data);
      setDeliveryLocation(data.pickup_location || '');
      setDeliveryNotes(data.delivery_notes || '');
    } catch (err: any) {
      console.error('Failed to load subscription:', err);
      setError(err.message || 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    if (!pauseUntil) {
      setError('Please select a date to pause until');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase
        .from('customer_subscriptions')
        .update({
          status: 'paused',
          paused_until: pauseUntil,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      setSuccess('Subscription paused successfully!');
      await loadSubscription();
      setPauseUntil('');
    } catch (err: any) {
      setError(err.message || 'Failed to pause subscription');
    } finally {
      setSaving(false);
    }
  };

  const handleResume = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase
        .from('customer_subscriptions')
        .update({
          status: 'active',
          paused_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      setSuccess('Subscription resumed successfully!');
      await loadSubscription();
    } catch (err: any) {
      setError(err.message || 'Failed to resume subscription');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePreferences = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase
        .from('customer_subscriptions')
        .update({
          pickup_location: deliveryLocation,
          delivery_notes: deliveryNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      setSuccess('Preferences updated successfully!');
      await loadSubscription();
    } catch (err: any) {
      setError(err.message || 'Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading subscription...</p>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Subscription Not Found</h2>
          <p className="text-gray-600 mb-6">{error || 'This subscription could not be loaded'}</p>
          <button
            onClick={() => navigate('/account')}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            Back to Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <button
          onClick={() => navigate('/account')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to My Account
        </button>

        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {subscription.subscription_product?.name || 'Subscription'}
              </h1>
              <p className="text-gray-600">{subscription.subscription_product?.description}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              subscription.status === 'active' ? 'bg-green-100 text-green-800' :
              subscription.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
            <div>
              <p className="text-sm text-gray-600 mb-1">Price</p>
              <p className="font-semibold text-gray-900">${subscription.price_per_interval.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Frequency</p>
              <p className="font-semibold text-gray-900">
                Every {subscription.interval_count} {subscription.interval_type}{subscription.interval_count > 1 ? 's' : ''}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Next Delivery</p>
              <p className="font-semibold text-gray-900">
                {new Date(subscription.next_delivery_date).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Completed</p>
              <p className="font-semibold text-gray-900">{subscription.deliveries_fulfilled}</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-800">{success}</p>
          </div>
        )}

        {/* Pause/Resume Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            {subscription.status === 'paused' ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            {subscription.status === 'paused' ? 'Resume Subscription' : 'Pause Subscription'}
          </h2>

          {subscription.status === 'active' ? (
            <div>
              <p className="text-gray-600 text-sm mb-4">
                Need a break? You can pause your subscription and resume it later.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pause Until
                </label>
                <input
                  type="date"
                  value={pauseUntil}
                  onChange={(e) => setPauseUntil(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handlePause}
                disabled={saving || !pauseUntil}
                className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {saving ? 'Pausing...' : 'Pause Subscription'}
              </button>
            </div>
          ) : subscription.status === 'paused' ? (
            <div>
              <p className="text-gray-600 text-sm mb-4">
                Your subscription is paused until {new Date(subscription.paused_until!).toLocaleDateString()}.
                Resume to continue receiving deliveries.
              </p>
              <button
                onClick={handleResume}
                disabled={saving}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {saving ? 'Resuming...' : 'Resume Subscription'}
              </button>
            </div>
          ) : null}
        </div>

        {/* Delivery Preferences */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Delivery Preferences
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Delivery Location
              </label>
              <input
                type="text"
                value={deliveryLocation}
                onChange={(e) => setDeliveryLocation(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="123 Main St, City, State 12345"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Special Instructions
              </label>
              <textarea
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Leave at back door, call when arrived, etc."
              />
            </div>

            <button
              onClick={handleUpdatePreferences}
              disabled={saving}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
