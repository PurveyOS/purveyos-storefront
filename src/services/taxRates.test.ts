import { describe, expect, it } from 'vitest';
import { calculateMixedRateTax } from './taxRates';
import { calculateMixedRateTax as calculateEdgeMixedRateTax } from '../../supabase/functions/_shared/taxRates';

const rate = (id: string, rateBasisPoints: number) => ({ id, name: id, rateBasisPoints });

describe('calculateMixedRateTax', () => {
  it('allocates discounts and rounds tax once per mixed-rate group', () => {
    const result = calculateMixedRateTax({
      lines: [
        { key: 'food', subtotalCents: 1001, taxRate: null },
        { key: 'local', subtotalCents: 1001, taxRate: rate('local', 825) },
        { key: 'state', subtotalCents: 998, taxRate: rate('state', 500) },
      ],
      discountCents: 301,
    });

    expect(result).toMatchObject({
      subtotalCents: 3000,
      discountCents: 301,
      taxableSubtotalCents: 1799,
      taxCents: 119,
      totalCents: 2818,
    });
    expect(result.lines.map((line) => line.discountCents)).toEqual([101, 100, 100]);
    expect(result.lines.map((line) => line.taxCents)).toEqual([0, 74, 45]);
  });

  it('backs tax out of tax-inclusive prices without increasing the total', () => {
    const result = calculateMixedRateTax({
      lines: [
        { key: 'taxed', subtotalCents: 10825, taxRate: rate('local', 825) },
        { key: 'exempt', subtotalCents: 500, taxRate: null },
      ],
      discountCents: 325,
      pricesIncludeTax: true,
    });

    expect(result.totalCents).toBe(11000);
    expect(result.taxCents).toBe(801);
    expect(result.taxableSubtotalCents).toBe(9713);
    expect(result.lines[1]).toMatchObject({ taxableAmountCents: 0, taxCents: 0 });
  });

  it('clamps invalid amounts, discounts, and rates to the contract limits', () => {
    const result = calculateMixedRateTax({
      lines: [
        { key: 'invalid', subtotalCents: Number.NaN, taxRate: rate('high', 20_000) },
        { key: 'valid', subtotalCents: 100, taxRate: rate('high', 20_000) },
      ],
      discountCents: 500,
    });

    expect(result).toMatchObject({ subtotalCents: 100, discountCents: 100, taxCents: 0, totalCents: 0 });
  });

  it('stays byte-for-byte compatible with the edge calculator result', () => {
    const args = {
      lines: [
        { key: 'a', subtotalCents: 1234, taxRate: rate('local', 825) },
        { key: 'b', subtotalCents: 987, taxRate: rate('state', 500) },
        { key: 'c', subtotalCents: 222, taxRate: null },
      ],
      discountCents: 173,
      pricesIncludeTax: true,
    };

    expect(calculateEdgeMixedRateTax(args)).toEqual(calculateMixedRateTax(args));
  });
});