import { useState } from 'react';
import type { Product } from '../types/product';
import { WeightBinSelector } from './WeightBinSelector';
import { isLowStock, formatRestockDate } from '../utils/inventory';

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
  onAddToCart: (weight?: number) => void;
  onRemoveFromCart: () => void;
  primaryColor?: string;
  accentColor?: string;
  onAddBinToCart?: (binWeight: number, unitPriceCents: number) => void;
  preOrdersEnabled?: boolean;
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
            loading="lazy"
            style={{ aspectRatio: '4/3' }}
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
  const [showWeightInput, setShowWeightInput] = useState(false);
  const [weightAmount, setWeightAmount] = useState<string>('1');
  const hasBins = product.weightBins && product.weightBins.length > 0;
  const isWeightBased = product.pricingMode === 'weight' && !hasBins;
  const isSoldOut = product.isSoldOut || !product.available;
  const canPreOrder = (props.preOrdersEnabled !== false) && isSoldOut && product.allowPreOrder;
  const showLowStock = !isSoldOut && isLowStock(product);
  const formattedRestockDate = formatRestockDate(product.restockDate);

    return (
  <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200 group" style={{ borderColor: primaryColor + '22' }}>
        <div className="relative">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
            loading="lazy"
            style={{ aspectRatio: '4/3' }}
          />
          {isSoldOut && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-center">
                <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                  Sold Out
                </span>
                {canPreOrder && (
                  <div className="mt-2">
                    <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-medium">
                      Pre-order Available
                    </span>
                  </div>
                )}
                {formattedRestockDate && (
                  <div className="mt-2 text-white text-xs bg-black/40 px-2 py-1 rounded">
                    Back: {formattedRestockDate}
                  </div>
                )}
              </div>
            </div>
          )}
          {showLowStock && (
            <div className="absolute top-2 right-2">
              <span className="bg-orange-500 text-white px-2 py-1 rounded-full text-xs font-medium shadow-lg">
                Low Stock
              </span>
            </div>
          )}
        </div>
        
        <div className="flex-1 p-4 flex flex-col">
          <h3 className="text-base font-semibold mb-1" style={{ color: primaryColor }}>
            {product.name}
          </h3>
          
          {product.description && (
            <p className="text-sm text-slate-600 mb-2 line-clamp-2">
              {product.description}
            </p>
          )}
          
          {product.specialNotes && (
            <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800 flex items-start gap-1">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{product.specialNotes}</span>
              </p>
            </div>
          )}
          
          {/* Show weight input for weight-based products */}
          {isWeightBased && showWeightInput ? (
            <div className="mt-auto space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Enter weight ({product.unit})
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={weightAmount}
                  onChange={(e) => setWeightAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-opacity-50"
                  placeholder="e.g., 2.5"
                />
                <p className="text-xs text-slate-500 mt-1">
                  ${price.toFixed(2)} × {weightAmount || 0} {product.unit} = ${(price * parseFloat(weightAmount || '0')).toFixed(2)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const weight = parseFloat(weightAmount);
                    if (weight > 0) {
                      onAddToCart(weight);
                      setShowWeightInput(false);
                      setWeightAmount('1');
                    }
                  }}
                  className="flex-1 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors duration-200"
                  style={{ backgroundColor: primaryColor }}
                >
                  Add to cart
                </button>
                <button
                  onClick={() => {
                    setShowWeightInput(false);
                    setWeightAmount('1');
                  }}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : hasBins && showBinSelector ? (
            <div className="mt-auto">
              <WeightBinSelector
                bins={product.weightBins!}
                unit={product.unit}
                onSelect={({ weightBtn, unitPriceCents }) => {
                  if (props.onAddBinToCart) {
                    props.onAddBinToCart(weightBtn, unitPriceCents);
                  } else {
                    onAddToCart();
                  }
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
              <div className="flex flex-col gap-1">
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
                {showLowStock && product.inventory && (
                  <span className="text-xs text-orange-600 font-medium">
                    Only {product.inventory} left
                  </span>
                )}
                {isSoldOut && product.allowPreOrder && props.preOrdersEnabled === false && (
                  <span className="text-xs text-slate-500">
                    Pre-order available on PRO plans
                  </span>
                )}
              </div>
              
            {!isSoldOut || canPreOrder ? (
              <div className="flex items-center gap-2">
                {hasBins && quantityInCart === 0 ? (
                  <button
                    onClick={() => setShowBinSelector(true)}
                    className="px-4 py-2 text-white text-sm font-medium rounded-full transition-colors duration-200 shadow"
                    style={{ backgroundColor: canPreOrder ? '#1e40af' : primaryColor }}
                  >
                    {canPreOrder ? 'Pre-order size' : 'Select size'}
                  </button>
                ) : hasBins ? (
                  <button
                    onClick={() => setShowBinSelector(true)}
                    className="px-4 py-2 text-white text-sm font-medium rounded-full transition-colors duration-200 shadow"
                    style={{ backgroundColor: canPreOrder ? '#1e40af' : primaryColor }}
                  >
                    {canPreOrder ? 'Pre-order more' : 'Add more sizes'}
                  </button>
                ) : isWeightBased && quantityInCart === 0 ? (
                  <button
                    onClick={() => setShowWeightInput(true)}
                    className="px-4 py-2 text-white text-sm font-medium rounded-full transition-colors duration-200 shadow"
                    style={{ backgroundColor: canPreOrder ? '#1e40af' : primaryColor }}
                  >
                    {canPreOrder ? 'Pre-order weight' : 'Enter weight'}
                  </button>
                ) : isWeightBased ? (
                  <button
                    onClick={() => setShowWeightInput(true)}
                    className="px-4 py-2 text-white text-sm font-medium rounded-full transition-colors duration-200 shadow"
                    style={{ backgroundColor: canPreOrder ? '#1e40af' : primaryColor }}
                  >
                    {canPreOrder ? 'Pre-order more' : 'Add more'}
                  </button>
                ) : quantityInCart === 0 ? (
                  <button
                    onClick={() => onAddToCart()}
                    className="px-4 py-2 text-white text-sm font-medium rounded-full transition-colors duration-200 shadow"
                    style={{ backgroundColor: canPreOrder ? '#1e40af' : primaryColor }}
                  >
                    {canPreOrder ? 'Pre-order' : 'Add to cart'}
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
                      onClick={() => onAddToCart()}
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
              <span className="text-sm text-slate-500">Sold out</span>
            )}
            </div>
          )}
        </div>
      </div>
    );
  }
}