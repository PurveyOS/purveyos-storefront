import type { TaxLineSnapshot } from './taxRates.ts'

export async function findExistingCheckoutAttempt(
  supabaseAdmin: any,
  tenantId: string,
  checkoutAttemptId: string,
) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id, status, payment_status')
    .eq('tenant_id', tenantId)
    .eq('checkout_attempt_id', checkoutAttemptId)
    .maybeSingle()

  if (error) throw error
  return data && data.status !== 'cancelled' ? data : null
}

export function buildOrderPersistenceFields(args: {
  checkoutAttemptId: string
  hasDepositProduct: boolean
  paymentMethod: string
  chargedStripePaymentIntentId: string | null
  paidAt?: string
}) {
  const cardWasCharged = args.paymentMethod === 'card' && Boolean(args.chargedStripePaymentIntentId)

  return {
    checkout_attempt_id: args.checkoutAttemptId,
    payment_status: cardWasCharged ? 'paid' : 'pending',
    stripe_payment_intent_id: args.chargedStripePaymentIntentId,
    deposit_paid_at: args.hasDepositProduct && cardWasCharged
      ? (args.paidAt ?? new Date().toISOString())
      : null,
  }
}

export function buildOrderLinePersistenceFields(
  checkoutAttemptId: string,
  lineIndex: number,
  taxSnapshot: TaxLineSnapshot,
) {
  return {
    client_line_key: `${checkoutAttemptId}:${lineIndex}`,
    tax_rate_id: taxSnapshot.taxRateId,
    tax_rate_name: taxSnapshot.taxRateName,
    tax_rate_basis_points: taxSnapshot.taxRateBasisPoints,
    discount_cents: taxSnapshot.discountCents,
    taxable_amount_cents: taxSnapshot.taxableAmountCents,
    tax_cents: taxSnapshot.taxCents,
  }
}
