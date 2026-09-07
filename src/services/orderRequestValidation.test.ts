import { describe, expect, it } from 'vitest';
import { validateOrderRequestShape } from '../../supabase/functions/_shared/orderRequestValidation';

const baseLine = { productId: 'p1', productName: 'Widget', qty: 1, unitPriceCents: 500, lineTotalCents: 500 };
const baseRequest = {
  tenantId: 'tenant-1',
  customerEmail: 'a@b.com',
  customerName: 'Jane',
  deliveryMethod: 'pickup',
  paymentMethod: 'card',
  lines: [baseLine],
};

describe('validateOrderRequestShape', () => {
  it('accepts a well-formed request', () => {
    expect(validateOrderRequestShape(baseRequest)).toBeNull();
  });

  it('rejects an invalid deliveryMethod', () => {
    expect(validateOrderRequestShape({ ...baseRequest, deliveryMethod: 'teleport' })).toMatch('deliveryMethod');
  });

  it('rejects an invalid paymentMethod', () => {
    expect(validateOrderRequestShape({ ...baseRequest, paymentMethod: 'crypto' })).toMatch('paymentMethod');
  });

  it('rejects an empty line array', () => {
    expect(validateOrderRequestShape({ ...baseRequest, lines: [] })).toMatch('non-empty array');
  });

  it('rejects a non-positive quantity', () => {
    expect(validateOrderRequestShape({ ...baseRequest, lines: [{ ...baseLine, qty: 0 }] })).toMatch('positive integer');
  });

  it('rejects a negative monetary total', () => {
    expect(validateOrderRequestShape({ ...baseRequest, taxCents: -1 })).toMatch('taxCents');
  });

  it('rejects a fractional line total', () => {
    expect(validateOrderRequestShape({ ...baseRequest, lines: [{ ...baseLine, lineTotalCents: 5.5 }] })).toMatch('lineTotalCents');
  });
});
