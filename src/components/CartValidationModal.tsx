import { useState } from 'react';

interface RemovedItem {
  productId: string;
  productName: string;
  binWeight?: number;
  weight?: number;
  requestedWeightLbs?: number;
  lineType?: 'exact_package' | 'pack_for_you';
  variantUnit?: string;
  isEach?: boolean;
  canPreOrder?: boolean;
  available?: number;
  requested?: number;
}

interface CartValidationModalProps {
  removedItems: RemovedItem[];
  onConfirm: (itemsToPreOrder: string[]) => void;
  onCancel: () => void;
  primaryColor?: string;
}

export function CartValidationModal({ 
  removedItems, 
  onConfirm, 
  onCancel,
  primaryColor = '#0f6fff'
}: CartValidationModalProps) {
  const [selectedPreOrders, setSelectedPreOrders] = useState<Set<string>>(new Set());

  const togglePreOrder = (productId: string) => {
    setSelectedPreOrders(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const formatItemDisplay = (item: RemovedItem): string => {
    if (item.binWeight) {
      return item.isEach
        ? `${item.productName} (${item.binWeight} ${item.variantUnit || 'ea'})`
        : `${item.productName} (${item.binWeight} lb package)`;
    }
    if (item.lineType === 'pack_for_you' && item.requestedWeightLbs) {
      return `${item.productName} (${item.requestedWeightLbs} lb requested)`;
    }
    if (item.weight) {
      return `${item.productName} (${item.weight} lb)`;
    }
    return item.productName;
  };

  const preOrderableItems = removedItems.filter(item => item.canPreOrder);
  const unavailableItems = removedItems.filter(item => !item.canPreOrder);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            Items Removed from Cart
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Some items don't have enough inventory available
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Unavailable items (cannot pre-order) */}
          {unavailableItems.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Removed - Not Available
              </h3>
              <div className="space-y-2">
                {unavailableItems.map((item, idx) => (
                  <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {formatItemDisplay(item)}
                        </p>
                        {item.available !== undefined && item.requested !== undefined && (
                          <p className="text-xs text-gray-600 mt-1">
                            Only {item.available} available, you tried to add {item.requested}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pre-orderable items */}
          {preOrderableItems.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-blue-700 mb-2 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Available for Pre-Order
              </h3>
              <p className="text-xs text-gray-600 mb-3">
                Select items to keep in your cart as pre-orders. They'll be ready on the restock date.
              </p>
              <div className="space-y-2">
                {preOrderableItems.map((item, idx) => (
                  <div 
                    key={idx} 
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      selectedPreOrders.has(item.productId)
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => togglePreOrder(item.productId)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedPreOrders.has(item.productId)}
                        onChange={() => togglePreOrder(item.productId)}
                        className="mt-1 w-4 h-4 rounded border-gray-300 focus:ring-2"
                        style={{ 
                          accentColor: primaryColor,
                          color: primaryColor
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {formatItemDisplay(item)}
                        </p>
                        {item.available !== undefined && item.requested !== undefined && (
                          <p className="text-xs text-gray-600 mt-1">
                            Only {item.available} in stock, you tried to add {item.requested}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Continue Shopping
            </button>
            <button
              onClick={() => onConfirm(Array.from(selectedPreOrders))}
              className="flex-1 px-4 py-2 text-white rounded-lg hover:opacity-90 transition-all font-medium shadow-md"
              style={{ backgroundColor: primaryColor }}
            >
              {selectedPreOrders.size > 0 
                ? `Pre-Order ${selectedPreOrders.size} Item${selectedPreOrders.size > 1 ? 's' : ''}`
                : 'Continue'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
