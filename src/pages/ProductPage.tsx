import { useParams } from 'react-router-dom';

export function ProductPage() {
  const { productId } = useParams<{ productId: string }>();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            Product Details
          </h1>
          <p className="text-gray-600">
            Product ID: {productId || 'No product selected'}
          </p>
          <div className="mt-8">
            <p className="text-gray-600">
              This page will display detailed product information including:
            </p>
            <ul className="list-disc list-inside mt-4 text-gray-600 space-y-2">
              <li>High-resolution product images</li>
              <li>Detailed product description</li>
              <li>Pricing and availability</li>
              <li>Add to cart functionality</li>
              <li>Related products</li>
            </ul>
          </div>
          <div className="mt-8">
            <a 
              href="/" 
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              ← Back to Store
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}