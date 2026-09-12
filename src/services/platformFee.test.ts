import { describe, expect, it } from 'vitest';
import { calculateBasePlatformFeeCents } from '../../supabase/functions/_shared/platform-fee';

describe('calculateBasePlatformFeeCents (storefront)', () => {
  it('applies 1.75% to Base-plan merchandise subtotal after discount', () => {
    expect(calculateBasePlatformFeeCents(10_000, 'base')).toBe(175);
  });

  it('never applies a fee for non-Base plans', () => {
    expect(calculateBasePlatformFeeCents(10_000, 'core')).toBe(0);
    expect(calculateBasePlatformFeeCents(10_000, null)).toBe(0);
    expect(calculateBasePlatformFeeCents(10_000, undefined)).toBe(0);
  });

  it('clamps negative or non-finite input to zero basis', () => {
    expect(calculateBasePlatformFeeCents(-500, 'base')).toBe(0);
  });
});
