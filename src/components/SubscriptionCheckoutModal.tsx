import { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';

interface SubstitutionGroupOption {
  item_id: string;
  product_id: string;
  product_name: string;
  default_quantity: number;
  unit: string;
  is_optional: boolean;
}

interface SubstitutionGroup {
  group_name: string;
  group_units_allowed: number;
  options: SubstitutionGroupOption[];
  is_optional: boolean;
}

interface SubscriptionItem {
  id: string;
  productId: string;
  name: string;
  metadata: {
    isSubscription: boolean;
    subscriptionProductId: string;
    subscriptionInterval: 'weekly' | 'biweekly' | 'monthly';
    minInterval?: 'weekly' | 'biweekly' | 'monthly'; // minimum frequency tenant allows
    durationIntervals?: number; // if set, show duration option
    substitutionGroups?: SubstitutionGroup[];
  };
}

interface SubstitutionGroupSelection {
  [groupName: string]: Record<string, number>; // { productId: quantity }
}

interface SubscriptionConfig {
  frequency: 'weekly' | 'biweekly' | 'monthly';
  duration?: number;
  substitutionGroupSelections: SubstitutionGroupSelection;
}

interface SubscriptionCheckoutModalProps {
  isOpen: boolean;
  subscriptionItems: SubscriptionItem[];
  onConfirm: (configs: Record<string, SubscriptionConfig>) => void; // by subscription product ID
  onCancel: () => void;
}

const frequencyOrder = ['weekly', 'biweekly', 'monthly'] as const;

export function SubscriptionCheckoutModal({
  isOpen,
  subscriptionItems,
  onConfirm,
  onCancel,
}: SubscriptionCheckoutModalProps) {
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [configs, setConfigs] = useState<Record<string, SubscriptionConfig>>({});

  if (!isOpen || subscriptionItems.length === 0) {
    return null;
  }

  const currentItem = subscriptionItems[currentItemIndex];
  const currentConfig = configs[currentItem.metadata.subscriptionProductId] || {
    frequency: currentItem.metadata.subscriptionInterval,
    duration: currentItem.metadata.durationIntervals,
    substitutionGroupSelections: {},
  };

  // Build list of allowed frequencies (not more frequent than tenant minimum)
  const minFrequencyIndex = currentItem.metadata.minInterval
    ? frequencyOrder.indexOf(currentItem.metadata.minInterval)
    : 0;
  const allowedFrequencies = frequencyOrder.slice(minFrequencyIndex);

  const handleFrequencyChange = (freq: typeof frequencyOrder[number]) => {
    setConfigs(prev => ({
      ...prev,
      [currentItem.metadata.subscriptionProductId]: {
        ...currentConfig,
        frequency: freq,
      },
    }));
  };

  const handleDurationChange = (duration: number) => {
    setConfigs(prev => ({
      ...prev,
      [currentItem.metadata.subscriptionProductId]: {
        ...currentConfig,
        duration,
      },
    }));
  };

  // Handle group quantity changes
  const handleGroupQuantityChange = (groupName: string, productId: string, newQty: number) => {
    const group = currentItem.metadata.substitutionGroups?.find(g => g.group_name === groupName);
    if (!group) return;

    const current = currentConfig.substitutionGroupSelections[groupName] || {};
    const safeQty = Math.max(0, Math.floor(Number(newQty) || 0));

    // Calculate total for other products in group
    const otherTotal = Object.entries(current)
      .filter(([pid]) => pid !== productId)
      .reduce((sum, [, qty]) => sum + (Number.isFinite(qty) ? qty : 0), 0);

    const maxForThis = Math.max(0, group.group_units_allowed - otherTotal);
    const finalQty = Math.min(safeQty, maxForThis);

    setConfigs(prev => ({
      ...prev,
      [currentItem.metadata.subscriptionProductId]: {
        ...currentConfig,
        substitutionGroupSelections: {
          ...currentConfig.substitutionGroupSelections,
          [groupName]: {
            ...current,
            [productId]: finalQty,
          },
        },
      },
    }));
  };

  const getGroupTotal = (groupName: string): number => {
    const selections = currentConfig.substitutionGroupSelections[groupName] || {};
    return Object.values(selections).reduce((sum, qty) => sum + (Number.isFinite(qty) ? qty : 0), 0);
  };

  const validateSubstitutionGroups = (): boolean => {
    if (!currentItem.metadata.substitutionGroups) return true;

    for (const group of currentItem.metadata.substitutionGroups) {
      const total = getGroupTotal(group.group_name);
      if (!group.is_optional && total !== group.group_units_allowed) {
        return false;
      }
      if (total > group.group_units_allowed) {
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateSubstitutionGroups()) {
      return; // Prevent next if validation fails
    }
    if (currentItemIndex < subscriptionItems.length - 1) {
      setCurrentItemIndex(currentItemIndex + 1);
    } else {
      onConfirm(configs);
    }
  };

  const handlePrev = () => {
    if (currentItemIndex > 0) {
      setCurrentItemIndex(currentItemIndex - 1);
    }
  };

  const isLastItem = currentItemIndex === subscriptionItems.length - 1;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900">📦 Configure Subscription</h2>
            <p className="text-sm text-gray-600 mt-1">
              Item {currentItemIndex + 1} of {subscriptionItems.length}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Product Name */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{currentItem.name}</h3>
            <p className="text-sm text-gray-600 mt-1">Subscription product</p>
          </div>

          {/* Frequency Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Delivery Frequency
            </label>
            <div className="space-y-2">
              {allowedFrequencies.map(freq => (
                <label key={freq} className="flex items-center p-3 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
                  style={{
                    borderColor: currentConfig.frequency === freq ? '#0f6fff' : undefined,
                    backgroundColor: currentConfig.frequency === freq ? '#f0f7ff' : undefined,
                  }}
                >
                  <input
                    type="radio"
                    name="frequency"
                    value={freq}
                    checked={currentConfig.frequency === freq}
                    onChange={() => handleFrequencyChange(freq)}
                    className="w-4 h-4"
                  />
                  <span className="ml-3 text-sm font-medium text-gray-900 capitalize">
                    {freq === 'weekly' && 'Weekly'}
                    {freq === 'biweekly' && 'Every 2 weeks'}
                    {freq === 'monthly' && 'Monthly'}
                  </span>
                </label>
              ))}
            </div>
            {currentItem.metadata.minInterval && (
              <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                Minimum frequency is {currentItem.metadata.minInterval}
              </p>
            )}
          </div>

          {/* Duration Selection (if applicable) */}
          {currentItem.metadata.durationIntervals && currentItem.metadata.durationIntervals > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                How many deliveries?
              </label>
              <input
                type="number"
                min="1"
                max={currentItem.metadata.durationIntervals}
                value={currentConfig.duration || 1}
                onChange={e => handleDurationChange(Math.min(parseInt(e.target.value) || 1, currentItem.metadata.durationIntervals || 1))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-2">
                Maximum {currentItem.metadata.durationIntervals} deliveries available
              </p>
            </div>
          )}

          {/* Substitution Groups with Quantity Steppers */}
          {currentItem.metadata.substitutionGroups && currentItem.metadata.substitutionGroups.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700">Product Selection</h4>
              {currentItem.metadata.substitutionGroups.map(group => (
                <div key={group.group_name} className="border rounded-lg p-4 bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h5 className="font-semibold text-gray-900">{group.group_name}</h5>
                      <p className="text-xs text-gray-600">
                        {group.is_optional ? 'Optional • Up to ' : 'Required • Exactly '} {group.group_units_allowed} units
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      getGroupTotal(group.group_name) > 0 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {getGroupTotal(group.group_name)} / {group.group_units_allowed}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {group.options.map(option => {
                      const qty = currentConfig.substitutionGroupSelections[group.group_name]?.[option.product_id] ?? 0;
                      const groupSum = getGroupTotal(group.group_name);
                      const canIncrement = groupSum < group.group_units_allowed;

                      return (
                        <div
                          key={option.product_id}
                          className={`flex items-center justify-between border rounded p-3 ${
                            qty > 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{option.product_name}</p>
                            <p className="text-xs text-gray-600">Unit: {option.unit}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleGroupQuantityChange(group.group_name, option.product_id, qty - 1)}
                              disabled={qty <= 0}
                              className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 text-sm"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={0}
                              value={qty}
                              onChange={(e) => handleGroupQuantityChange(group.group_name, option.product_id, parseInt(e.target.value) || 0)}
                              className="w-14 border rounded px-2 py-1 text-center text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => handleGroupQuantityChange(group.group_name, option.product_id, qty + 1)}
                              disabled={!canIncrement}
                              className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 text-sm"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {!group.is_optional && getGroupTotal(group.group_name) !== group.group_units_allowed && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                      <AlertCircle className="h-4 w-4" />
                      Select exactly {group.group_units_allowed} units
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <strong>Next delivery:</strong> Will be {currentConfig.duration || 1} {currentConfig.frequency} deliveries
              {currentConfig.duration && currentConfig.duration > 1 ? ` (${currentConfig.duration} total)` : ''}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-200 bg-gray-50">
          {currentItemIndex > 0 && (
            <button
              onClick={handlePrev}
              className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={!validateSubstitutionGroups()}
            className={`flex-1 px-4 py-2 text-white rounded-lg font-medium transition-colors ${
              validateSubstitutionGroups()
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {isLastItem ? 'Continue to Payment' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
