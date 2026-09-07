import { describe, expect, it } from 'vitest'
import { buildPreorderRpcLines } from '../../supabase/functions/_shared/preorderTaxSnapshots'
import { calculateMixedRateTax } from '../../supabase/functions/_shared/taxRates'

describe('preorder tax snapshot persistence payload', () => {
  it('keeps separate weighted lines for the same product', () => {
    const tax = calculateMixedRateTax({
      lines: [
        { key: '0', subtotalCents: 650, taxRate: { id: 'rate-1', name: 'Food', rateBasisPoints: 650 } },
        { key: '1', subtotalCents: 1_300, taxRate: { id: 'rate-1', name: 'Food', rateBasisPoints: 650 } },
      ],
      discountCents: 1,
    })
    const rpcLines = buildPreorderRpcLines('checkout-1', [
      {
        productId: 'same-product', productName: 'Weighted item', qty: 1,
        unitPriceCents: 1_000, lineTotalCents: 650, lineType: 'pack_for_you', requestedWeightLbs: 0.65,
      },
      {
        productId: 'same-product', productName: 'Weighted item', qty: 1,
        unitPriceCents: 1_000, lineTotalCents: 1_300, lineType: 'pack_for_you', requestedWeightLbs: 1.3,
      },
    ], tax.lines)

    expect(rpcLines.map((line) => line.line_key)).toEqual(['checkout-1:0', 'checkout-1:1'])
    expect(rpcLines.map((line) => line.discount_cents)).toEqual([0, 1])
    expect(rpcLines.map((line) => line.taxable_amount_cents)).toEqual([650, 1_299])
    expect(rpcLines.map((line) => line.tax_cents)).toEqual([42, 85])
    expect(rpcLines.reduce((sum, line) => sum + line.tax_cents, 0)).toBe(tax.taxCents)
  })
})