interface StorefrontConfigurationErrorProps {
  message?: string | null;
  onRetry: () => void;
}

export function StorefrontConfigurationError({ message, onRetry }: StorefrontConfigurationErrorProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-lg border border-red-300 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Storefront configuration unavailable</h1>
        <p className="mt-3 text-gray-600">
          {message || 'We could not load this store right now. Please try again.'}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-2 font-semibold text-red-800 hover:bg-red-100"
        >
          Retry
        </button>
      </div>
    </div>
  );
}