import { useState, useEffect } from 'react';
import { useTenantFromDomain } from './hooks/useTenantFromDomain';
import { useStorefrontData } from './hooks/useStorefrontData';
import { usePersistedCart } from './hooks/usePersistedCart';
import { getTemplate } from './templates';
import { TemplateSwitcher } from './components/TemplateSwitcher';
import { trackEvent, setAnalyticsEnabled } from './utils/analytics';
import { canUseAnalytics, canUseAdvancedThemes, canUsePreOrders, getAllowedTemplates } from './utils/subscription';
import { Toaster } from 'react-hot-toast';

export function StorefrontRoot() {
  const { tenant, loading: tenantLoading } = useTenantFromDomain();
  const { data: storefrontData, loading: dataLoading, error } = useStorefrontData(tenant?.id || '');
  const [currentTemplate, setCurrentTemplate] = useState('modern');
  
  const { cart, addToCart, removeFromCart, updateCartTotal, addBinToCart } = usePersistedCart();

  
  // Calculate cart total whenever items change
  useEffect(() => {
    if (!storefrontData) return;
    updateCartTotal(storefrontData.products);
  }, [cart.items, storefrontData, updateCartTotal]);

  // Set initial template from settings and configure analytics based on subscription tier
  useEffect(() => {
    const tier = tenant?.subscription_tier;
    // Configure analytics
    setAnalyticsEnabled(canUseAnalytics(tier));

    // Determine allowed templates for this tier
    if (storefrontData?.settings.templateId) {
      const desired = storefrontData.settings.templateId;
      const allowed = getAllowedTemplates(tier);
      setCurrentTemplate(allowed.includes(desired) ? desired : allowed[0] || 'classic');
    }

    if (tenant?.id && storefrontData) {
      try {
        trackEvent('storefront_loaded', {
          tenantId: tenant.id,
          templateId: storefrontData.settings.templateId,
          productsCount: storefrontData.products?.length || 0,
          categoriesCount: storefrontData.categories?.length || 0,
        });
      } catch {}
    }
  }, [storefrontData, tenant?.id]);

  // Loading states
  if (tenantLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading storefront...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <h2 className="font-bold">Error loading storefront</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // No tenant found
  if (!tenant?.id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Storefront Not Found
          </h1>
          <p className="text-gray-600">
            Unable to determine tenant from the current domain.
          </p>
        </div>
      </div>
    );
  }

  // No data loaded
  if (!storefrontData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Storefront Unavailable
          </h1>
          <p className="text-gray-600">
            Unable to load storefront data for {tenant.id}.
          </p>
        </div>
      </div>
    );
  }

  // Get and render the selected template
  const Template = getTemplate(currentTemplate);
  const tier = tenant.subscription_tier;
  const features = {
    preOrdersEnabled: canUsePreOrders(tier),
    advancedThemesEnabled: canUseAdvancedThemes(tier),
    analyticsEnabled: canUseAnalytics(tier),
  };

  return (
    <div className="relative">
      <Toaster 
        position="bottom-center"
        toastOptions={{
          duration: 2000,
          style: {
            background: storefrontData.settings.primaryColor || '#0f6fff',
            color: '#fff',
            fontWeight: '500',
          },
          success: {
            iconTheme: {
              primary: '#fff',
              secondary: storefrontData.settings.primaryColor || '#0f6fff',
            },
          },
        }}
      />
      <Template
        settings={storefrontData.settings}
        products={storefrontData.products}
        categories={storefrontData.categories}
        cart={cart}
        onAddToCart={addToCart}
        onRemoveFromCart={removeFromCart}
        onAddBinToCart={addBinToCart}
        features={features}
      />
      
      {/* Template Switcher - gated by subscription tier */}
      {features.advancedThemesEnabled && (
        <TemplateSwitcher 
          currentTemplate={currentTemplate}
          onTemplateChange={(id) => {
            const allowed = getAllowedTemplates(tier);
            setCurrentTemplate(allowed.includes(id) ? id : currentTemplate);
          }}
        />
      )}
    </div>
  );
}