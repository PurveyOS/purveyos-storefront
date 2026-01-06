import { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';

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
    substitutions?: Array<{
      name: string;
      options: string[];
    }>;
  };
}

interface SubscriptionConfig {
  frequency: 'weekly' | 'biweekly' | 'monthly';
  duration?: number;
  substitutions: Record<string, string>; // { substitutionName: selectedOption }
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
    substitutions: {},
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

  const handleSubstitutionChange = (substitutionName: string, selectedOption: string) => {
    setConfigs(prev => ({
      ...prev,
      [currentItem.metadata.subscriptionProductId]: {
        ...currentConfig,
        substitutions: {
          ...currentConfig.substitutions,
          [substitutionName]: selectedOption,
        },
      },
    }));
  };

  const handleNext = () => {
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

          {/* Substitutions (if applicable) */}
          {currentItem.metadata.substitutions && currentItem.metadata.substitutions.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700">Substitutions</h4>
              {currentItem.metadata.substitutions.map(sub => (
                <div key={sub.name}>
                  <label className="block text-sm text-gray-700 mb-2">
                    {sub.name}
                  </label>
                  <select
                    value={currentConfig.substitutions[sub.name] || ''}
                    onChange={e => handleSubstitutionChange(sub.name, e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select an option...</option>
                    {sub.options.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
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
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            {isLastItem ? 'Continue to Payment' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
