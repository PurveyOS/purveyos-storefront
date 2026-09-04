import { useState, useEffect } from 'react';
import { useTenantFromDomain } from './hooks/useTenantFromDomain';
import { useStorefrontData } from './hooks/useStorefrontData';
import { useCart } from './context/CartContext';
import { getTemplate } from './templates';
import { TemplateSwitcher } from './components/TemplateSwitcher';
import { trackEvent, setAnalyticsEnabled } from './utils/analytics';
import { canUseAnalytics, canUseAdvancedThemes, canUsePreOrders, getAllowedTemplates } from './utils/subscription';
import { Toaster } from 'react-hot-toast';
import { StorefrontConfigurationError } from './components/StorefrontConfigurationError';

export function StorefrontRoot() {
  const { tenant, loading: tenantLoading } = useTenantFromDomain();
  const { data: storefrontData, loading: dataLoading, error, retry } = useStorefrontData(tenant?.id || '');
  const [currentTemplate, setCurrentTemplate] = useState('modern');
  const [pendingDepositAdd, setPendingDepositAdd] = useState<{
    kind: 'cart' | 'bin';
    productId: string;
    quantity: number;
    options?: Parameters<typeof addToCart>[2];
    binWeight?: number;
    unitPriceCents?: number;
  } | null>(null);
  const [hideDepositNoticeNextTime, setHideDepositNoticeNextTime] = useState(false);
  
  const { cart, addToCart, removeFromCart, updateCartTotal, addBinToCart } = useCart();

  
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
    return <StorefrontConfigurationError message={error} onRetry={retry} />;
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
    return <StorefrontConfigurationError onRetry={retry} />;
  }

  // Get and render the selected template
  const Template = getTemplate(currentTemplate);
  const tier = tenant.subscription_tier;
  const features = {
    preOrdersEnabled: canUsePreOrders(tier),
    advancedThemesEnabled: canUseAdvancedThemes(tier),
    analyticsEnabled: canUseAnalytics(tier),
  };
  const depositNoticeStorageKey = tenant?.id
    ? `purveyos-hide-deposit-notice:${tenant.id}`
    : 'purveyos-hide-deposit-notice';
  const pendingDepositProduct = pendingDepositAdd
    ? storefrontData.products.find((product) => product.id === pendingDepositAdd.productId)
    : null;
  const pendingQuantity = pendingDepositAdd?.quantity ?? 1;
  const pendingDepositDueNow = pendingDepositProduct
    ? Number(pendingDepositProduct.pricePer ?? 0) * pendingQuantity
    : 0;
  const pendingDepositFinalTotal = pendingDepositProduct && Number(pendingDepositProduct.deposit_fixed_total ?? 0) > 0
    ? Number(pendingDepositProduct.deposit_fixed_total) * pendingQuantity
    : null;
  const pendingDepositBalance = pendingDepositFinalTotal !== null
    ? Math.max(0, pendingDepositFinalTotal - pendingDepositDueNow)
    : null;

  const isDepositNoticeHidden = () => {
    try {
      return window.localStorage.getItem(depositNoticeStorageKey) === 'true';
    } catch {
      return false;
    }
  };

  const saveDepositNoticePreference = () => {
    if (!hideDepositNoticeNextTime) return;
    try {
      window.localStorage.setItem(depositNoticeStorageKey, 'true');
    } catch {}
  };

  const shouldShowDepositNotice = (productId: string) => {
    const product = storefrontData.products.find((item) => item.id === productId);
    return product?.is_deposit_product === true && !isDepositNoticeHidden();
  };

  const handleAddToCart = (
    productId: string,
    quantity: number = 1,
    options?: Parameters<typeof addToCart>[2],
  ) => {
    if (shouldShowDepositNotice(productId)) {
      setHideDepositNoticeNextTime(false);
      setPendingDepositAdd({ kind: 'cart', productId, quantity, options });
      return;
    }

    addToCart(productId, quantity, options);
  };

  const handleAddBinToCart = (productId: string, binWeight: number, unitPriceCents: number) => {
    if (shouldShowDepositNotice(productId)) {
      setHideDepositNoticeNextTime(false);
      setPendingDepositAdd({ kind: 'bin', productId, quantity: 1, binWeight, unitPriceCents });
      return;
    }

    addBinToCart(productId, binWeight, unitPriceCents);
  };

  const confirmPendingDepositAdd = () => {
    if (!pendingDepositAdd) return;
    saveDepositNoticePreference();

    if (pendingDepositAdd.kind === 'bin') {
      addBinToCart(pendingDepositAdd.productId, pendingDepositAdd.binWeight ?? 0, pendingDepositAdd.unitPriceCents ?? 0);
    } else {
      addToCart(pendingDepositAdd.productId, pendingDepositAdd.quantity, pendingDepositAdd.options);
    }

    setPendingDepositAdd(null);
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
        tenantDefaultOrderMode={storefrontData.tenantDefaultOrderMode}
        onAddToCart={handleAddToCart}
        onRemoveFromCart={removeFromCart}
        onAddBinToCart={handleAddBinToCart}
        features={features}
      />

      {pendingDepositProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-gray-900">Deposit item</h2>
            <p className="mt-2 text-sm text-gray-600">
              {pendingDepositProduct.name} requires a deposit today. This is not the final price.
            </p>
            <div className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
              <div className="flex justify-between gap-4 text-amber-900">
                <span>Due today</span>
                <span className="font-semibold">${pendingDepositDueNow.toFixed(2)}</span>
              </div>
              {pendingDepositFinalTotal !== null ? (
                <>
                  <div className="flex justify-between gap-4 text-gray-700">
                    <span>Final total</span>
                    <span className="font-semibold">${pendingDepositFinalTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-gray-700">
                    <span>Due later</span>
                    <span className="font-semibold">${(pendingDepositBalance ?? 0).toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <p className="text-gray-700">
                  The remaining balance is collected later after the final weight or fulfillment details are confirmed.
                </p>
              )}
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={hideDepositNoticeNextTime}
                onChange={(event) => setHideDepositNoticeNextTime(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
                style={{ accentColor: storefrontData.settings.primaryColor || '#0f6fff' }}
              />
              Don't show this again on this device
            </label>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingDepositAdd(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPendingDepositAdd}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm"
                style={{ backgroundColor: storefrontData.settings.primaryColor || '#0f6fff' }}
              >
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}
      
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