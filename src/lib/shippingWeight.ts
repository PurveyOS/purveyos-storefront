import type { Product } from '../types/product';
import type { CartItem } from '../types/storefront';

export interface ShippingProductWeight {
  product_id: string;
  weight_lbs: number;
  qty: number;
}

const MASS_UNIT_TO_LBS: Record<string, number> = {
  lb: 1,
  lbs: 1,
  oz: 1 / 16,
  g: 1 / 453.59237,
  kg: 2.2046226218,
};

export function convertMassToPounds(size: number | undefined, unit: string | undefined): number | null {
  const conversion = MASS_UNIT_TO_LBS[String(unit ?? '').trim().toLowerCase()];
  if (!Number.isFinite(size) || Number(size) <= 0 || conversion === undefined) return null;
  return Number(size) * conversion;
}

function getPerUnitWeightLbs(item: CartItem, product: Product | undefined): number {
  const cartWeight = item.weight ?? item.binWeight ?? item.requestedWeightLbs;
  if (Number.isFinite(cartWeight) && Number(cartWeight) > 0) return Number(cartWeight);

  if (product?.unit.trim().toLowerCase() !== 'ea') return 0;
  return convertMassToPounds(product.variantSize, product.variantUnit) ?? 0;
}

export function buildShippingWeightPayload(cartItems: CartItem[], products: Product[]) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const productWeights: ShippingProductWeight[] = cartItems.map((item) => ({
    product_id: item.productId,
    weight_lbs: getPerUnitWeightLbs(item, productsById.get(item.productId)),
    qty: Number(item.quantity) || 1,
  }));

  return {
    cartWeightLbs: productWeights.reduce((sum, item) => sum + item.weight_lbs * item.qty, 0) || 10,
    productWeights,
  };
}