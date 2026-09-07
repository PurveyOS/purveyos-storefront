export type StripePaymentIntentLike = {
  id: string
  status: string
  amount: number
  currency: string
  metadata?: Record<string, string | undefined>
}

export interface StripeLike {
  retrievePaymentIntent(id: string, connectedAccountId: string): Promise<StripePaymentIntentLike>
  createPaymentIntent(
    params: Record<string, unknown>,
    connectedAccountId: string,
    idempotencyKey: string,
  ): Promise<StripePaymentIntentLike>
}

export interface ExistingOrderLookup {
  findOrderByPaymentIntentId(paymentIntentId: string): Promise<{ orderId: string; tenantId: string } | null>
}

export function buildCheckoutIdempotencyKey(tenantId: string, checkoutAttemptId: string): string {
  return `storefront-checkout:${tenantId}:${checkoutAttemptId}`
}

/**
 * Pure verification: does this Stripe PaymentIntent actually authorize the
 * charge we intend to record? All fields are compared against server-computed
 * values, never against anything the client asserts about its own payment.
 */
export function verifyPaymentIntentForOrder(params: {
  paymentIntent: StripePaymentIntentLike
  expectedAmountCents: number
  expectedCurrency?: string
  expectedTenantId: string
  expectedCheckoutAttemptId: string
}): { ok: true } | { ok: false; error: string } {
  const { paymentIntent, expectedAmountCents, expectedTenantId, expectedCheckoutAttemptId } = params
  const expectedCurrency = (params.expectedCurrency ?? 'usd').toLowerCase()

  if (paymentIntent.status !== 'succeeded') {
    return { ok: false, error: 'payment_intent_not_succeeded' }
  }
  if (paymentIntent.amount !== expectedAmountCents) {
    return { ok: false, error: 'payment_intent_amount_mismatch' }
  }
  if ((paymentIntent.currency || '').toLowerCase() !== expectedCurrency) {
    return { ok: false, error: 'payment_intent_currency_mismatch' }
  }
  if ((paymentIntent.metadata?.tenantId || '') !== expectedTenantId) {
    return { ok: false, error: 'payment_intent_tenant_mismatch' }
  }
  if ((paymentIntent.metadata?.checkoutAttemptId || '') !== expectedCheckoutAttemptId) {
    return { ok: false, error: 'payment_intent_checkout_attempt_mismatch' }
  }
  return { ok: true }
}

export type ResolveCardPaymentResult =
  | { ok: true; paymentIntentId: string }
  | { ok: false; status: number; error: string }

/**
 * Orchestrates verifying a client-supplied PaymentIntent or creating a fresh
 * one, without ever trusting the client's claim that payment succeeded.
 * Injected `stripe`/`orderLookup` make this testable without live network calls.
 */
export async function resolveCardPayment(params: {
  stripe: StripeLike
  orderLookup: ExistingOrderLookup
  connectedAccountId: string
  tenantId: string
  checkoutAttemptId: string
  chargeAmountCents: number
  currency?: string
  suppliedPaymentIntentId?: string | null
  paymentMethodId?: string
  confirmationToken?: string
  returnUrl: string
  applicationFeeAmountCents?: number
  metadata?: Record<string, string>
}): Promise<ResolveCardPaymentResult> {
  const {
    stripe, orderLookup, connectedAccountId, tenantId, checkoutAttemptId,
    chargeAmountCents, suppliedPaymentIntentId, paymentMethodId, confirmationToken,
  } = params
  const currency = params.currency ?? 'usd'

  if (!Number.isFinite(chargeAmountCents) || chargeAmountCents <= 0) {
    return { ok: false, status: 400, error: 'invalid_charge_amount' }
  }
  if (!connectedAccountId) {
    return { ok: false, status: 400, error: 'stripe_account_not_connected' }
  }

  if (suppliedPaymentIntentId) {
    let paymentIntent: StripePaymentIntentLike
    try {
      paymentIntent = await stripe.retrievePaymentIntent(suppliedPaymentIntentId, connectedAccountId)
    } catch {
      return { ok: false, status: 402, error: 'payment_intent_not_found' }
    }

    const verification = verifyPaymentIntentForOrder({
      paymentIntent,
      expectedAmountCents: chargeAmountCents,
      expectedCurrency: currency,
      expectedTenantId: tenantId,
      expectedCheckoutAttemptId: checkoutAttemptId,
    })
    if (!verification.ok) {
      return { ok: false, status: 402, error: verification.error }
    }

    const existingOrder = await orderLookup.findOrderByPaymentIntentId(paymentIntent.id)
    if (existingOrder && existingOrder.tenantId !== tenantId) {
      return { ok: false, status: 409, error: 'payment_intent_already_used' }
    }

    return { ok: true, paymentIntentId: paymentIntent.id }
  }

  if (!paymentMethodId && !confirmationToken) {
    return { ok: false, status: 400, error: 'card_payment_method_required' }
  }

  const createParams: Record<string, unknown> = {
    amount: chargeAmountCents,
    currency,
    payment_method_types: ['card'],
    confirm: true,
    return_url: params.returnUrl,
    metadata: {
      tenantId,
      checkoutAttemptId,
      ...(params.metadata ?? {}),
    },
    ...(paymentMethodId ? { payment_method: paymentMethodId } : { confirmation_token: confirmationToken }),
    ...(params.applicationFeeAmountCents && params.applicationFeeAmountCents > 0
      ? { application_fee_amount: Math.round(params.applicationFeeAmountCents) }
      : {}),
  }

  let created: StripePaymentIntentLike
  try {
    created = await stripe.createPaymentIntent(
      createParams,
      connectedAccountId,
      buildCheckoutIdempotencyKey(tenantId, checkoutAttemptId),
    )
  } catch {
    return { ok: false, status: 402, error: 'card_payment_failed' }
  }

  if (created.status === 'requires_action') {
    return { ok: false, status: 402, error: 'card_authentication_required' }
  }
  if (created.status !== 'succeeded') {
    return { ok: false, status: 402, error: 'card_payment_failed' }
  }

  return { ok: true, paymentIntentId: created.id }
}
