import { describe, expect, it } from 'vitest'
import { buildPreorderRpcLines } from '../../supabase/functions/_shared/preorderTaxSnapshots'
import {
  buildOrderLinePersistenceFields,
  buildOrderPersistenceFields,
  findExistingCheckoutAttempt,
} from '../../supabase/functions/_shared/storefrontOrderPersistence'
import { calculateMixedRateTax } from '../../supabase/functions/_shared/taxRates'

const paidAt = '2026-09-06T12:00:00.000Z'
const rates = {
  local: { id: 'rate-local', name: 'Local 8.25%', rateBasisPoints: 825 },
  reduced: { id: 'rate-reduced', name: 'Reduced 4%', rateBasisPoints: 400 },
}

function tax(lines: Array<{ subtotalCents: number; taxRate: typeof rates.local | null }>) {
  return calculateMixedRateTax({
    lines: lines.map((line, index) => ({ key: String(index), ...line })),
  })
}

function linePayloads(checkoutAttemptId: string, snapshots: ReturnType<typeof tax>['lines']) {
  return snapshots.map((snapshot, index) =>
    buildOrderLinePersistenceFields(checkoutAttemptId, index, snapshot))
}

describe('create-storefront-order persistence orchestration', () => {
  it('persists a charged deposit card checkout as paid at insertion time', () => {
    const result = tax([{ subtotalCents: 2500, taxRate: rates.local }])
    const order = buildOrderPersistenceFields({
      checkoutAttemptId: 'deposit-attempt',
      hasDepositProduct: true,
      paymentMethod: 'card',
      chargedStripePaymentIntentId: 'pi_deposit',
      paidAt,
    })

    expect(order).toEqual({
      checkout_attempt_id: 'deposit-attempt',
      payment_status: 'paid',
      stripe_payment_intent_id: 'pi_deposit',
      deposit_paid_at: paidAt,
    })
    expect(linePayloads('deposit-attempt', result.lines)).toEqual([{
      client_line_key: 'deposit-attempt:0',
      tax_rate_id: 'rate-local',
      tax_rate_name: 'Local 8.25%',
      tax_rate_basis_points: 825,
      discount_cents: 0,
      taxable_amount_cents: 2500,
      tax_cents: 206,
    }])
  })

  it('persists mixed deposit and regular lines with stable identities and snapshots', () => {
    const result = tax([
      { subtotalCents: 3000, taxRate: rates.local },
      { subtotalCents: 1200, taxRate: rates.reduced },
    ])
    const order = buildOrderPersistenceFields({
      checkoutAttemptId: 'mixed-attempt',
      hasDepositProduct: true,
      paymentMethod: 'card',
      chargedStripePaymentIntentId: 'pi_mixed',
      paidAt,
    })

    expect(order.deposit_paid_at).toBe(paidAt)
    expect(order.payment_status).toBe('paid')
    expect(linePayloads('mixed-attempt', result.lines)).toEqual([
      {
        client_line_key: 'mixed-attempt:0', tax_rate_id: 'rate-local', tax_rate_name: 'Local 8.25%',
        tax_rate_basis_points: 825, discount_cents: 0, taxable_amount_cents: 3000, tax_cents: 248,
      },
      {
        client_line_key: 'mixed-attempt:1', tax_rate_id: 'rate-reduced', tax_rate_name: 'Reduced 4%',
        tax_rate_basis_points: 400, discount_cents: 0, taxable_amount_cents: 1200, tax_cents: 48,
      },
    ])
  })

  it('builds pure preorder card line payloads with immutable tax snapshots', () => {
    const result = tax([{ subtotalCents: 1800, taxRate: rates.reduced }])
    const lines = buildPreorderRpcLines('preorder-attempt', [{
      productId: 'product-1', productName: 'Preorder', qty: 1,
      unitPriceCents: 1800, lineTotalCents: 1800,
    }], result.lines)
    const order = buildOrderPersistenceFields({
      checkoutAttemptId: 'preorder-attempt',
      hasDepositProduct: false,
      paymentMethod: 'card',
      chargedStripePaymentIntentId: 'pi_preorder',
      paidAt,
    })

    expect(order).toEqual({ checkout_attempt_id: 'preorder-attempt', payment_status: 'paid', stripe_payment_intent_id: 'pi_preorder', deposit_paid_at: null })
    expect(lines[0]).toMatchObject({
      line_key: 'preorder-attempt:0', tax_rate_id: 'rate-reduced', tax_rate_name: 'Reduced 4%',
      tax_rate_basis_points: 400, discount_cents: 0, taxable_amount_cents: 1800, tax_cents: 72,
    })
  })

  it('returns a non-card order for the same tenant and checkout attempt', async () => {
    const filters: Array<[string, string]> = []
    const query: any = {
      select: () => query,
      eq: (column: string, value: string) => { filters.push([column, value]); return query },
      maybeSingle: async () => ({ data: { id: 'order-cash', status: 'pending', payment_status: 'pending' }, error: null }),
    }
    const existing = await findExistingCheckoutAttempt({ from: (table: string) => {
      expect(table).toBe('orders')
      return query
    } }, 'tenant-1', 'cash-attempt')

    expect(filters).toEqual([['tenant_id', 'tenant-1'], ['checkout_attempt_id', 'cash-attempt']])
    expect(existing).toEqual({ id: 'order-cash', status: 'pending', payment_status: 'pending' })
  })

  it('persists No Tax and two distinct taxable-rate snapshots', () => {
    const result = tax([
      { subtotalCents: 1000, taxRate: null },
      { subtotalCents: 2000, taxRate: rates.local },
      { subtotalCents: 3000, taxRate: rates.reduced },
    ])

    expect(linePayloads('three-rates', result.lines)).toEqual([
      {
        client_line_key: 'three-rates:0', tax_rate_id: null, tax_rate_name: 'No tax',
        tax_rate_basis_points: 0, discount_cents: 0, taxable_amount_cents: 0, tax_cents: 0,
      },
      {
        client_line_key: 'three-rates:1', tax_rate_id: 'rate-local', tax_rate_name: 'Local 8.25%',
        tax_rate_basis_points: 825, discount_cents: 0, taxable_amount_cents: 2000, tax_cents: 165,
      },
      {
        client_line_key: 'three-rates:2', tax_rate_id: 'rate-reduced', tax_rate_name: 'Reduced 4%',
        tax_rate_basis_points: 400, discount_cents: 0, taxable_amount_cents: 3000, tax_cents: 120,
      },
    ])
  })

  it.each(['venmo', 'zelle', 'cash', 'pay_later'])('keeps %s deposits pending without deposit_paid_at', (paymentMethod) => {
    expect(buildOrderPersistenceFields({
      checkoutAttemptId: `${paymentMethod}-attempt`,
      hasDepositProduct: true,
      paymentMethod,
      chargedStripePaymentIntentId: null,
      paidAt,
    })).toEqual({
      checkout_attempt_id: `${paymentMethod}-attempt`,
      payment_status: 'pending',
      stripe_payment_intent_id: null,
      deposit_paid_at: null,
    })
  })
})
