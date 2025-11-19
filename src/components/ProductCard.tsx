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
  onAddToCart: (options?: { weight?: number; quantity?: number }) => void;
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

  // ===== CLASSIC TEMPLATE =====
  if (!isModernProps(props)) {
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
          <h3 className="font-semibold text-lg text-gray-900 mb-2">
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
  }

  // ===== MODERN TEMPLATE =====
  const {
    quantityInCart,
    onAddToCart,
    onRemoveFromCart,
    primaryColor = '#0f6fff',
    accentColor = '#ffcc00',
  } = props;

  const price = product.pricePer ?? 0;

  const [showBinSelector, setShowBinSelector] = useState(false);
  const [showWeightInput, setShowWeightInput] = useState(false);
  const [weightAmount, setWeightAmount] = useState<string>('1');
  const [fixedQty, setFixedQty] = useState<number>(1);

  const hasBins = product.weightBins && product.weightBins.length > 0;
  const isWeightBased = product.pricingMode === 'weight' && !hasBins;
  const isFixedPrice = !hasBins && !isWeightBased;

  const isSoldOut =
    product.isSoldOut ||
    !product.available ||
    (product.inventory !== undefined && product.inventory <= 0);

  const canPreOrder =
    (props.preOrdersEnabled !== false) && isSoldOut && product.allowPreOrder;

  const showLowStock = !isSoldOut && isLowStock(product);
  const formattedRestockDate = formatRestockDate(product.restockDate);

  const handleAddFixedToCart = () => {
    if (fixedQty <= 0) return;
    onAddToCart({ quantity: fixedQty });
    setFixedQty(1);
  };

  const handleAddWeightToCart = () => {
    const weight = parseFloat(weightAmount);
    if (!weight || weight <= 0) return;
    onAddToCart({ weight });
    setShowWeightInput(false);
    setWeightAmount('1');
  };

  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200 group"
      style={{ borderColor: primaryColor + '22' }}
    >
      {/* IMAGE + BADGES */}
      <div className="relative">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="h-36 w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
          loading="lazy"
          style={{ aspectRatio: '4/3' }}
        />

        {/* Sold out / preorder badges (don’t block clicks) */}
        {isSoldOut && (
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <span className="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-medium">
              Sold Out
            </span>
            {canPreOrder && (
              <span className="bg-blue-600 text-white px-2 py-1 rounded-full text-[11px] font-medium">
                Pre-order Available
              </span>
            )}
            {formattedRestockDate && (
              <span className="bg-black/60 text-white px-2 py-1 rounded text-[11px]">
                Back: {formattedRestockDate}
              </span>
            )}
          </div>
        )}

        {showLowStock && (
          <div className="absolute top-2 right-2">
            <span className="bg-orange-500 text-white px-2 py-1 rounded-full text-xs font-medium shadow-lg">
              Low Stock
            </span>
          </div>
        )}

        {hasBins && !isSoldOut && (
          <div className="absolute bottom-2 left-2 bg-white/85 backdrop-blur px-2 py-1 rounded text-[11px] font-medium text-slate-600 shadow-sm">
            Multiple sizes available
          </div>
        )}
      </div>

      {/* CONTENT */}
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
              <svg
                className="w-4 h-4 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{product.specialNotes}</span>
            </p>
          </div>
        )}

        {/* WEIGHT-BASED: manual weight entry */}
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
                ${price.toFixed(2)} × {weightAmount || 0} {product.unit} = $
                {(price * parseFloat(weightAmount || '0')).toFixed(2)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddWeightToCart}
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
          // WEIGHT-BIN PRODUCTS
          <div className="mt-auto">
            <WeightBinSelector
              bins={product.weightBins!}
              unit={product.unit}
              onSelect={({ weightBtn, unitPriceCents }) => {
                if (props.onAddBinToCart) {
                  props.onAddBinToCart(weightBtn, unitPriceCents);
                } else {
                  onAddToCart({ quantity: 1 });
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
          // DEFAULT / FIXED-PRICE UI
          <div className="mt-auto space-y-2">
            {/* Price */}
            {!hasBins && (
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold" style={{ color: primaryColor }}>
                  ${price.toFixed(2)}
                </span>
                {product.unit && isWeightBased && (
                  <span className="text-sm text-slate-500">/{product.unit}</span>
                )}
              </div>
            )}

            {showLowStock && product.inventory && (
              <span className="text-xs text-orange-600 font-medium">
                Only {product.inventory} left
              </span>
            )}

            {/* Action area */}
            <div className="space-y-2">
              {/* Sold out states */}
              {isSoldOut && !canPreOrder && (
                <span className="text-sm text-red-600 font-medium">Out Of Stock</span>
              )}

              {isSoldOut && canPreOrder && (
                <div className="space-y-2">
                  <span className="text-sm text-blue-700 font-medium">
                    Available for pre-order
                  </span>
                  <button
                    onClick={() => onAddToCart({ quantity: 1 })}
                    className="w-full mt-1 px-3 py-2 text-white text-sm font-medium rounded-lg shadow transition"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Pre-Order
                  </button>
                </div>
              )}

              {/* Available states */}
              {!isSoldOut && (
                <>
                  {/* Bin products – choose size */}
                  {hasBins && quantityInCart === 0 && (
                    <button
                      onClick={() => setShowBinSelector(true)}
                      className="w-full mt-1 px-3 py-2 text-white text-sm font-medium rounded-lg shadow transition"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Select Size
                    </button>
                  )}
                  {hasBins && quantityInCart > 0 && (
                    <button
                      onClick={() => setShowBinSelector(true)}
                      className="w-full mt-1 px-3 py-2 text-white text-sm font-medium rounded-lg shadow transition"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Add More Sizes
                    </button>
                  )}

                  {/* Weight-based – show button to open weight input */}
                  {isWeightBased && (
                    <button
                      onClick={() => setShowWeightInput(true)}
                      className="w-full mt-1 px-3 py-2 text-white text-sm font-medium rounded-lg shadow transition"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {quantityInCart === 0 ? 'Enter Weight' : 'Add More Weight'}
                    </button>
                  )}

                  {/* Fixed-price products – quantity selector + Add to Cart */}
                  {isFixedPrice && (
                    <div className="space-y-2">
                      <div className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-1">
                        <button
                          type="button"
                          className="px-2 text-sm"
                          onClick={() =>
                            setFixedQty((q) => (q > 1 ? q - 1 : 1))
                          }
                        >
                          -
                        </button>
                        <span className="px-3 text-sm font-medium">{fixedQty}</span>
                        <button
                          type="button"
                          className="px-2 text-sm"
                          onClick={() =>
                            setFixedQty((q) => (q < 99 ? q + 1 : 99))
                          }
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={handleAddFixedToCart}
                        className="w-full mt-1 px-3 py-2 text-white text-sm font-medium rounded-lg shadow transition"
                        style={{ backgroundColor: primaryColor }}
                      >
                        Add to Cart
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Quantity controls for already-in-cart fixed products */}
            {!isSoldOut && isFixedPrice && quantityInCart > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={onRemoveFromCart}
                  className="w-8 h-8 text-white rounded-full flex items-center justify-center"
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
                  onClick={() => onAddToCart({ quantity: 1 })}
                  className="w-8 h-8 text-white rounded-full flex items-center justify-center"
                  style={{ backgroundColor: accentColor }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
