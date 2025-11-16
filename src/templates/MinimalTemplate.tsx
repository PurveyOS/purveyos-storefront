import { useState } from 'react';
import type { StorefrontTemplateProps } from '../types/storefront';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

export function MinimalTemplate({
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

  return (
    <div className="min-h-screen bg-white">
      <Navbar settings={settings} cart={cart} />
      
      {/* Minimal Hero */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl font-light text-gray-800 mb-4">
            {settings.farmName}
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            {settings.heroSubtitle}
          </p>
        </div>
      </section>

      {/* Simple Category Filter */}
      <section className="py-8 bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center flex-wrap gap-4">
            <button 
              onClick={() => setSelectedCategory(null)}
              className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                selectedCategory === null
                  ? 'text-gray-900 border-gray-900'
                  : 'text-gray-600 hover:text-gray-800 border-transparent hover:border-gray-300'
              }`}
            >
              All Products
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                  selectedCategory === category.id
                    ? 'border-gray-900'
                    : 'text-gray-600 hover:text-gray-800 border-transparent hover:border-gray-300'
                }`}
                style={{ 
                  color: selectedCategory === category.id ? settings.primaryColor : undefined,
                  borderColor: selectedCategory === category.id ? settings.primaryColor : undefined
                }}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Clean Product Grid */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {selectedCategory && (
            <div className="text-center mb-8">
              <h2 className="text-2xl font-light text-gray-800 mb-2">
                {categories.find(c => c.id === selectedCategory)?.name}
              </h2>
              <p className="text-gray-600">
                {categories.find(c => c.id === selectedCategory)?.description}
              </p>
            </div>
          )}
          
          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="group cursor-pointer"
                >
                  <div className="aspect-w-4 aspect-h-3 mb-4 overflow-hidden rounded-lg">
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="text-center">
                    <h3 className="font-medium text-lg text-gray-800 mb-2">
                      {product.name}
                    </h3>
                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                      {product.description}
                    </p>
                    <div className="mb-4">
                      <span className="text-xl font-light text-gray-900">
                        ${product.pricePer.toFixed(2)}/{product.unit}
                      </span>
                    </div>
                    <button
                      onClick={() => onAddToCart(product.id, 1)}
                      disabled={!product.available}
                      className={`px-6 py-2 border font-medium transition-colors duration-200 ${
                        product.available
                          ? 'border-gray-800 text-gray-800 hover:bg-gray-800 hover:text-white'
                          : 'border-gray-300 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {product.available ? 'Add to Cart' : 'Out of Stock'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No products found in this category.</p>
            </div>
          )}
        </div>
      </section>

      <Footer settings={settings} />
    </div>
  );
}