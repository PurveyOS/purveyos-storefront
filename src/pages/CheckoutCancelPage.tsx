import { useNavigate } from 'react-router-dom';
import { XCircle } from 'lucide-react';

export function CheckoutCancelPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
            <XCircle className="w-12 h-12 text-red-600" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Payment Cancelled
        </h1>
        
        <p className="text-lg text-gray-600 mb-2">
          Your payment was not processed.
        </p>
        
        <p className="text-sm text-gray-500 mb-8">
          No charges were made to your card. Your cart items are still saved.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/checkout')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Return to Checkout
          </button>
          
          <button
            onClick={() => navigate('/cart')}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            View Cart
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full text-gray-600 hover:text-gray-800 font-medium py-2 transition-colors"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    </div>
  );
}
