import { useState } from 'react';
import type { StorefrontTemplateProps } from '../types/storefront';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { ProductCard } from '../components/ProductCard';
import { CartDrawer } from '../components/CartDrawer';

export function ModernFarmTemplate({
  settings,
  products,
  categories,
  cart,
  onAddToCart,
  onRemoveFromCart,
  onAddBinToCart,
  features,
}: StorefrontTemplateProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  const filteredProducts = selectedCategory 
    ? products.filter(product => product.categoryId === selectedCategory)
    : products;

  const scrollToProducts = () => {
    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Navbar 
        title={settings.heroHeading || settings.farmName}
        logoUrl={settings.logoUrl}
        cartCount={cartCount}
        primaryColor={settings.primaryColor}
        accentColor={settings.accentColor}
      />
      
      {/* Hero Section (reduced padding for mobile) */}
      <section className="relative bg-white pt-2">
        {/* Background hero image with gradient overlay */}
        {settings.heroImageUrl && (
          <div className="absolute inset-0">
            <img 
              src={settings.heroImageUrl} 
              alt={settings.heroHeading} 
              className="w-full h-full object-cover"
              loading="eager"
              style={{ aspectRatio: '21/9' }}
            />
            <div
              className="absolute inset-0"
              style={{ 
                background: `linear-gradient(to right, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.5) 100%)`
              }}
            />
          </div>
        )}
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14 lg:py-16">
          <div className="max-w-2xl">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-white leading-tight">
              {settings.heroHeading}
            </h1>
            <p className="text-base sm:text-lg mb-6 text-white/90 leading-relaxed">
              {settings.heroSubtitle}
            </p>
            <button
              onClick={scrollToProducts}
              className="inline-flex items-center px-6 py-3 text-base font-semibold rounded-full transition-all duration-200 shadow-md hover:shadow-lg"
              style={{ 
                backgroundColor: settings.accentColor || '#ffcc00',
                color: '#000'
              }}
            >
              Shop Now
              <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* If no hero image, show placeholder */}
        {!settings.heroImageUrl && (
          <div 
            className="absolute inset-0 -z-10"
            style={{ 
              background: `linear-gradient(135deg, ${settings.primaryColor || '#0f6fff'} 0%, ${settings.primaryColor || '#0f6fff'}dd 100%)`
            }}
          />
        )}
      </section>

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

      {/* Category Strip (filter out duplicate 'All Products') */}
      {categories.length > 0 && (
        <section className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex gap-3 overflow-x-auto scrollbar-hide">
              <div className="flex gap-3 lg:justify-center lg:w-full">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`flex-none px-6 py-3 border rounded-full transition-colors duration-200 cursor-pointer ${
                    selectedCategory === null
                      ? 'text-white'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  }`}
                  style={selectedCategory === null ? { backgroundColor: settings.primaryColor, borderColor: settings.primaryColor } : undefined}
                >
                  <span className="text-sm font-medium whitespace-nowrap">
                    All Products
                  </span>
                </button>
                {categories
                  .filter(c => c.id !== 'all' && c.name !== 'All Products')
                  .map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`flex-none px-6 py-3 border rounded-full transition-colors duration-200 cursor-pointer ${
                      selectedCategory === category.id
                        ? 'text-white'
                        : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                    }`}
                    style={selectedCategory === category.id ? { backgroundColor: settings.accentColor, borderColor: settings.accentColor } : undefined}
                  >
                    <span className="text-sm font-medium whitespace-nowrap">
                      {category.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Products Grid */}
      <section id="products" className="flex-1 py-8 md:py-12 bg-slate-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="text-center mb-8 md:mb-10">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-3 md:mb-4 text-slate-900">
              Our Products
            </h2>
            <p className="text-base md:text-lg max-w-2xl mx-auto text-slate-600">
              Fresh, quality products from our farm to your table
            </p>
          </div>
          
          <div className="grid gap-4 md:gap-6 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const quantityInCart = cart.items
                .filter((i) => i.productId === product.id)
                .reduce((sum, i) => sum + i.quantity, 0);

              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantityInCart={quantityInCart}
                  onAddToCart={(weight?: number) => {
                    const preOrdersEnabled = features?.preOrdersEnabled !== false;
                    const isPreOrder = preOrdersEnabled && product.isSoldOut && product.allowPreOrder;
                    if (weight) {
                      onAddToCart(product.id, 1, { weight, isPreOrder });
                    } else {
                      onAddToCart(product.id, 1, { isPreOrder });
                    }
                  }}
                  onRemoveFromCart={() => onRemoveFromCart(product.id)}
                  onAddBinToCart={(binWeight, unitPriceCents) => {
                    if (onAddBinToCart) onAddBinToCart(product.id, binWeight, unitPriceCents);
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