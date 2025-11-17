import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTenantFromDomain } from '../hooks/useTenantFromDomain';
import { useStorefrontData } from '../hooks/useStorefrontData';
import { trackProductView } from '../utils/analytics';

export function ProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const { tenant } = useTenantFromDomain();
  const { data: storefrontData } = useStorefrontData(tenant?.id || '');

  useEffect(() => {
    if (!productId) return;
    const product = storefrontData?.products.find(p => p.id === productId);
    trackProductView({
      productId,
      name: product?.name,
      price: product?.pricePer,
      category: (product as any)?.category || (product as any)?.categoryId,
      tenantId: tenant?.id,
    });
  }, [productId, storefrontData?.products, tenant?.id]);

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