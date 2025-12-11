import { useState } from 'react';
import type { StorefrontTemplateProps } from '../types/storefront';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { ProductCard } from '../components/ProductCard';
import { CartDrawer } from '../components/CartDrawer';
import SubscriptionSelectorModal from '../components/SubscriptionSelectorModal';
import type { Product } from '../types/product';

export function MinimalTemplate({
  settings,
  products,
  cart,
  onAddToCart,
  onRemoveFromCart,
  onAddBinToCart,
  features,
}: StorefrontTemplateProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [selectedSubscriptionProduct, setSelectedSubscriptionProduct] = useState<Product | null>(null);

  const categoryLabels = Array.from(
    new Set(
      products
        .map((p) => p.categoryId)
        .filter((c): c is string => Boolean(c && c.trim()))
    )
  );

  // Filter products by selected category label
  const categoryFiltered =
    selectedCategory && selectedCategory !== "all"
      ? products.filter((product) => product.categoryId === selectedCategory)
      : products;

  // Sort products: in-stock first, then pre-order, then sold out
  const filteredProducts = categoryFiltered.sort((a, b) => {
    const getAvailabilityScore = (product: Product) => {
      const isSoldOut = product.isSoldOut || !product.available || 
                        (product.inventory !== undefined && product.inventory <= 0);
      const canPreOrder = (features?.preOrdersEnabled !== false) && isSoldOut && product.allowPreOrder;
      
      if (!isSoldOut) return 0; // In stock - highest priority
      if (canPreOrder) return 1; // Pre-order available - medium priority
      return 2; // Sold out - lowest priority
    };
    
    return getAvailabilityScore(a) - getAvailabilityScore(b);
  });

  const scrollToProducts = () => {
    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
  };

  const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const heroHeading = settings.heroHeading ?? settings.farmName;
  const heroSubtitle = settings.heroSubtitle ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar 
        title={heroHeading || settings.farmName}
        logoUrl={settings.logoUrl}
        cartCount={cartCount}
        primaryColor={settings.primaryColor}
        accentColor={settings.accentColor}
      />
      
      {/* Minimal Hero Section */}
      <section className="py-16 md:py-24 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-light text-gray-900 mb-4">
            {heroHeading}
          </h1>
          {heroSubtitle && (
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
              {heroSubtitle}
            </p>
          )}
          <button
            onClick={scrollToProducts}
            className="inline-flex items-center px-6 py-3 text-base font-medium border border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white transition-colors duration-200"
            style={{
              borderColor: settings.primaryColor,
              color: settings.primaryColor,
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.backgroundColor = settings.primaryColor;
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.backgroundColor = 'transparent';
            }}
          >
            Shop Now
            <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </section>

      {/* Products Section */}
      <section id="products" className="flex-1 py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Category Filter */}
          {categoryLabels.length > 0 && (
            <div className="flex flex-wrap justify-center gap-4 mb-12 pb-8 border-b border-gray-200">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  selectedCategory === null
                    ? 'text-gray-900 border-gray-900'
                    : 'text-gray-600 hover:text-gray-900 border-transparent hover:border-gray-300'
                }`}
                style={{
                  borderColor: selectedCategory === null ? settings.primaryColor : undefined,
                  color: selectedCategory === null ? settings.primaryColor : undefined
                }}
              >
                All Products
              </button>
              
              {categoryLabels.map((label) => (
                <button
                  key={label}
                  onClick={() => setSelectedCategory(label)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    selectedCategory === label
                      ? 'text-gray-900 border-gray-900'
                      : 'text-gray-600 hover:text-gray-900 border-transparent hover:border-gray-300'
                  }`}
                  style={{
                    borderColor: selectedCategory === label ? settings.primaryColor : undefined,
                    color: selectedCategory === label ? settings.primaryColor : undefined
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Product Grid */}
          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {filteredProducts.map((product) => {
                const quantityInCart = cart.items
                  .filter((i) => i.productId === product.id)
                  .reduce((sum, i) => sum + i.quantity, 0);

                return (
                  <ProductCard
                    key={product.id}
                    product={product}
                    quantityInCart={quantityInCart}
                    onAddToCart={(options) => {
                      if (product.isSubscription && product.subscriptionData) {
                        setSelectedSubscriptionProduct(product);
                        setShowSubscriptionModal(true);
                        return;
                      }

                      const preOrdersEnabled = features?.preOrdersEnabled !== false;
                      const isPreOrder =
                        preOrdersEnabled && product.isSoldOut && product.allowPreOrder;

                      const weight = options?.weight;
                      const quantity = options?.quantity ?? 1;

                      if (weight && weight > 0) {
                        onAddToCart(product.id, 1, { weight, isPreOrder });
                      } else {
                        onAddToCart(product.id, quantity, { isPreOrder });
                      }
                    }}
                    onRemoveFromCart={() => onRemoveFromCart(product.id)}
                    onAddBinToCart={(binWeight, unitPriceCents) => {
                      if (onAddBinToCart) {
                        onAddBinToCart(product.id, binWeight, unitPriceCents);
                      }
                    }}
                    primaryColor={settings.primaryColor}
                    accentColor={settings.accentColor}
                    preOrdersEnabled={features?.preOrdersEnabled !== false}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No products found in this category.</p>
            </div>
          )}
        </div>
      </section>

      <Footer storeName={settings.farmName} />
      
      {/* Subscription Modal */}
      {showSubscriptionModal && selectedSubscriptionProduct?.subscriptionData && (
        <SubscriptionSelectorModal
          subscriptionName={selectedSubscriptionProduct.name}
          basePrice={selectedSubscriptionProduct.subscriptionData.price_per_interval}
          defaultInterval={selectedSubscriptionProduct.subscriptionData.interval_type}
          durationType={selectedSubscriptionProduct.subscriptionData.duration_type}
          seasonStartDate={selectedSubscriptionProduct.subscriptionData.season_start_date}
          seasonEndDate={selectedSubscriptionProduct.subscriptionData.season_end_date}
          onConfirm={(config) => {
            onAddToCart(selectedSubscriptionProduct.id, 1, {
              metadata: {
                isSubscription: true,
                subscriptionProductId: selectedSubscriptionProduct.subscriptionData!.id,
                subscriptionInterval: config.interval,
                subscriptionDuration: config.duration,
                subscriptionDurationIntervals: config.durationIntervals,
                subscriptionTotalPrice: config.totalPrice,
              }
            });
            setShowSubscriptionModal(false);
            setSelectedSubscriptionProduct(null);
          }}
          onCancel={() => {
            setShowSubscriptionModal(false);
            setSelectedSubscriptionProduct(null);
          }}
        />
      )}
      
      {/* Mobile Cart Drawer */}
      <CartDrawer 
        cart={cart} 
        products={products}
        primaryColor={settings.primaryColor}
        accentColor={settings.accentColor}
      />
    </div>
  );
}