import { useState } from 'react';
import type { Product } from '../types/product';
import { WeightBinSelector } from './WeightBinSelector';

// Existing interface for ClassicTemplate compatibility
interface ClassicProductCardProps {
  product: Product;
  onAddToCart: (productId: string, quantity: number) => void;
  quantityInCart?: never;
  onRemoveFromCart?: never;
}

// New interface for ModernFarmTemplate
interface ModernProductCardProps {
  product: Product;
  quantityInCart: number;
  onAddToCart: () => void;
  onRemoveFromCart: () => void;
  primaryColor?: string;
  accentColor?: string;
}

type ProductCardProps = ClassicProductCardProps | ModernProductCardProps;

function isModernProps(props: ProductCardProps): props is ModernProductCardProps {
  return 'quantityInCart' in props && typeof props.quantityInCart === 'number';
}

export function ProductCard(props: ProductCardProps) {
  const { product } = props;

  if (!isModernProps(props)) {
    // Classic template product card
    const { onAddToCart } = props;

    return (
      <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
        <div className="relative overflow-hidden">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-48 object-cover transition-transform duration-300 hover:scale-105"
          />
          {!product.available && (
            <div className="absolute inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center">
              <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                Out of Stock
              </span>
            </div>
          )}
        </div>
        
        <div className="p-6">
          <h3 className="font-semibold text-lg text-gray-900 mb-2 line-height-tight">
            {product.name}
          </h3>
          <p className="text-gray-600 text-sm mb-4 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
          
          <div className="flex items-center justify-between mb-4">
            <div className="text-left">
              <span className="text-2xl font-bold text-gray-900">
                ${product.pricePer.toFixed(2)}
              </span>
              <span className="text-sm text-gray-500 ml-1">
                /{product.unit}
              </span>
            </div>
            {product.inventory && product.inventory > 0 && (
              <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {product.inventory} available
              </span>
            )}
          </div>
          
          <button
            onClick={() => onAddToCart(product.id, 1)}
            disabled={!product.available}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 transform ${
              product.available
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg active:scale-95'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {product.available ? (
              <span className="flex items-center justify-center">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                </svg>
                Add to Cart
              </span>
            ) : (
              'Out of Stock'
            )}
          </button>
        </div>
      </div>
    );
  } else {
    // Modern template product card
  const { quantityInCart, onAddToCart, onRemoveFromCart, primaryColor = '#0f6fff', accentColor = '#ffcc00' } = props;
  const price = (product.pricePer ?? 0);
  const [showBinSelector, setShowBinSelector] = useState(false);
  const hasBins = product.weightBins && product.weightBins.length > 0;

    return (
  <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200 group" style={{ borderColor: primaryColor + '22' }}>
        <div className="relative">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
          />
          {!product.available && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                Out of Stock
              </span>
            </div>
          )}
        </div>
        
        <div className="flex-1 p-4 flex flex-col">
          <h3 className="text-base font-semibold mb-1" style={{ color: primaryColor }}>
            {product.name}
          </h3>
          
          {product.description && (
            <p className="text-sm text-slate-600 mb-3 line-clamp-2 flex-1">
              {product.description}
            </p>
          )}
          
          {/* Show weight bin selector if product has bins */}
          {hasBins && showBinSelector ? (
            <div className="mt-auto">
              <WeightBinSelector
                bins={product.weightBins!}
                unit={product.unit}
                onSelect={() => {
                  onAddToCart();
                  setShowBinSelector(false);
                }}
                primaryColor={primaryColor}
              />
              <button
                onClick={() => setShowBinSelector(false)}
                className="w-full mt-2 px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between mt-auto">
              <div className="flex items-baseline gap-1">
                {hasBins ? (
                  <span className="text-sm font-medium text-slate-700">
                    Multiple sizes available
                  </span>
                ) : (
                  <>
                    <span className="text-lg font-bold" style={{ color: primaryColor }}>
                      ${price.toFixed(2)}
                    </span>
                    {product.unit && (
                      <span className="text-sm text-slate-500">
                        /{product.unit}
                      </span>
                    )}
                  </>
                )}
              </div>
              
            {product.available ? (
              <div className="flex items-center gap-2">
                {hasBins && quantityInCart === 0 ? (
                  <button
                    onClick={() => setShowBinSelector(true)}
                    className="px-4 py-2 text-white text-sm font-medium rounded-full transition-colors duration-200 shadow"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Select size
                  </button>
                ) : quantityInCart === 0 ? (
                  <button
                    onClick={onAddToCart}
                    className="px-4 py-2 text-white text-sm font-medium rounded-full transition-colors duration-200 shadow"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Add to cart
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onRemoveFromCart}
                      className="w-8 h-8 text-white rounded-full flex items-center justify-center transition-colors duration-200"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                    <span className="text-sm font-medium text-slate-900 min-w-[20px] text-center">
                      {quantityInCart}
                    </span>
                    <button
                      onClick={onAddToCart}
                      className="w-8 h-8 text-white rounded-full flex items-center justify-center transition-colors duration-200"
                      style={{ backgroundColor: accentColor }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <span className="text-sm text-slate-500">Out of stock</span>
            )}
            </div>
          )}
        </div>
      </div>
    );
  }
}