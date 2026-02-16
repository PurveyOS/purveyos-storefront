// File: c:\dev\purveyos-storefront\src\components\BulkWeightOrder.tsx
// NEW COMPONENT for storefront bulk product ordering

import React, { useState } from 'react';
import toast from 'react-hot-toast';

interface BulkWeightOrderProps {
  product: any;  // Product with inventory_style, track_pack_count, avg_pack_weight
  bulkBin: any;  // PackageBin with qty, pack_qty, reservedQty, reservedPackQty
  pricePerLb: number;
  onAddToCart: (lineItem: any) => void;
}

/**
 * Storefront component for ordering bulk weight products
 * Allows ordering by weight (always) and by packs (if product has pack tracking)
 */
export function BulkWeightOrder({
  product,
  bulkBin,
  pricePerLb,
  onAddToCart,
}: BulkWeightOrderProps) {
  const [orderMode, setOrderMode] = useState<'weight' | 'packs'>('weight');
  const [enteredWeight, setEnteredWeight] = useState('');
  const [enteredPacks, setEnteredPacks] = useState('');
  const [adding, setAdding] = useState(false);

  // Calculate available inventory
  const availableLbs = Math.max(0, (bulkBin.qty || 0) - (bulkBin.reservedQty || 0));
  const availablePacks =
    product.track_pack_count && bulkBin.pack_qty !== null
      ? Math.max(0, (bulkBin.pack_qty || 0) - (bulkBin.reservedPackQty || 0))
      : null;

  const canOrderByPacks = availablePacks !== null && product.avg_pack_weight;

  const handleAddToCart = async () => {
    try {
      setAdding(true);

      if (orderMode === 'weight') {
        // Weight-based order
        const weight = parseFloat(enteredWeight);

        if (!weight || weight <= 0) {
          toast.error('Enter a weight greater than 0');
          return;
        }

        if (weight > availableLbs) {
          toast.error(`Not enough stock. Available: ${availableLbs.toFixed(2)} lbs`);
          return;
        }

        const estimatedCharge = weight * pricePerLb;

        onAddToCart({
          productId: product.id,
          weight,
          mode: 'weight',
          description: `${weight.toFixed(2)} lb(s)`,
          estimatedChargeCents: Math.round(estimatedCharge * 100),
        });

        toast.success('Added to cart');
        setEnteredWeight('');
      } else {
        // Pack-based order (with weight estimation)
        const packs = parseInt(enteredPacks);

        if (!packs || packs <= 0) {
          toast.error('Enter pack count greater than 0');
          return;
        }

        if (!canOrderByPacks) {
          toast.error('Pack ordering not available');
          return;
        }

        if (availablePacks && packs > availablePacks) {
          toast.error(`Not enough packs. Available: ${availablePacks}`);
          return;
        }

        const estimatedWeight = packs * product.avg_pack_weight;
        const estimatedCharge = estimatedWeight * pricePerLb;

        onAddToCart({
          productId: product.id,
          weight: estimatedWeight,
          packs,
          mode: 'packs',
          description: `${packs} pack(s) (~${estimatedWeight.toFixed(2)} lbs)`,
          estimatedChargeCents: Math.round(estimatedCharge * 100),
        });

        toast.success('Added to cart');
        setEnteredPacks('');
      }
    } catch (err) {
      console.error('[BulkOrder] Error:', err);
      toast.error('Failed to add to cart');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="border-t pt-4 space-y-4">
      <h3 className="font-semibold text-neutral-900">{product.name}</h3>

      {/* Stock display */}
      <div className="bg-blue-50 border border-blue-200 rounded p-3">
        <p className="text-sm text-blue-900">
          Available: <span className="font-bold">{availableLbs.toFixed(2)} lbs</span>
        </p>
        {availablePacks !== null && (
          <p className="text-xs text-blue-700 mt-1">
            Packs available: {availablePacks}
          </p>
        )}
      </div>

      {/* Order mode selector (if pack ordering available) */}
      {canOrderByPacks && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-neutral-700">
            How would you like to order?
          </legend>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`orderMode-${product.id}`}
              value="weight"
              checked={orderMode === 'weight'}
              onChange={(e) => setOrderMode(e.target.value as any)}
              disabled={adding}
            />
            <span className="text-sm">By weight (lbs)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`orderMode-${product.id}`}
              value="packs"
              checked={orderMode === 'packs'}
              onChange={(e) => setOrderMode(e.target.value as any)}
              disabled={adding}
            />
            <span className="text-sm">By packs ({product.avg_pack_weight} lb avg)</span>
          </label>
        </fieldset>
      )}

      {/* Weight input */}
      {orderMode === 'weight' ? (
        <div>
          <label htmlFor={`weight-${product.id}`} className="block text-sm font-semibold mb-1">
            Weight (lbs)
          </label>
          <input
            id={`weight-${product.id}`}
            type="number"
            step="0.01"
            min="0"
            max={availableLbs}
            value={enteredWeight}
            onChange={(e) => setEnteredWeight(e.target.value)}
            placeholder={`Up to ${availableLbs.toFixed(2)} lbs`}
            className="w-full px-3 py-2 border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
            disabled={adding}
          />
          {enteredWeight && (
            <p className="text-sm text-neutral-600 mt-1">
              Est. ${((parseFloat(enteredWeight) || 0) * pricePerLb).toFixed(2)}
            </p>
          )}
        </div>
      ) : (
        <div>
          <label htmlFor={`packs-${product.id}`} className="block text-sm font-semibold mb-1">
            Number of packs
          </label>
          <input
            id={`packs-${product.id}`}
            type="number"
            min="0"
            max={availablePacks || undefined}
            value={enteredPacks}
            onChange={(e) => setEnteredPacks(e.target.value)}
            placeholder={`Up to ${availablePacks} packs`}
            className="w-full px-3 py-2 border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
            disabled={adding}
          />
          {enteredPacks && (
            <>
              <p className="text-sm text-neutral-600 mt-1">
                Est. weight: {((parseInt(enteredPacks) || 0) * product.avg_pack_weight).toFixed(2)} lbs
              </p>
              <p className="text-sm text-neutral-600">
                Est. ${(((parseInt(enteredPacks) || 0) * product.avg_pack_weight) * pricePerLb).toFixed(2)}
              </p>
            </>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Pack weight varies. Final weight will be confirmed at pickup/delivery.
          </p>
        </div>
      )}

      {/* Add to cart button */}
      <button
        onClick={handleAddToCart}
        disabled={
          adding ||
          (orderMode === 'weight' ? !enteredWeight : !enteredPacks)
        }
        className="w-full bg-orange-600 text-white font-semibold py-2 rounded hover:bg-orange-700 disabled:bg-neutral-400 transition-colors"
      >
        {adding ? 'Adding...' : 'Add to Cart'}
      </button>
    </div>
  );
}
