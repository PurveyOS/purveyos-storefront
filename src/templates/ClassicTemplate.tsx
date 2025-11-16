import { useState } from 'react';
import type { StorefrontTemplateProps } from '../types/storefront';
import { HeroSection } from '../components/HeroSection';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { ProductCard } from '../components/ProductCard';

export function ClassicTemplate({
  settings,
  products,
  categories,
  cart,
  onAddToCart,
}: StorefrontTemplateProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredProducts = selectedCategory 
    ? products.filter(product => product.categoryId === selectedCategory)
    : products;

  const scrollToProducts = () => {
    document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar settings={settings} cart={cart} />
      <HeroSection settings={settings} />
      
      {/* Categories Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 tracking-tight">
              Shop by Category
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto font-medium">
              Browse our premium selection of farm-fresh products
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => {
                  setSelectedCategory(category.id);
                  scrollToProducts();
                }}
                className="group text-center rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer bg-white focus:outline-none focus:ring-4 focus:ring-blue-200 transform hover:-translate-y-1"
                style={{ 
                  borderColor: selectedCategory === category.id ? settings.primaryColor : 'transparent',
                  borderWidth: selectedCategory === category.id ? '3px' : '0px',
                }}
              >
                {/* Category Image */}
                <div className="relative h-48 overflow-hidden">
                  {category.imageUrl ? (
                    <img 
                      src={category.imageUrl}
                      alt={category.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <div 
                      className="w-full h-full flex items-center justify-center text-white text-6xl font-bold"
                      style={{ backgroundColor: settings.primaryColor }}
                    >
                      {category.name.charAt(0)}
                    </div>
                  )}
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  
                  {/* Selected indicator */}
                  {selectedCategory === category.id && (
                    <div className="absolute top-3 right-3">
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: settings.accentColor }}
                      >
                        <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                        </svg>
                      </div>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3 className="font-bold text-xl text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                    {category.name}
                  </h3>
                  {category.description && (
                    <p className="text-gray-600 leading-relaxed mb-3">{category.description}</p>
                  )}
                  <div className="flex items-center justify-center space-x-2">
                    <span 
                      className="text-sm font-medium px-3 py-1 rounded-full text-white"
                      style={{ backgroundColor: settings.primaryColor }}
                    >
                      {products.filter(p => p.categoryId === category.id).length} products
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section id="products-section" className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2 tracking-tight">
                  {selectedCategory 
                    ? `${categories.find(c => c.id === selectedCategory)?.name} Products`
                    : 'Featured Products'
                  }
                </h2>
                <p className="text-lg text-gray-600 font-medium">
                  {selectedCategory 
                    ? `Browse our ${categories.find(c => c.id === selectedCategory)?.name.toLowerCase()} selection`
                    : 'Hand-picked premium products from our farm to your table'
                  }
                </p>
              </div>
              {selectedCategory && (
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors duration-200 flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Show All Products</span>
                </button>
              )}
            </div>
          </div>
          
          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={onAddToCart}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No products found in this category.</p>
            </div>
          )}
        </div>
      </section>

      {/* About Section */}
      <section id="about-section" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              About {settings.farmName}
            </h2>
            {settings.farmDescription && (
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                {settings.farmDescription}
              </p>
            )}
            <div className="grid md:grid-cols-3 gap-8 mb-12">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                  </svg>
                </div>
                <h3 className="font-semibold text-lg text-gray-900 mb-2">Premium Quality</h3>
                <p className="text-gray-600">Carefully raised with the highest standards</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <h3 className="font-semibold text-lg text-gray-900 mb-2">Fresh Daily</h3>
                <p className="text-gray-600">Delivered fresh from farm to your door</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                  </svg>
                </div>
                <h3 className="font-semibold text-lg text-gray-900 mb-2">Family Owned</h3>
                <p className="text-gray-600">Proudly family owned and operated</p>
              </div>
            </div>
            <button
              className="px-8 py-3 text-lg font-semibold rounded-lg text-white transition-all duration-200 hover:opacity-90 shadow-md hover:shadow-lg transform hover:scale-105"
              style={{ backgroundColor: settings.primaryColor }}
            >
              Contact Us
            </button>
          </div>
        </div>
      </section>

      <Footer settings={settings} />
    </div>
  );
}