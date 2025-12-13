import { useState } from 'react';
import { X, Repeat, Calendar } from 'lucide-react';

interface RecurringOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (settings: RecurringOrderSettings) => void;
  orderTotal: number;
  orderId: string;
}

export interface RecurringOrderSettings {
  frequency: number;
  interval: 'week' | 'month';
  duration?: number;
}

export function RecurringOrderModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  orderTotal,
  orderId 
}: RecurringOrderModalProps) {
  const [frequency, setFrequency] = useState(1);
  const [interval, setInterval] = useState<'week' | 'month'>('week');
  const [duration, setDuration] = useState<number | undefined>(undefined);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm({ frequency, interval, duration });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-green-100 rounded-full">
              <Repeat className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Make Recurring Order</h2>
              <p className="text-sm text-gray-600">Order #{orderId.slice(0, 8)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Info Message */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              We'll automatically create a new order with the same items based on your schedule.
            </p>
          </div>

          {/* Frequency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="frequency" className="block text-sm font-medium text-gray-700 mb-2">
                Repeat every
              </label>
              <input
                id="frequency"
                type="number"
                min="1"
                value={frequency}
                onChange={(e) => setFrequency(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            
            <div>
              <label htmlFor="interval" className="block text-sm font-medium text-gray-700 mb-2">
                Interval
              </label>
              <select
                id="interval"
                value={interval}
                onChange={(e) => setInterval(e.target.value as 'week' | 'month')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="week">Week(s)</option>
                <option value="month">Month(s)</option>
              </select>
            </div>
          </div>

          {/* Duration */}
          <div>
            <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-2">
              Duration (optional)
            </label>
            <input
              id="duration"
              type="number"
              min="1"
              value={duration ?? ''}
              onChange={(e) => setDuration(e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="Leave empty for ongoing"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Total number of occurrences. Leave empty for indefinite recurring orders.
            </p>
          </div>

          {/* Preview */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900">
                  Schedule Preview
                </p>
                <p className="text-sm text-green-800 mt-1">
                  Repeat every <strong>{frequency}</strong> {interval}
                  {frequency > 1 ? 's' : ''}
                  {duration ? (
                    <> for <strong>{duration}</strong> occurrence{duration > 1 ? 's' : ''}</>
                  ) : (
                    <> <strong>(ongoing)</strong></>
                  )}
                </p>
                <p className="text-sm text-green-700 mt-2">
                  ${(orderTotal / 100).toFixed(2)} per {interval}
                </p>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              Create Recurring Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
