import { describe, expect, it, vi } from 'vitest';
import {
  buildCheckoutIdempotencyKey,
  resolveCardPayment,
  verifyPaymentIntentForOrder,
  type StripeLike,
  type StripePaymentIntentLike,
} from '../../supabase/functions/_shared/cardPaymentOrchestration';

function pi(overrides: Partial<StripePaymentIntentLike> = {}): StripePaymentIntentLike {
  return {
    id: 'pi_123',
    status: 'succeeded',
    amount: 1_000,
    currency: 'usd',
    metadata: { tenantId: 'tenant-1', checkoutAttemptId: 'attempt-1' },
    ...overrides,
  };
}

describe('verifyPaymentIntentForOrder', () => {
  const baseParams = {
    expectedAmountCents: 1_000,
    expectedTenantId: 'tenant-1',
    expectedCheckoutAttemptId: 'attempt-1',
  };

  it('accepts a matching succeeded intent', () => {
    expect(verifyPaymentIntentForOrder({ paymentIntent: pi(), ...baseParams })).toEqual({ ok: true });
  });

  it('rejects a non-succeeded status', () => {
    const result = verifyPaymentIntentForOrder({ paymentIntent: pi({ status: 'requires_action' }), ...baseParams });
    expect(result).toEqual({ ok: false, error: 'payment_intent_not_succeeded' });
  });

  it('rejects an amount mismatch (client attempted to underpay)', () => {
    const result = verifyPaymentIntentForOrder({ paymentIntent: pi({ amount: 1 }), ...baseParams });
    expect(result).toEqual({ ok: false, error: 'payment_intent_amount_mismatch' });
  });

  it('rejects a tenant/metadata mismatch (intent from another connected account/tenant)', () => {
    const result = verifyPaymentIntentForOrder({
      paymentIntent: pi({ metadata: { tenantId: 'someone-else', checkoutAttemptId: 'attempt-1' } }),
      ...baseParams,
    });
    expect(result).toEqual({ ok: false, error: 'payment_intent_tenant_mismatch' });
  });

  it('rejects a checkout attempt mismatch', () => {
    const result = verifyPaymentIntentForOrder({
      paymentIntent: pi({ metadata: { tenantId: 'tenant-1', checkoutAttemptId: 'different-attempt' } }),
      ...baseParams,
    });
    expect(result).toEqual({ ok: false, error: 'payment_intent_checkout_attempt_mismatch' });
  });
});

