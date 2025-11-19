import { useState } from "react";
import type { Product } from "../types/product";
import { WeightBinSelector } from "./WeightBinSelector";
import { isLowStock, formatRestockDate } from "../utils/inventory";

// Classic template props
interface ClassicProductCardProps {
  product: Product;
  onAddToCart: (productId: string, quantity: number) => void;
  quantityInCart?: never;
  onRemoveFromCart?: never;
  onAddBinToCart?: never;
  primaryColor?: never;
  accentColor?: never;
  preOrdersEnabled?: never;
}

// Modern template props
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
  return "quantityInCart" in props && typeof props.quantityInCart === "number";
}

export function ProductCard(props: ProductCardProps) {
  const { product } = props;

  // =========================
  // CLASSIC TEMPLATE VERSION
  // =========================
  if (!isModernProps(props)) {
    const { onAddToCart } = props;

    return (
      <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
        <div className="relative overflow-hidden">
          {product.imageUrl && (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-32 sm:h-36 md:h-40 object-cover transition-transform duration-300 group-hover:scale-[1.05]"
              loading="lazy"
            />
          )}
          {!product.available && (
            <div className="absolute inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center">
              <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                Out of Stock
              </span>
            </div>
          )}
        </div>

        <div className="p-6">
          <h3
            className="text-base font-semibold mb-1 line-clamp-2"
            style={{ color: String(product.available ? "#0f6fff" : "#999") }}
          >
            {product.name}
          </h3>

          {product.description && (
            <p className="text-gray-600 text-sm mb-4 line-clamp-2 leading-relaxed">
              {product.description}
            </p>
          )}

          <div className="flex items-center justify-between mb-4">
            <div className="text-left">
              <span className="text-2xl font-bold text-gray-900">
                ${product.pricePer.toFixed(2)}
              </span>
              {product.unit && (
                <span className="text-sm text-gray-500 ml-1">/{product.unit}</span>
              )}
            </div>
            {product.inventory !== undefined && product.inventory > 0 && (
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
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg active:scale-95"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            {product.available ? (
              <span className="flex items-center justify-center">
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
                Add to Cart
              </span>
            ) : (
              "Out of Stock"
            )}
          </button>
        </div>
      </div>
    );
  }

  // =========================
  // MODERN TEMPLATE VERSION
  // =========================
  const {
    quantityInCart,
    onAddToCart,
    onRemoveFromCart,
    primaryColor = "#0f6fff",
    accentColor = "#ffcc00",
    onAddBinToCart,
    preOrdersEnabled,
  } = props;

  const price = product.pricePer ?? 0;
  const [weightAmount, setWeightAmount] = useState<string>("1");
  const [fixedQty, setFixedQty] = useState<number>(1);
  const [showBinModal, setShowBinModal] = useState(false);

  // Your rule: unit drives behavior
  const unit = (product.unit || "").toLowerCase();
  const isEachUnit = unit === "ea"; // fixed-price
  const isPoundUnit = unit === "lb"; // weight-based

  // Only treat bins as size options for lb items
  const hasBins =
    isPoundUnit && !!(product.weightBins && product.weightBins.length > 0);

  // Fallback pricing mode based on unit if not explicitly set
  const pricingMode =
    product.pricingMode ?? (isPoundUnit ? "weight" : "fixed");

  const isWeightBased = pricingMode === "weight";
  const isFixedPrice = pricingMode === "fixed";

  const isSoldOut =
    product.isSoldOut ||
    !product.available ||
    (product.inventory !== undefined && product.inventory <= 0);

  const canPreOrder =
    (preOrdersEnabled !== false) && isSoldOut && product.allowPreOrder;

  const showLowStock = !isSoldOut && isLowStock(product);
  const formattedRestockDate = formatRestockDate(product.restockDate);

  const handleAddFixedToCart = () => {
    if (fixedQty <= 0) return;
    onAddToCart({ quantity: fixedQty });
    setFixedQty(1);
  };

  const handleAddWeightPreorder = () => {
    const weight = parseFloat(weightAmount);
    if (!weight || weight <= 0) return;
    onAddToCart({ weight });
    setWeightAmount("1");
  };

  const handleAddWeightInStock = () => {
    const weight = parseFloat(weightAmount);
    if (!weight || weight <= 0) return;
    onAddToCart({ weight });
    setWeightAmount("1");
  };

  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200 group"
      style={{ borderColor: primaryColor + "22" }}
    >
      {/* IMAGE + BADGES */}
      <div className="relative">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-32 sm:h-36 md:h-40 object-cover transition-transform duration-300 group-hover:scale-[1.05]"
            loading="lazy"
          />
        )}

        {/* Sold out / preorder badges */}
        {isSoldOut && (
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <span className="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-medium">
              Sold Out
            </span>
            {canPreOrder && (
              <span className="bg-gold-600 text-black px-2 py-1 rounded-full text-[11px] font-medium">
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
        <h3
          className="text-base font-semibold mb-1 line-clamp-2"
          style={{ color: primaryColor }}
        >
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

        {/* PRICE DISPLAY */}
        <div className="mb-2">
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold" style={{ color: primaryColor }}>
              ${price.toFixed(2)}
            </span>
            {product.unit && (
              <span className="text-sm text-slate-500">/{product.unit}</span>
            )}
          </div>
          {showLowStock && product.inventory !== undefined && (
            <span className="text-xs text-orange-600 font-medium">
              Only {product.inventory} left
            </span>
          )}
        </div>

        {/* ACTION AREA */}
        <div className="mt-auto space-y-2">
          {/* ========================= */}
          {/* WEIGHT-BASED (lb) PRODUCTS */}
          {/* ========================= */}
          {isWeightBased && isPoundUnit && (
            <>
              {isSoldOut ? (
                canPreOrder ? (
                  // SOLD OUT + PREORDER → weight input as default
                  <div className="space-y-2">
                    <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1">
                      This item is sold out, but you can request a weight to pre-order.
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Enter requested weight (lb)
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
                        ${price.toFixed(2)} × {weightAmount || 0} lb = $
                        {(price * parseFloat(weightAmount || "0")).toFixed(2)}
                      </p>
                    </div>
                    <button
                      onClick={handleAddWeightPreorder}
                      className="w-full px-3 py-2 text-white text-sm font-medium rounded-lg shadow transition"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Pre-Order
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-red-600 font-medium">
                    Out Of Stock
                  </span>
                )
              ) : hasBins ? (
                // IN STOCK + BINS → "Choose Package Size" button + modal
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowBinModal(true)}
                    className="w-full px-3 py-2 text-white text-sm font-medium rounded-lg shadow transition"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Choose Package Size
                  </button>
                  <p className="text-xs text-slate-500">
                    Multiple package sizes available
                  </p>

                  {/* Bin selector modal */}
                  {showBinModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                      <div className="bg-white rounded-xl shadow-lg max-w-sm w-full mx-4 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-slate-900">
                            Choose package size
                          </h4>
                          <button
                            type="button"
                            onClick={() => setShowBinModal(false)}
                            className="text-slate-500 hover:text-slate-700 text-sm"
                          >
                            ✕
                          </button>
                        </div>
                        <WeightBinSelector
                          bins={product.weightBins!}
                          unit={product.unit}
                          primaryColor={primaryColor}
                          onSelect={({ weightBtn, unitPriceCents }) => {
                            if (onAddBinToCart) {
                              onAddBinToCart(weightBtn, unitPriceCents);
                            } else {
                              onAddToCart({ quantity: 1 });
                            }
                            setShowBinModal(false);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // IN STOCK, NO BINS → manual weight entry
                <div className="space-y-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Enter weight (lb)
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
                      ${price.toFixed(2)} × {weightAmount || 0} lb = $
                      {(price * parseFloat(weightAmount || "0")).toFixed(2)}
                    </p>
                  </div>
                  <button
                    onClick={handleAddWeightInStock}
                    className="w-full px-3 py-2 text-white text-sm font-medium rounded-lg shadow transition"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Add to Cart
                  </button>
                </div>
              )}
            </>
          )}

          {/* ========================= */}
          {/* FIXED-PRICE (ea) PRODUCTS */}
          {/* ========================= */}
          {isFixedPrice && isEachUnit && (
            <>
              {isSoldOut ? (
                canPreOrder ? (
                  <div className="space-y-2">
                    <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1">
                      This item is sold out, but you can pre-order by quantity.
                    </p>
                    <button
                      onClick={() => onAddToCart({ quantity: 1 })}
                      className="w-full mt-1 px-3 py-2 text-white text-sm font-medium rounded-lg shadow transition"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Pre-Order 1
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-red-600 font-medium">
                    Out Of Stock
                  </span>
                )
              ) : (
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

              {/* Quantity controls for fixed items already in cart */}
              {!isSoldOut && quantityInCart > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={onRemoveFromCart}
                    className="w-8 h-8 text-white rounded-full flex items-center justify-center"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20 12H4"
                      />
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
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
