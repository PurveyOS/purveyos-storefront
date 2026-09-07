import { describe, expect, it } from 'vitest';
import { computeTrustedLinePrice, linePriceMatchesTrusted } from '../../supabase/functions/_shared/trustedLinePricing';

describe('computeTrustedLinePrice', () => {
  const eaProduct = { id: 'p1', unit: 'ea', pricePerCents: 500 };
  const lbProduct = { id: 'p2', unit: 'lb', pricePerCents: 800 };

  it('prices an each-unit line from authoritative pricePer, ignoring client price', () => {
    const result = computeTrustedLinePrice({ productId: 'p1', qty: 3 }, eaProduct, []);
    expect(result).toEqual({ unitPriceCents: 500, lineTotalCents: 1500 });
  });

  it('prices a weight-based pack-for-you line from requested weight and pricePer', () => {
    const result = computeTrustedLinePrice({ productId: 'p2', qty: 1, requestedWeightLbs: 1.25 }, lbProduct, []);
    expect(result).toEqual({ unitPriceCents: 800, lineTotalCents: 1000 });
  });

  it('prices an exact-package line from the matching bin unit price, not pricePer', () => {
    const bins = [{ packageKey: 'p2|1.5', weightBtn: 1.5, unitPriceCents: 750 }];
    const result = computeTrustedLinePrice({ productId: 'p2', qty: 1, binWeight: 1.5 }, lbProduct, bins);
    expect(result).toEqual({ unitPriceCents: 750, lineTotalCents: 1125 });
  });

  it('falls back to pricePer when no bin matches the requested weight (stale bin removed)', () => {
    const bins = [{ packageKey: 'p2|2', weightBtn: 2, unitPriceCents: 750 }];
    const result = computeTrustedLinePrice({ productId: 'p2', qty: 1, binWeight: 1.5 }, lbProduct, bins);
    expect(result).toEqual({ unitPriceCents: 800, lineTotalCents: 1200 });
  });
});

describe('linePriceMatchesTrusted', () => {
  it('rejects a client attempt to reduce the line total', () => {
    expect(linePriceMatchesTrusted(1, 1500)).toBe(false);
  });

  it('rejects any client/server cent mismatch', () => {
    expect(linePriceMatchesTrusted(1499, 1500)).toBe(false);
    expect(linePriceMatchesTrusted(1500.5, 1500)).toBe(false);
    expect(linePriceMatchesTrusted(1500, 1500)).toBe(true);
  });
});
