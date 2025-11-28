import { useState } from 'react';
import type { StorefrontTemplateProps } from '../types/storefront';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { ProductCard } from '../components/ProductCard';
import { CartDrawer } from '../components/CartDrawer';
import SubscriptionSelectorModal from '../components/SubscriptionSelectorModal';
import type { Product } from '../types/product';

export function ModernFarmTemplate({
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
      .map((p) => p.categoryId) // 👈 if your field is categoryName, change this
      .filter((c): c is string => Boolean(c && c.trim()))
  )
);

// Filter products by selected category label
const filteredProducts =
  selectedCategory && selectedCategory !== "all"
    ? products.filter((product) => product.categoryId === selectedCategory)
    : products;
  const scrollToProducts = () => {
    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
  };
 const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
   
  const hasFeatureSections =
    Array.isArray(settings.featureSections) &&
    settings.featureSections.length > 0;

  // Hide hero when a feature section is active
  const showHero = !hasFeatureSections;

  const heroHeading = settings.heroHeading ?? settings.farmName;
  const heroSubtitle = settings.heroSubtitle ?? "";
  return (
     <div className="flex min-h-screen flex-col bg-slate-50 overflow-x-hidden">
    <Navbar 
        title={heroHeading || settings.farmName}
        logoUrl={settings.logoUrl}
        cartCount={cartCount}
        primaryColor={settings.primaryColor}
        accentColor={settings.accentColor}
      />
      
      {/* Hero Section - hidden when feature sections are enabled */}
      {showHero && (
        <section className="relative w-full bg-white pt-2 overflow-hidden">
          {/* Background hero image with gradient overlay */}
<img
  src={settings.heroImageUrl}
  alt={heroHeading || "Storefront hero"}
  className="w-full h-48 sm:h-56 md:h-64 lg:h-72 object-cover"
  loading="eager"
/>


          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14 lg:py-16">
            <div className="max-w-2xl">
              {/* Only render heading if not an empty string */}
              {heroHeading && (
                <h1
                  className="text-balance text-3xl sm:text-4xl md:text-5xl font-bold leading-tight max-w-[18ch]"
                  style={{ color: settings.heroImageUrl ? "#fff" : "#000" }}
                >
                  {heroHeading}
                </h1>
              )}

              {/* Only render subtitle if not empty */}
              {heroSubtitle && (
                <p
                  className={`text-base sm:text-lg mb-6 leading-relaxed ${
                    settings.heroImageUrl ? "text-white/90" : "text-slate-700"
                  }`}
                >
                  {heroSubtitle}
                </p>
              )}

              {/* Only show button if we have some text */}
              {(heroHeading || heroSubtitle) && (
                <button
                  onClick={scrollToProducts}
                  className="inline-flex items-center px-6 py-3 text-base font-semibold rounded-full transition-all duration-200 shadow-md hover:shadow-lg"
                  style={{
                    backgroundColor: settings.accentColor || "#ffcc00",
                    color: "#000",
                  }}
                >
                  Shop Now
                  <svg
                    className="ml-2 w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Feature Sections */}
      {Array.isArray(settings.featureSections) && settings.featureSections.length > 0 && (
        <div className="flex flex-col">
          {settings.featureSections.map((section, idx) => (
            section.imageUrl ? (
              <section key={idx} className="relative w-full">
                <img 
                  src={section.imageUrl} 
                  alt={section.heading || 'Feature'} 
                  className="w-full h-[480px] object-cover"
                  loading="lazy"
                  style={{ aspectRatio: '16/9' }}
                />
                <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${settings.primaryColor}dd 0%, rgba(0,0,0,0.55) 65%)` }} />
                <div className="absolute inset-0 flex items-center justify-center px-6">
                  <div className="max-w-3xl text-center text-white space-y-6">
                    {section.heading && (
                      <h2 className="text-3xl lg:text-5xl font-bold drop-shadow-sm">{section.heading}</h2>
                    )}
                    {section.subtitle && (
                      <p className="text-lg lg:text-xl text-white/90 leading-relaxed">{section.subtitle}</p>
                    )}
                    {(section.ctaText || section.ctaLink) && (
                      <button
                        onClick={() => {
                          if (section.ctaLink) {
                            if (section.ctaLink.startsWith('http')) {
                              window.open(section.ctaLink, '_blank');
                            } else if (section.ctaLink.startsWith('/')) {
                              window.location.href = section.ctaLink;
                            } else {
                              scrollToProducts();
                            }
                          } else {
                            scrollToProducts();
                          }
                        }}
                        className="inline-flex items-center px-8 py-4 rounded-full font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                        style={{ backgroundColor: settings.accentColor, color: '#fff' }}
                      >
                        {section.ctaText || 'Shop Now'}
                        <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </section>
            ) : null
          ))}
        </div>
      )}


{/* Products Grid + Category Navigation */}
<section id="products" className="flex-1 py-8 md:py-12 bg-slate-50">
  <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
    {/* Section heading */}
    <div className="text-center mb-6 md:mb-8">
      <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-2 md:mb-3 text-slate-900">
        Our Products
      </h2>
      <p className="text-base md:text-lg max-w-2xl mx-auto text-slate-600">
        Fresh, quality products from our farm to your table
      </p>
    </div>

    {/* Category pills built from product.categoryId (text) */}
    {categoryLabels.length > 0 && (
      <div className="flex flex-wrap justify-center gap-2 mb-6 md:mb-8">
        {/* All Products pill */}
        <button
          type="button"
          onClick={() => setSelectedCategory(null)}
          className={[
            "px-4 py-2 rounded-full text-sm md:text-base font-medium border transition-all",
            selectedCategory === null
              ? "bg-slate-900 text-white border-slate-900 shadow-sm"
              : "bg-white text-slate-700 border-slate-200 hover:border-slate-400",
          ].join(" ")}
        >
          All Products
        </button>

        {/* One pill per category label */}
        {categoryLabels.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setSelectedCategory(label)}
            className={[
              "px-4 py-2 rounded-full text-sm md:text-base font-medium border transition-all",
              selectedCategory === label
                ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                : "bg-white text-slate-700 border-slate-200 hover:border-slate-400",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>
    )}

    {/* Product cards */}
    <div className="grid gap-4 sm:gap-5 md:gap-6 grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
     
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
              // Debug logging
              console.log('Product clicked:', product.name, 'isSubscription:', product.isSubscription, 'subscriptionData:', product.subscriptionData);
              
              // If this is a subscription product, show modal instead
              if (product.isSubscription && product.subscriptionData) {
                console.log('Opening subscription modal for:', product.name);
                setSelectedSubscriptionProduct(product);
                setShowSubscriptionModal(true);
                return;
              }

              const preOrdersEnabled = features?.preOrdersEnabled !== false;
              const isPreOrder =
                preOrdersEnabled && product.isSoldOut && product.allowPreOrder;

              const weight = options?.weight;
              const quantity = options?.quantity ?? 1;

              // For weight-based products, pass weight; for quantity-based, just pass quantity
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
            // Add subscription to cart with metadata
            onAddToCart(selectedSubscriptionProduct.id, 1, {
              isSubscription: true,
              subscriptionInterval: config.interval,
              subscriptionDuration: config.duration,
              subscriptionDurationIntervals: config.durationIntervals,
              subscriptionTotalPrice: config.totalPrice,
            } as any);
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