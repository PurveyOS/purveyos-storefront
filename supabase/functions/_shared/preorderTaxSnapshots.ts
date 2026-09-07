import type { TaxLineSnapshot } from './taxRates.ts'

export type PreorderSourceLine = {
  productId: string
  productName: string
  qty?: number
  unitPriceCents?: number
  lineTotalCents?: number
  lineType?: string
  requestedWeightLbs?: number | null
  weightLbs?: number | null
  binWeight?: number | null
}

export function buildPreorderRpcLines(
  checkoutAttemptId: string,
  lines: PreorderSourceLine[],
  taxSnapshots: TaxLineSnapshot[],
) {
  if (lines.length !== taxSnapshots.length) {
    throw new Error('Preorder tax snapshots must match the complete line set')
  }

  return lines.map((line, index) => {
    const taxSnapshot = taxSnapshots[index]
    return {
      line_key: `${checkoutAttemptId}:${index}`,
      product_id: line.productId,
      product_name: line.productName,
      quantity: line.qty ?? 1,
      unit_price_cents: line.unitPriceCents ?? 0,
      line_total_cents: line.lineTotalCents ?? 0,
      requested_weight_lbs:
        line.lineType === 'pack_for_you'
          ? (line.requestedWeightLbs ?? line.weightLbs ?? line.binWeight ?? null)
          : null,
      line_type: line.lineType === 'pack_for_you' ? 'pack_for_you' : 'exact_package',
      tax_rate_id: taxSnapshot.taxRateId,
      tax_rate_name: taxSnapshot.taxRateName,
      tax_rate_basis_points: taxSnapshot.taxRateBasisPoints,
      discount_cents: taxSnapshot.discountCents,
      taxable_amount_cents: taxSnapshot.taxableAmountCents,
      tax_cents: taxSnapshot.taxCents,
    }
  })
}