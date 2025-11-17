import { useState } from 'react';
import type { StorefrontTemplateProps } from '../types/storefront';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { ProductCard } from '../components/ProductCard';

export function ModernFarmTemplate({
  settings,
  products,
  categories,
  cart,
  onAddToCart,
  onRemoveFromCart,
}: StorefrontTemplateProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  const filteredProducts = selectedCategory 
    ? products.filter(product => product.categoryId === selectedCategory)
    : products;

  const scrollToProducts = () => {
    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
  };

  const isDark = settings.darkMode || false;
  const bgColor = isDark ? 'bg-slate-900' : 'bg-slate-50';
  const textColor = isDark ? 'text-slate-100' : 'text-slate-900';
  const cardBg = isDark ? 'bg-slate-800' : 'bg-white';
  const borderColor = isDark ? 'border-slate-700' : 'border-slate-100';

  return (
    <div className={`flex min-h-screen flex-col ${bgColor} ${textColor}`}>
      <Navbar 
        title={settings.heroHeading || settings.farmName}
        logoUrl={settings.logoUrl}
        cartCount={cartCount}
        primaryColor={settings.primaryColor}
        accentColor={settings.accentColor}
      />
      
      {/* Hero Section */}
      <section className={`relative ${cardBg}`}>
        {/* Background hero image with tinted overlay */}
        {settings.heroImageUrl && (
          <div className="absolute inset-0">
            <img src={settings.heroImageUrl} alt={settings.heroHeading} className="w-full h-full object-cover" />
            <div
              className="absolute inset-0"
              style={{ 
                background: isDark 
                  ? `linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.5) 60%)`
                  : `linear-gradient(135deg, ${settings.primaryColor}dd 0%, rgba(0,0,0,0.4) 60%)`
              }}
            />
          </div>
        )}
        <div className="relative max-w-6xl mx-auto px-4 py-16 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Text Content */}
            <div className="text-center lg:text-left">
              <h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold mb-6 leading-tight drop-shadow-sm" style={{ color: '#fff' }}>
                {settings.heroHeading}
              </h1>
              <p className="text-xl mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0" style={{ color: '#f5f5f5' }}>
                {settings.heroSubtitle}
              </p>
              <button
                onClick={scrollToProducts}
                className="inline-flex items-center px-8 py-4 text-white font-semibold rounded-full transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                style={{ backgroundColor: settings.accentColor }}
              >
                Shop Now
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            
            {/* Hero Image */}
            {!settings.heroImageUrl && (
              <div className="order-first lg:order-last">
                <div className={`relative overflow-hidden rounded-2xl shadow-2xl h-80 lg:h-96 flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Add a hero image in settings</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Feature Sections */}
      {Array.isArray(settings.featureSections) && settings.featureSections.length > 0 && (
        <div className="flex flex-col">
          {settings.featureSections.map((section, idx) => (
            section.imageUrl ? (
              <section key={idx} className="relative w-full">
                <img src={section.imageUrl} alt={section.heading || 'Feature'} className="w-full h-[480px] object-cover" />
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

      {/* Category Strip */}
      {categories.length > 0 && (
        <section className={`${cardBg} border-t ${borderColor}`}>
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="flex gap-3 overflow-x-auto scrollbar-hide">
              <div className="flex gap-3 lg:justify-center lg:w-full">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`flex-none px-6 py-3 border rounded-full transition-colors duration-200 cursor-pointer ${
                    selectedCategory === null
                      ? 'text-white'
                      : `${isDark ? 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'}`
                  }`}
                  style={selectedCategory === null ? { backgroundColor: settings.primaryColor, borderColor: settings.primaryColor } : undefined}
                >
                  <span className="text-sm font-medium whitespace-nowrap">
                    All Products
                  </span>
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`flex-none px-6 py-3 border rounded-full transition-colors duration-200 cursor-pointer ${
                      selectedCategory === category.id
                        ? 'text-white'
                        : `${isDark ? 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'}`
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
      <section id="products" className="flex-1 py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className={`text-3xl lg:text-4xl font-bold mb-4 ${textColor}`}>
              Our Products
            </h2>
            <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Fresh, quality products from our farm to your table
            </p>
          </div>
          
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((product) => {
              const itemInCart = cart.items.find((i) => i.productId === product.id);
              const quantityInCart = itemInCart?.quantity ?? 0;

              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantityInCart={quantityInCart}
                  onAddToCart={() => onAddToCart(product.id, 1)}
                  onRemoveFromCart={() => onRemoveFromCart(product.id)}
                  primaryColor={settings.primaryColor}
                  accentColor={settings.accentColor}
                />
              );
            })}
          </div>
        </div>
      </section>

      <Footer storeName={settings.farmName} />
    </div>
  );
}