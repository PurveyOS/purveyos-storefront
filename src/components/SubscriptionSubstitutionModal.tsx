import { useState, useEffect } from 'react';

interface SubstitutionItem {
  productId: string;
  productName: string;
  requiredQuantity: number;
  unit: string;
  substitutionGroup?: string;
}

interface SubscriptionSubstitutionModalProps {
  subscriptionName: string;
  items: SubstitutionItem[];
  onConfirm: (selections: Record<string, number>) => void; // productId -> quantity
  onCancel: () => void;
}

export default function SubscriptionSubstitutionModal({
  subscriptionName,
  items,
  onConfirm,
  onCancel,
}: SubscriptionSubstitutionModalProps) {
  // State: productId -> selected quantity
  const [selections, setSelections] = useState<Record<string, number>>({});

  // Group items by substitution group
  const substitutionGroups = Array.from(
    new Set(items.filter(item => item.substitutionGroup).map(item => item.substitutionGroup as string))
  );
  
  const ungroupedItems = items.filter(item => !item.substitutionGroup);

  // Check if a substitution group has enough selected
  const isGroupFulfilled = (groupName: string): boolean => {
    const groupItems = items.filter(item => item.substitutionGroup === groupName);
    const totalSelected = groupItems.reduce((sum, item) => {
      return sum + (selections[item.productId] || 0);
    }, 0);
    
    // Group is fulfilled if at least one item has a selection > 0
    return groupItems.some(item => (selections[item.productId] || 0) > 0);
  };

  // Check if all substitution groups are fulfilled
  const allGroupsFulfilled = substitutionGroups.every(group => isGroupFulfilled(group));

  const handleQuantityChange = (productId: string, delta: number) => {
    setSelections(prev => {
      const current = prev[productId] || 0;
      const newValue = Math.max(0, current + delta);
      return {
        ...prev,
        [productId]: newValue
      };
    });
  };

  const handleConfirm = () => {
    if (!allGroupsFulfilled) {
      alert('Please select at least one option from each product group');
      return;
    }
    onConfirm(selections);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 border-b px-6 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-t-lg">
          <h2 className="text-xl font-bold">🔄 Choose Your Products</h2>
          <p className="text-sm text-blue-50 mt-1">{subscriptionName}</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <span className="font-semibold">💡 Select your preferences</span> - Choose what you'd like in each delivery. You can select one option or a mixture from each group below.
            </p>
          </div>

          {/* Substitution Groups */}
          {substitutionGroups.map(groupName => {
            const groupItems = items.filter(item => item.substitutionGroup === groupName);
            const groupFulfilled = isGroupFulfilled(groupName);
            
            return (
              <div key={groupName} className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-5 border-2 border-purple-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg text-purple-900">{groupName}</h3>
                  <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                    groupFulfilled
                      ? 'bg-green-100 text-green-800'
                      : 'bg-orange-100 text-orange-800'
                  }`}>
                    {groupFulfilled ? '✓ Selected' : 'Select one or more'}
                  </span>
                </div>
                
                <p className="text-sm text-purple-700 mb-4">
                  Choose one product or a mixture to reach your desired amount
                </p>

                <div className="space-y-3">
                  {groupItems.map(item => {
                    const selected = selections[item.productId] || 0;
                    
                    return (
                      <div key={item.productId} className="bg-white rounded-lg p-4 border border-purple-100 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900">{item.productName}</h4>
                            <p className="text-sm text-gray-600">
                              Available: {item.requiredQuantity} {item.unit} per delivery
                            </p>
                            {selected > 0 && (
                              <p className="text-sm font-medium text-purple-600 mt-1">
                                Selected: {selected} {item.unit}
                              </p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleQuantityChange(item.productId, -1)}
                              disabled={selected === 0}
                              className="w-8 h-8 rounded-full border-2 border-purple-300 text-purple-600 font-bold hover:bg-purple-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                              −
                            </button>
                            <span className="w-12 text-center font-semibold text-lg">
                              {selected}
                            </span>
                            <button
                              onClick={() => handleQuantityChange(item.productId, 1)}
                              disabled={selected >= item.requiredQuantity}
                              className="w-8 h-8 rounded-full border-2 border-purple-300 text-purple-600 font-bold hover:bg-purple-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Ungrouped Items (if any) */}
          {ungroupedItems.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
              <h3 className="font-semibold text-lg text-gray-900 mb-4">Additional Items</h3>
              <div className="space-y-3">
                {ungroupedItems.map(item => {
                  const selected = selections[item.productId] || 0;
                  
                  return (
                    <div key={item.productId} className="bg-white rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{item.productName}</h4>
                          <p className="text-sm text-gray-600">
                            {item.requiredQuantity} {item.unit}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleQuantityChange(item.productId, -1)}
                            disabled={selected === 0}
                            className="w-8 h-8 rounded-full border-2 border-gray-300 text-gray-600 font-bold hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                          >
                            −
                          </button>
                          <span className="w-12 text-center font-semibold text-lg">
                            {selected}
                          </span>
                          <button
                            onClick={() => handleQuantityChange(item.productId, 1)}
                            disabled={selected >= item.requiredQuantity}
                            className="w-8 h-8 rounded-full border-2 border-gray-300 text-gray-600 font-bold hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="sticky bottom-0 border-t bg-white px-6 py-4 flex gap-3 rounded-b-lg">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!allGroupsFulfilled}
            className={`flex-1 px-4 py-3 rounded-lg font-semibold text-white transition-colors ${
              allGroupsFulfilled
                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {allGroupsFulfilled ? 'Continue to Cart' : 'Select Products First'}
          </button>
        </div>
      </div>
    </div>
  );
}
