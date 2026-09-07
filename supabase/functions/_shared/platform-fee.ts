export const PURVEYOS_PLATFORM_FEE_PERCENT = 1.75

/**
 * Base-plan Stripe card payments carry a 1.75% PurveyOS platform fee, computed
 * against the post-discount merchandise subtotal (never tax, shipping, delivery,
 * or the fee itself). Square and non-Base tenants never carry this fee.
 */
export function calculateBasePlatformFeeCents(merchandiseSubtotalAfterDiscountCents: number, plan?: string | null): number {
  if (plan !== 'base') return 0
  const basis = Math.max(0, Math.round(merchandiseSubtotalAfterDiscountCents))
  return Math.round(basis * (PURVEYOS_PLATFORM_FEE_PERCENT / 100))
}
