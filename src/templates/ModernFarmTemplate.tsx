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

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Navbar 
        title={settings.heroHeading || settings.farmName}
        logoUrl={settings.logoUrl}
        cartCount={cartCount}
      />
      
      {/* Hero Section */}
      <section className="bg-white">
        <div className="max-w-6xl mx-auto px-4 py-12 lg:py-20">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Text Content */}
            <div className="text-center lg:text-left">
              <h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold text-slate-900 mb-6 leading-tight">
                {settings.heroHeading}
              </h1>
              <p className="text-xl text-slate-600 mb-8 leading-relaxed">
                {settings.heroSubtitle}
              </p>
              <button
                onClick={scrollToProducts}
                className="inline-flex items-center px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-full transition-colors duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Shop Now
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            
            {/* Hero Image */}
            <div className="order-first lg:order-last">
              <div className="relative overflow-hidden rounded-2xl shadow-2xl">
                <img
                  src={settings.heroImageUrl}
                  alt={settings.heroHeading}
                  className="w-full h-80 lg:h-96 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Category Strip */}
      {categories.length > 0 && (
        <section className="bg-white border-t border-slate-100">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="flex gap-3 overflow-x-auto scrollbar-hide">
              <div className="flex gap-3 lg:justify-center lg:w-full">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`flex-none px-6 py-3 border rounded-full transition-colors duration-200 cursor-pointer ${
                    selectedCategory === null
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                      : 'bg-slate-100 hover:bg-emerald-50 border-slate-200 hover:border-emerald-200 text-slate-700 hover:text-emerald-700'
                  }`}
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
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                        : 'bg-slate-100 hover:bg-emerald-50 border-slate-200 hover:border-emerald-200 text-slate-700 hover:text-emerald-700'
                    }`}
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
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
              Our Products
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
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