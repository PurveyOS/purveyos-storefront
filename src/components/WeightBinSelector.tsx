import React from 'react';

interface WeightBin {
  weightBtn: number;
  unitPriceCents: number;
  qty: number;
  reservedQty?: number; // Add reserved quantity
}

interface CartItem {
  productId: string;
  quantity: number;
  binWeight?: number;
  weight?: number;
}

interface WeightBinSelectorProps {
  bins: WeightBin[];
  unit: string;
  onSelect: (bin: { weightBtn: number; unitPriceCents: number }) => void;
  primaryColor?: string;
  productId?: string; // For cart tracking
  cart?: { items: CartItem[] }; // Current cart state
}

export function WeightBinSelector({ 
  bins, 
  unit, 
  onSelect,
  primaryColor = '#0f6fff',
  productId,
  cart
}: WeightBinSelectorProps) {
  // Maintain local optimistic state so badges decrement immediately on selection
  const [localBins, setLocalBins] = React.useState<WeightBin[]>(bins);

  // Sync local state when incoming bins change
  React.useEffect(() => {
    setLocalBins(bins);
  }, [bins]);

  // Calculate total weight already in cart for this product
  const totalWeightInCart = React.useMemo(() => {
    if (!cart || !productId) return 0;
    
    return cart.items
      .filter(item => item.productId === productId)
      .reduce((total, item) => {
        const weight = item.binWeight || item.weight || 0;
        return total + (weight * item.quantity);
      }, 0);
  }, [cart, productId]);

  // Compute sorted available bins
  const sortedBins = React.useMemo(() => {
    return [...localBins]
      .filter(b => {
        const available = (b.qty ?? 0) - (b.reservedQty ?? 0);
        return available > 0;
      })
      .sort((a, b) => a.weightBtn - b.weightBtn);
  }, [localBins]);

  return (
    <div className="space-y-3">
      {/* Cart total badge */}
      {totalWeightInCart > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
          <p className="text-xs text-green-700 font-medium">
            📦 In cart: <span className="font-bold">{totalWeightInCart.toFixed(1)} {unit}</span>
          </p>
        </div>
      )}
      
      <p className="text-sm font-medium text-slate-700 mb-1">
        Choose package size</p>
      <div className="grid grid-cols-2 gap-2">
  {sortedBins.map((bin) => {
          const pricePerUnit = bin.unitPriceCents / 100;
          const totalPrice = (bin.weightBtn * pricePerUnit).toFixed(2);
          const availableQty = (bin.qty ?? 0) - (bin.reservedQty ?? 0);
          
          return (
            <button
              key={`${bin.weightBtn}-${bin.unitPriceCents}`}
              onClick={() => {
                // Optimistically decrement local count
                setLocalBins(prev => prev.map(b => {
                  if (b.weightBtn === bin.weightBtn && b.unitPriceCents === bin.unitPriceCents) {
                    const currentQty = (b.qty ?? 0);
                    const currentReserved = (b.reservedQty ?? 0);
                    const available = currentQty - currentReserved;
                    // If available is positive, decrement qty; otherwise leave
                    if (available > 0) {
                      return { ...b, qty: Math.max(0, currentQty - 1) };
                    }
                  }
                  return b;
                }));
                onSelect({ weightBtn: bin.weightBtn, unitPriceCents: bin.unitPriceCents });
              }}
              disabled={availableQty <= 0}
              className="relative flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                borderColor: primaryColor,
                backgroundColor: '#fff',
              }}
            >
              <span className="text-lg font-bold" style={{ color: primaryColor }}>
                {bin.weightBtn} {unit}
              </span>
              <span className="text-sm text-slate-600">
                ${totalPrice}
              </span>
              <span className="text-xs text-slate-500">
                {availableQty} available
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
