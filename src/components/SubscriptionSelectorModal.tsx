import { useState } from "react";

type SubscriptionInterval = "weekly" | "biweekly" | "monthly";
type DurationType = "ongoing" | "fixed_duration" | "seasonal";

interface SubscriptionSelectorModalProps {
  subscriptionName: string;
  basePrice: number; // dollars
  defaultInterval: SubscriptionInterval;
  minInterval?: SubscriptionInterval; // Minimum frequency allowed by tenant
  durationType: DurationType;
  seasonStartDate?: string;
  seasonEndDate?: string;
  onConfirm: (config: {
    interval: SubscriptionInterval;
    intervalCount: number;
    duration: DurationType;
    durationIntervals?: number;
    totalPrice: number;
  }) => void;
  onCancel: () => void;
}

export default function SubscriptionSelectorModal({
  subscriptionName,
  basePrice,
  defaultInterval,
  minInterval,
  durationType,
  seasonStartDate,
  seasonEndDate,
  onConfirm,
  onCancel,
}: SubscriptionSelectorModalProps) {
  const [selectedInterval, setSelectedInterval] = useState<SubscriptionInterval>(defaultInterval);
  const [selectedDuration, setSelectedDuration] = useState<DurationType>(durationType);
  const [durationCount, setDurationCount] = useState<string>("12");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Filter frequencies based on minimum interval (customer can only select equal or less frequent)
  const frequencyOrder: SubscriptionInterval[] = ["weekly", "biweekly", "monthly"];
  const minFreqIndex = minInterval ? frequencyOrder.indexOf(minInterval) : 0;
  const allowedFrequencies = frequencyOrder.slice(minFreqIndex);

  const calculateTotal = () => {
    if (selectedDuration === "ongoing") {
      return basePrice; // Just show per-delivery price
    }
    if (selectedDuration === "fixed_duration") {
      const count = parseInt(durationCount) || 0;
      return basePrice * count;
    }
    if (selectedDuration === "seasonal" && seasonStartDate && seasonEndDate) {
      // Calculate deliveries between dates based on interval
      const start = new Date(seasonStartDate);
      const end = new Date(seasonEndDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      let intervalDays = 7; // weekly
      if (selectedInterval === "biweekly") intervalDays = 14;
      if (selectedInterval === "monthly") intervalDays = 30;
      
      const deliveries = Math.floor(days / intervalDays) + 1;
      return basePrice * deliveries;
    }
    return basePrice;
  };

  const total = calculateTotal();

  const handleConfirm = () => {
    onConfirm({
      interval: selectedInterval,
      intervalCount: 1,
      duration: selectedDuration,
      durationIntervals: selectedDuration === "fixed_duration" ? parseInt(durationCount) : undefined,
      totalPrice: total,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="border-b px-6 py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-t-lg">
          <h2 className="text-xl font-bold">📦 Recurring Subscription</h2>
          <p className="text-sm text-orange-50 mt-2">{subscriptionName}</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Alert Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900">
              <span className="font-semibold">⚠️ This is a recurring subscription.</span> You will be charged regularly until you cancel.
            </p>
          </div>

          {!showAdvanced ? (
            /* Simple Mode - Show Defaults */
            <div className="space-y-4">
              <div className="bg-neutral-50 p-4 rounded-lg space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-600 font-medium">Delivery Frequency:</span>
                  <span className="text-neutral-900 font-semibold">
                    {defaultInterval === 'weekly' ? 'Weekly' : defaultInterval === 'biweekly' ? 'Bi-weekly' : 'Monthly'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-600 font-medium">Duration:</span>
                  <span className="text-neutral-900 font-semibold">
                    {durationType === 'ongoing' ? 'Ongoing (Cancel anytime)' : durationType === 'fixed_duration' ? '12 Deliveries' : 'Seasonal'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-neutral-200">
                  <span className="text-neutral-600 font-medium">Price per delivery:</span>
                  <span className="text-lg font-bold text-green-600">${basePrice.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={() => setShowAdvanced(true)}
                className="w-full px-4 py-2 text-center text-sm text-orange-600 border border-orange-300 rounded-lg hover:bg-orange-50 transition-colors"
              >
                Customize Frequency & Duration
              </button>
            </div>
          ) : (
            /* Advanced Mode - Show Selectors */
            <>
              {/* Delivery Frequency Dropdown */}
              <div>
                <label className="text-sm font-medium text-neutral-700 mb-2 block">Delivery Frequency</label>
                <select
                  value={selectedInterval}
                  onChange={(e) => setSelectedInterval(e.target.value as SubscriptionInterval)}
                  className="w-full px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-400 transition-colors appearance-none text-center"
                  style={{ 
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'white\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M7 10l5 5 5-5z\'/%3E%3C/svg%3E")',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 1rem center',
                    backgroundSize: '1.5rem'
                  }}
                >
                  {allowedFrequencies.includes("weekly") && <option value="weekly">Weekly - Delivery every week</option>}
                  {allowedFrequencies.includes("biweekly") && <option value="biweekly">Bi-weekly - Delivery every 2 weeks</option>}
                  {allowedFrequencies.includes("monthly") && <option value="monthly">Monthly - Delivery once per month</option>}
                </select>
                {minInterval && (
                  <p className="text-xs text-neutral-600 mt-2">
                    🔒 Minimum frequency: {minInterval === "biweekly" ? "bi-weekly" : minInterval}
                  </p>
                )}
              </div>

              {/* Subscription Duration Dropdown */}
              <div>
                <label className="text-sm font-medium text-neutral-700 mb-2 block">Subscription Duration</label>
                <select
                  value={selectedDuration}
                  onChange={(e) => setSelectedDuration(e.target.value as DurationType)}
                  className="w-full px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-400 transition-colors appearance-none text-center"
                  style={{ 
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'white\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M7 10l5 5 5-5z\'/%3E%3C/svg%3E")',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 1rem center',
                    backgroundSize: '1.5rem'
                  }}
                >
                  <option value="ongoing">Ongoing (until cancelled)</option>
                  <option value="fixed_duration">Fixed number of deliveries</option>
                  {seasonStartDate && seasonEndDate && (
                    <option value="seasonal">Seasonal</option>
                  )}
                </select>
              </div>

              {/* Fixed Duration Input */}
              {selectedDuration === "fixed_duration" && (
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                  <label className="text-sm font-medium text-neutral-700 mb-2 block">Number of Deliveries</label>
                  <input
                    type="number"
                    min="1"
                    max="52"
                    value={durationCount}
                    onChange={(e) => setDurationCount(e.target.value)}
                    className="w-full px-4 py-2 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-lg font-semibold text-center"
                    placeholder="12"
                  />
                  <p className="text-xs text-neutral-600 mt-2 text-center">
                    Total: ${(basePrice * parseInt(durationCount || "0")).toFixed(2)}
                  </p>
                </div>
              )}

              {/* Seasonal Date Display */}
              {selectedDuration === "seasonal" && seasonStartDate && seasonEndDate && (
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-200 space-y-3">
                  <div>
                    <label className="text-sm font-medium text-neutral-700 mb-2 block">Season Start Date</label>
                    <input
                      type="date"
                      value={seasonStartDate}
                      readOnly
                      className="w-full px-4 py-2 border border-orange-300 rounded-lg bg-white cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-700 mb-2 block">Season End Date</label>
                    <input
                      type="date"
                      value={seasonEndDate}
                      readOnly
                      className="w-full px-4 py-2 border border-orange-300 rounded-lg bg-white cursor-not-allowed"
                    />
                  </div>
                  <p className="text-xs text-neutral-600 text-center">
                    Estimated {Math.floor((new Date(seasonEndDate).getTime() - new Date(seasonStartDate).getTime()) / (1000 * 60 * 60 * 24 * (selectedInterval === 'weekly' ? 7 : selectedInterval === 'biweekly' ? 14 : 30)))} deliveries
                  </p>
                </div>
              )}

              {/* Price Summary */}
              <div className="bg-neutral-50 p-4 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-600">Price per delivery:</span>
                  <span className="font-semibold text-neutral-900">${basePrice.toFixed(2)}</span>
                </div>
                {selectedDuration !== "ongoing" && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-600">
                        {selectedDuration === "fixed_duration" ? "Number of deliveries:" : "Estimated deliveries:"}
                      </span>
                      <span className="font-semibold text-neutral-900">
                        {selectedDuration === "fixed_duration" ? durationCount : Math.floor(calculateTotal() / basePrice)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-lg font-bold border-t border-neutral-300 pt-2">
                      <span className="text-neutral-900">Total:</span>
                      <span className="text-green-600">${total.toFixed(2)}</span>
                    </div>
                  </>
                )}
                {selectedDuration === "ongoing" && (
                  <div className="text-xs text-neutral-600 mt-1">
                    Customer will pay ${basePrice.toFixed(2)} per delivery until cancelled
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowAdvanced(false)}
                className="w-full px-4 py-2 text-center text-sm text-neutral-600 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                Back to Quick Add
              </button>
            </>
          )}
        </div>

        {/* Actions - Fixed at bottom */}
        <div className="border-t px-6 py-4 bg-white">
          <div className="flex gap-2">
            <button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-3 rounded-lg transition-colors"
              onClick={handleConfirm}
            >
              Add to Cart - ${showAdvanced && selectedDuration === "ongoing" ? basePrice.toFixed(2) : showAdvanced ? total.toFixed(2) : basePrice.toFixed(2)}
            </button>
            <button
              className="px-4 py-3 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
