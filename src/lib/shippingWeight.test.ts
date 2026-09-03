import { describe, expect, it } from 'vitest';

import type { Product } from '../types/product';
import { buildShippingWeightPayload, convertMassToPounds } from './shippingWeight';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'ground-pork',
    name: 'Ground Pork',
    description: '',
    pricePer: 10.5,
    unit: 'ea',
    variantSize: 1,
    variantUnit: 'lb',
    imageUrl: '',
    categoryId: '',
    available: true,
    ...overrides,
  };
}

describe('buildShippingWeightPayload', () => {
  it('sends fixed one-pound packages as per-unit weight and multiplies quantity once', () => {
    const result = buildShippingWeightPayload(
      [{ productId: 'ground-pork', quantity: 2 }],
      [product()],
    );

    expect(result).toEqual({
      cartWeightLbs: 2,
      productWeights: [{ product_id: 'ground-pork', weight_lbs: 1, qty: 2 }],
    });
  });

  it('does not interpret fluid or count variants as mass', () => {
    for (const variantUnit of ['fl oz', 'ml', 'L', 'count', 'package', 'ea']) {
      const result = buildShippingWeightPayload(
        [{ productId: 'ground-pork', quantity: 2 }],
        [product({ variantUnit })],
      );

      expect(result.productWeights[0].weight_lbs).toBe(0);
    }
  });

  it('prefers an explicit cart weight over the catalog variant', () => {
    const result = buildShippingWeightPayload(
      [{ productId: 'ground-pork', quantity: 2, binWeight: 1.25 }],
      [product()],
    );

    expect(result.cartWeightLbs).toBe(2.5);
    expect(result.productWeights[0].weight_lbs).toBe(1.25);
  });
});

describe('convertMassToPounds', () => {
  it('converts supported mass units to pounds', () => {
    expect(convertMassToPounds(16, 'oz')).toBe(1);
    expect(convertMassToPounds(453.59237, 'g')).toBeCloseTo(1);
    expect(convertMassToPounds(1, 'kg')).toBeCloseTo(2.2046226218);
  });
});