import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTenantFromDomain } from '../hooks/useTenantFromDomain';
import { User, Phone, MapPin, FileText, Mail } from 'lucide-react';

export function CustomerProfileSetup() {
  const navigate = useNavigate();
  const { tenant } = useTenantFromDomain();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    deliveryAddress: '',
    deliveryNotes: '',
    emailNotifications: true,
  });

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    if (!supabase) {
      navigate('/login');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate('/login');
      return;
    }

    setUser(user);

    // Pre-fill with existing data if any
    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('full_name, phone, default_delivery_address, default_delivery_notes, email_notifications')
      .eq('id', user.id)
      .single();

    if (profile) {
      setFormData({
        fullName: profile.full_name || user.user_metadata?.full_name || '',
        phone: profile.phone || '',
        deliveryAddress: profile.default_delivery_address || '',
        deliveryNotes: profile.default_delivery_notes || '',
        emailNotifications: profile.email_notifications ?? true,
      });
    } else {
      setFormData(prev => ({
        ...prev,
        fullName: user.user_metadata?.full_name || user.email || '',
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user || !tenant) return;

    setLoading(true);
    setError(null);

    try {
      // Upsert customer profile with tenant_id so portal stops redirecting back to setup
      const { error: updateError } = await supabase
        .from('customer_profiles')
        .upsert({
          id: user.id,
          tenant_id: tenant.id,
          email: user.email,
          full_name: formData.fullName,
          phone: formData.phone || null,
          default_delivery_address: formData.deliveryAddress || null,
          default_delivery_notes: formData.deliveryNotes || null,
          email_notifications: formData.emailNotifications,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

      if (updateError) throw updateError;

      // Redirect to account page
      navigate('/account');
    } catch (err: any) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-full mb-4">
            <User className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Complete Your Profile</h1>
          <p className="text-gray-600">
            Help us serve you better by completing your profile information
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  value={user?.email || ''}
                  readOnly
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Your signup email (cannot be changed)</p>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  required
                  autoComplete="name"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number *
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  autoComplete="tel"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="(555) 123-4567"
                />
              </div>
              {/* SMS not used currently; keep instructions minimal */}
            </div>

            {/* Delivery Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Delivery Address
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <textarea
                  value={formData.deliveryAddress}
                  onChange={(e) => setFormData({ ...formData, deliveryAddress: e.target.value })}
                  autoComplete="street-address"
                  rows={3}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  placeholder="123 Main St, Apt 4B&#10;City, State 12345"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Optional - for delivery subscriptions</p>
            </div>

            {/* Delivery Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Delivery Notes
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <textarea
                  value={formData.deliveryNotes}
                  onChange={(e) => setFormData({ ...formData, deliveryNotes: e.target.value })}
                  rows={2}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  placeholder="Gate code, special instructions, etc."
                />
              </div>
            </div>

            {/* Email Notifications */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="emailNotifications"
                checked={formData.emailNotifications}
                onChange={(e) => setFormData({ ...formData, emailNotifications: e.target.checked })}
                className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-2 focus:ring-green-500"
              />
              <label htmlFor="emailNotifications" className="ml-3 text-sm font-medium text-gray-700">
                Enroll in email notifications
              </label>
            </div>
            <p className="text-xs text-gray-500 -mt-4">Receive updates on orders, new products, and special offers</p>

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => navigate('/account')}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition"
              >
                Skip for Now
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>

        {/* Privacy Note */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Your information is secure and will only be used to process your orders
        </p>
      </div>
    </div>
  );
}