describe('resolveCardPayment', () => {
  const orderLookupNone = { findOrderByPaymentIntentId: vi.fn().mockResolvedValue(null) };

  it('rejects a fake/unknown PaymentIntent ID', async () => {
    const stripe: StripeLike = {
      retrievePaymentIntent: vi.fn().mockRejectedValue(new Error('No such payment_intent')),
      createPaymentIntent: vi.fn(),
    };
    const result = await resolveCardPayment({
      stripe, orderLookup: orderLookupNone, connectedAccountId: 'acct_1', tenantId: 'tenant-1',
      checkoutAttemptId: 'attempt-1', chargeAmountCents: 1_000, suppliedPaymentIntentId: 'pi_fake',
      returnUrl: 'https://example.com/return',
    });
    expect(result).toEqual({ ok: false, status: 402, error: 'payment_intent_not_found' });
  });

  it('rejects a succeeded intent with the wrong amount', async () => {
    const stripe: StripeLike = {
      retrievePaymentIntent: vi.fn().mockResolvedValue(pi({ amount: 1 })),
      createPaymentIntent: vi.fn(),
    };
    const result = await resolveCardPayment({
      stripe, orderLookup: orderLookupNone, connectedAccountId: 'acct_1', tenantId: 'tenant-1',
      checkoutAttemptId: 'attempt-1', chargeAmountCents: 1_000, suppliedPaymentIntentId: 'pi_123',
      returnUrl: 'https://example.com/return',
    });
    expect(result).toEqual({ ok: false, status: 402, error: 'payment_intent_amount_mismatch' });
  });

  it('rejects a PaymentIntent already used by another tenant/order', async () => {
    const stripe: StripeLike = {
      retrievePaymentIntent: vi.fn().mockResolvedValue(pi()),
      createPaymentIntent: vi.fn(),
    };
    const orderLookup = { findOrderByPaymentIntentId: vi.fn().mockResolvedValue({ orderId: 'order-2', tenantId: 'other-tenant' }) };
    const result = await resolveCardPayment({
      stripe, orderLookup, connectedAccountId: 'acct_1', tenantId: 'tenant-1',
      checkoutAttemptId: 'attempt-1', chargeAmountCents: 1_000, suppliedPaymentIntentId: 'pi_123',
      returnUrl: 'https://example.com/return',
    });
    expect(result).toEqual({ ok: false, status: 409, error: 'payment_intent_already_used' });
  });

  it('accepts a duplicate checkout retry for the same tenant/order', async () => {
    const stripe: StripeLike = {
      retrievePaymentIntent: vi.fn().mockResolvedValue(pi()),
      createPaymentIntent: vi.fn(),
    };
    const orderLookup = { findOrderByPaymentIntentId: vi.fn().mockResolvedValue({ orderId: 'order-1', tenantId: 'tenant-1' }) };
    const result = await resolveCardPayment({
      stripe, orderLookup, connectedAccountId: 'acct_1', tenantId: 'tenant-1',
      checkoutAttemptId: 'attempt-1', chargeAmountCents: 1_000, suppliedPaymentIntentId: 'pi_123',
      returnUrl: 'https://example.com/return',
    });
    expect(result).toEqual({ ok: true, paymentIntentId: 'pi_123' });
  });

  it('creates a fresh PaymentIntent with a stable per-checkout idempotency key', async () => {
    const createPaymentIntent = vi.fn().mockResolvedValue(pi());
    const stripe: StripeLike = { retrievePaymentIntent: vi.fn(), createPaymentIntent };
    const result = await resolveCardPayment({
      stripe, orderLookup: orderLookupNone, connectedAccountId: 'acct_1', tenantId: 'tenant-1',
      checkoutAttemptId: 'attempt-1', chargeAmountCents: 1_000, paymentMethodId: 'pm_1',
      returnUrl: 'https://example.com/return',
    });
    expect(result).toEqual({ ok: true, paymentIntentId: 'pi_123' });
    expect(createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1_000, confirm: true }),
      'acct_1',
      buildCheckoutIdempotencyKey('tenant-1', 'attempt-1'),
    );
  });

  it('rejects when neither paymentMethodId nor confirmationToken is supplied for a fresh charge', async () => {
    const stripe: StripeLike = { retrievePaymentIntent: vi.fn(), createPaymentIntent: vi.fn() };
    const result = await resolveCardPayment({
      stripe, orderLookup: orderLookupNone, connectedAccountId: 'acct_1', tenantId: 'tenant-1',
      checkoutAttemptId: 'attempt-1', chargeAmountCents: 1_000,
      returnUrl: 'https://example.com/return',
    });
    expect(result).toEqual({ ok: false, status: 400, error: 'card_payment_method_required' });
  });

  it('includes application_fee_amount only when a positive platform fee is supplied', async () => {
    const createPaymentIntent = vi.fn().mockResolvedValue(pi());
    const stripe: StripeLike = { retrievePaymentIntent: vi.fn(), createPaymentIntent };
    await resolveCardPayment({
      stripe, orderLookup: orderLookupNone, connectedAccountId: 'acct_1', tenantId: 'tenant-1',
      checkoutAttemptId: 'attempt-1', chargeAmountCents: 1_175, paymentMethodId: 'pm_1',
      applicationFeeAmountCents: 175,
      returnUrl: 'https://example.com/return',
    });
    expect(createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ application_fee_amount: 175 }),
      'acct_1',
      expect.any(String),
    );

    createPaymentIntent.mockClear();
    await resolveCardPayment({
      stripe, orderLookup: orderLookupNone, connectedAccountId: 'acct_1', tenantId: 'tenant-1',
      checkoutAttemptId: 'attempt-1', chargeAmountCents: 1_000, paymentMethodId: 'pm_1',
      applicationFeeAmountCents: 0,
      returnUrl: 'https://example.com/return',
    });
    expect(createPaymentIntent.mock.calls[0][0]).not.toHaveProperty('application_fee_amount');
  });
});