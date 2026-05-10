import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { WeightBinSelector } from '../components/WeightBinSelector';
import { useTenantFromDomain } from '../hooks/useTenantFromDomain';
import { useStorefrontData } from '../hooks/useStorefrontData';
import { trackProductView } from '../utils/analytics';
import { formatRestockDate } from '../utils/inventory';

export function ProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const { tenant } = useTenantFromDomain();
  const { data: storefrontData, loading, error } = useStorefrontData(tenant?.id || '');
  const { addToCart, cart } = useCart();
  const [fixedQuantity, setFixedQuantity] = useState<number>(1);
  const [weightAmount, setWeightAmount] = useState<string>('1');
  const [showBinModal, setShowBinModal] = useState(false);

  useEffect(() => {
    if (!productId) return;
    const product = storefrontData?.products.find(p => p.id === productId);
    trackProductView({
      productId,
      name: product?.name,
      price: product?.pricePer,
      category: (product as any)?.category || (product as any)?.categoryId,
      tenantId: tenant?.id,
    });
  }, [productId, storefrontData?.products, tenant?.id]);

  const primaryColor = storefrontData?.settings.primaryColor || '#0f6fff';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"
            style={{ borderColor: primaryColor }}
          ></div>
          <p className="mt-4 text-gray-600">Loading product...</p>
        </div>
      </div>
    );
  }

  if (error || !storefrontData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-xl w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
          <h1 className="text-2xl font-semibold text-gray-900">Product unavailable</h1>
          <p className="text-gray-600">
            We couldn&apos;t load this product right now.
          </p>
          <Link
            to="/"
            className="inline-flex items-center px-4 py-2 text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            Back to Store
          </Link>
        </div>
      </div>
    );
  }

  const product = storefrontData.products.find((item) => item.id === productId);

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-xl w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
          <h1 className="text-2xl font-semibold text-gray-900">Product not found</h1>
          <p className="text-gray-600">
            That product is no longer available in this storefront.
          </p>
          <Link
            to="/"
            className="inline-flex items-center px-4 py-2 text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            Back to Store
          </Link>
        </div>
      </div>
    );
  }

  const isSoldOut =
    product.isSoldOut ||
    !product.available ||
    (product.inventory !== undefined && product.inventory <= 0);
  const canPreOrder = isSoldOut && product.allowPreOrder;
  const formattedRestockDate = formatRestockDate(product.restockDate);
  const relatedProducts = storefrontData.products
    .filter((item) => item.id !== product.id && item.categoryId === product.categoryId)
    .slice(0, 3);
  const unit = (product.unit || '').toLowerCase();
  const pricingMode = product.pricingMode ?? (unit === 'lb' ? 'weight' : 'fixed');
  const hasBulkBin = (product.weightBins || []).some((bin) => bin.binKind === 'bulk_weight');
  const hasBins = unit === 'lb' && (product.weightBins || []).some((bin) => bin.binKind !== 'bulk_weight');
  const legacyBins = (product.weightBins || []).filter((bin) => bin.binKind !== 'bulk_weight');
  const effectiveOrderMode = hasBulkBin
    ? 'pack_for_you'
    : (storefrontData.tenantDefaultOrderMode ?? 'exact_package');
  const isWeightBased = pricingMode === 'weight';

  const handleAddToCart = () => {
    if (isWeightBased) {
      const parsedAmount = Number(weightAmount);

      if (!parsedAmount || parsedAmount <= 0) {
        return;
      }

      if (effectiveOrderMode === 'pack_for_you') {
        addToCart(product.id, 1, {
          requestedWeightLbs: parsedAmount,
          lineType: 'pack_for_you',
          isPreOrder: canPreOrder,
        });
        return;
      }

      addToCart(product.id, 1, {
        weight: parsedAmount,
        isPreOrder: canPreOrder,
      });
      return;
    }

    if (!fixedQuantity || fixedQuantity <= 0) {
      return;
    }

    addToCart(product.id, fixedQuantity, {
      isPreOrder: canPreOrder,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 md:py-12">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/"
              className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← Back to Store
            </Link>
            <Link
              to="/cart"
              className="inline-flex items-center px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              View Cart
            </Link>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.05fr,0.95fr] items-start">
            <div className="overflow-hidden rounded-3xl bg-white border border-gray-200 shadow-sm">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full aspect-[4/3] object-cover"
                />
              ) : (
                <div className="aspect-[4/3] flex items-center justify-center bg-gray-100 text-gray-400">
                  <span className="text-7xl font-semibold">{product.name.charAt(0)}</span>
                </div>
              )}
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 md:p-8 space-y-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {product.categoryId && (
                    <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                      {product.categoryId}
                    </span>
                  )}
                  {isSoldOut ? (
                    <span className="px-3 py-1 rounded-full bg-red-100 text-red-700">
                      {canPreOrder ? 'Available for pre-order' : 'Sold out'}
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">
                      Available now
                    </span>
                  )}
                </div>

                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold text-gray-900">
                    {product.name}
                  </h1>
                  <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2">
                    <span className="text-3xl font-bold" style={{ color: primaryColor }}>
                      ${product.pricePer.toFixed(2)}
                    </span>
                    {product.unit && (
                      <span className="text-base text-gray-500">/{product.unit}</span>
                    )}
                    {product.variantSize && (
                      <span className="text-sm text-gray-500">
                        {product.variantSize}{product.variantUnit ? ` ${product.variantUnit}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Availability</p>
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    {isSoldOut
                      ? canPreOrder
                        ? 'Currently sold out, but customers can still pre-order.'
                        : 'Currently out of stock.'
                      : product.inventory !== undefined
                        ? `${product.inventory} available`
                        : 'In stock'}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Ordering</p>
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    {isWeightBased
                      ? effectiveOrderMode === 'pack_for_you'
                        ? 'Packed to requested weight'
                        : hasBins && !isSoldOut
                          ? 'Exact package selection'
                          : 'Sold by weight'
                      : 'Sold by unit'}
                  </p>
                </div>
              </div>

              {formattedRestockDate && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                  <p className="text-sm font-medium">Expected back: {formattedRestockDate}</p>
                </div>
              )}

              {product.specialNotes && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Special notes</p>
                  <p className="mt-2 text-sm text-slate-700 whitespace-pre-line">{product.specialNotes}</p>
                </div>
              )}

              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">Description</h2>
                <p className="text-gray-600 leading-7 whitespace-pre-line">
                  {product.description || 'No description has been added for this product yet.'}
                </p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Add to cart</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {isWeightBased
                      ? effectiveOrderMode === 'pack_for_you'
                        ? 'Choose how many pounds you want and we will pack the closest available weight.'
                        : hasBins && !isSoldOut
                          ? 'Choose an exact package from the available inventory.'
                          : 'Choose how many pounds you want to add to your cart.'
                      : 'Choose a quantity and add this product to your cart.'}
                  </p>
                </div>

                {isWeightBased && effectiveOrderMode !== 'pack_for_you' && !isSoldOut && hasBins ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowBinModal(true)}
                      className="inline-flex items-center justify-center rounded-lg px-5 py-3 font-medium text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Choose Package Size
                    </button>

                    {showBinModal && (
                      <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                        onClick={() => setShowBinModal(false)}
                      >
                        <div
                          className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-900">Choose package size</h3>
                            <button
                              type="button"
                              onClick={() => setShowBinModal(false)}
                              className="text-sm text-gray-500 hover:text-gray-700"
                            >
                              X
                            </button>
                          </div>
                          <WeightBinSelector
                            bins={legacyBins}
                            unit={product.unit}
                            primaryColor={primaryColor}
                            productId={product.id}
                            cart={cart}
                            onSelect={({ weightBtn, unitPriceCents }) => {
                              addToCart(product.id, 1, { binWeight: weightBtn, unitPriceCents });
                              setShowBinModal(false);
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : isWeightBased ? (
                  <div className="space-y-2">
                    <label htmlFor="productWeightAmount" className="text-sm font-medium text-gray-700">
                      {effectiveOrderMode === 'pack_for_you' ? 'Requested pounds' : 'Weight'}
                    </label>
                    <div className="flex gap-3">
                      <input
                        id="productWeightAmount"
                        type="number"
                        min={effectiveOrderMode === 'pack_for_you' ? '1' : '0.25'}
                        step={effectiveOrderMode === 'pack_for_you' ? '1' : '0.25'}
                        value={weightAmount}
                        onChange={(event) => setWeightAmount(event.target.value)}
                        className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200"
                      />
                      <span className="self-center text-sm text-gray-500">lb</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor="productQuantity" className="text-sm font-medium text-gray-700">
                      Quantity
                    </label>
                    <input
                      id="productQuantity"
                      type="number"
                      min="1"
                      step="1"
                      value={fixedQuantity}
                      onChange={(event) => setFixedQuantity(Math.max(1, Number(event.target.value) || 1))}
                      className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200"
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={isSoldOut && !canPreOrder}
                    className="inline-flex items-center justify-center rounded-lg px-5 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-gray-300"
                    style={{ backgroundColor: isSoldOut && !canPreOrder ? undefined : primaryColor }}
                  >
                    {canPreOrder ? 'Pre-Order Item' : 'Add to Cart'}
                  </button>
                  <Link
                    to="/cart"
                    className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    Go to Cart
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {relatedProducts.length > 0 && (
            <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 md:p-8 space-y-5">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">More in this category</h2>
                <p className="mt-1 text-gray-600">Browse a few other items from the same section of the storefront.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {relatedProducts.map((item) => (
                  <Link
                    key={item.id}
                    to={`/product/${encodeURIComponent(item.id)}`}
                    className="group overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 hover:bg-white hover:shadow-sm transition-all"
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-44 object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="h-44 flex items-center justify-center bg-gray-100 text-gray-400 text-5xl font-semibold">
                        {item.name.charAt(0)}
                      </div>
                    )}
                    <div className="p-4">
                      <p className="font-semibold text-gray-900">{item.name}</p>
                      <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                        {item.description || 'View product details'}
                      </p>
                      <p className="mt-3 text-sm font-medium" style={{ color: primaryColor }}>
                        ${item.pricePer.toFixed(2)}{item.unit ? ` / ${item.unit}` : ''}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}