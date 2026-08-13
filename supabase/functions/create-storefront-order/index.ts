// @ts-ignore: Deno deploy provides these remote modules at runtime
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore: Deno deploy provides these remote modules at runtime
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.95.0'
// @ts-ignore: Deno deploy provides these remote modules at runtime
import Stripe from 'https://esm.sh/stripe@14.8.0?target=deno'

// Minimal Deno env typing for TypeScript tooling
declare const Deno: { env: { get(key: string): string | undefined } }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OrderLine {
  productId: string
  productName: string
  qty: number
  unitPriceCents: number
  lineTotalCents: number
  binWeight?: number | null
  weightLbs?: number | null
  requestedWeightLbs?: number | null
  lineType?: 'exact_package' | 'pack_for_you'
  isPreOrder?: boolean
  pricePer?: string
  weightBinId?: string
  fulfillmentBucket?: 'NOW' | 'LATER'
}

interface OrderRequest {
  tenantId: string
  customerName: string
  customerEmail: string
  customerPhone: string
  deliveryMethod: 'pickup' | 'delivery' | 'shipping' | 'dropoff' | 'other'
  requestedDeliveryDate?: string
  deliveryAddress?: string
  deliveryNotes?: string
  customerZip?: string
  customerStreet?: string
  customerCity?: string
  customerState?: string
  fulfillmentLocation?: string
  paymentMethod: 'venmo' | 'zelle' | 'cashapp' | 'card' | 'cash' | 'pay_later'
  paymentNowChoice?: 'pay_now' | 'pay_at_pickup'
  lines: OrderLine[]
  subtotalCents: number
  taxCents: number
  totalCents: number
  discountCents?: number
  shippingChargeCents?: number
  shippingEstimateHighCents?: number
  deliveryChargeCents?: number
  onlinePaymentFeeCents?: number
  depositChargeCents?: number
  isWeightEstimate?: boolean
  estimatedTotalCents?: number
  stripePaymentIntentId?: string  // Stripe payment intent ID for idempotency
  confirmationToken?: string
  paymentMethodId?: string
  subscription?: {
    enabled: boolean
    cadence?: 'weekly' | 'biweekly' | 'monthly'
    startDate?: string
    subscriptionProductId?: string  // used by purveyos-storefront
    productId?: string              // used by huckster-ui
    isCsaBox?: boolean              // huckster-ui specific
    targetWeightLbs?: number        // huckster-ui specific
    quantity?: number
    duration?: number  // total deliveries expected
    substitutions?: Record<string, any>  // customer group choices
  }
}

function buildPackageKey(productId: string, unit: string | null | undefined, line: OrderLine) {
  const isLb = (unit || '').toLowerCase().startsWith('lb')
  const rawWeight = isLb ? (line.binWeight ?? line.weightLbs ?? line.requestedWeightLbs ?? 0) : 0
  const weightBtn = Math.round(rawWeight * 100) / 100
  const weightStr = weightBtn.toString().replace(/\.0+$/, '').replace(/\.([1-9]*)0+$/, '.$1') || '0'
  return `${productId}|${weightStr}`
}

function normalizeStorefrontWeightLine(line: OrderLine, unit: string | null | undefined) {
  const normalizedUnit = (unit || '').toLowerCase()
  const isWeightProduct = normalizedUnit.startsWith('lb')
  const hasSelectedPackage = Number(line.binWeight ?? 0) > 0
  const shouldCanonicalizePreOrderWeight =
    isWeightProduct &&
    line.isPreOrder === true &&
    !hasSelectedPackage &&
    !(Number(line.requestedWeightLbs ?? 0) > 0) &&
    Number(line.weightLbs ?? 0) > 0

  const lineType: 'exact_package' | 'pack_for_you' =
    line.lineType === 'pack_for_you' || shouldCanonicalizePreOrderWeight
      ? 'pack_for_you'
      : 'exact_package'

  return {
    lineType,
    requestedWeightLbs:
      lineType === 'pack_for_you'
        ? (line.requestedWeightLbs ?? line.weightLbs ?? line.binWeight ?? null)
        : null,
    weightLbs:
      lineType === 'pack_for_you'
        ? null
        : (line.weightLbs ?? null),
  }
}

function hasSelectedBins(selectedBins: unknown) {
  return Array.isArray(selectedBins) && selectedBins.length > 0
}

function hasReservationEvidence(line: { reserved_at?: string | null; selected_bins?: unknown }) {
  return Boolean(line.reserved_at) || hasSelectedBins(line.selected_bins)
}

async function rollbackFailedStorefrontOrder(params: {
  supabaseAdmin: SupabaseClient<any, 'public', any>
  tenantId: string
  orderId: string
}) {
  const { supabaseAdmin, tenantId, orderId } = params

  // Best-effort cleanup to prevent ghost orders/reservations after partial failures.
  const { error: reservationCleanupError } = await supabaseAdmin
    .from('product_reservations')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
  if (reservationCleanupError) {
    console.error('Rollback warning: failed to delete product_reservations:', reservationCleanupError)
  }

  const { error: lineCleanupError } = await supabaseAdmin
    .from('order_lines')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
  if (lineCleanupError) {
    console.error('Rollback warning: failed to delete order_lines:', lineCleanupError)
  }

  const { error: orderCleanupError } = await supabaseAdmin
    .from('orders')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', orderId)
  if (orderCleanupError) {
    console.error('Rollback warning: failed to delete order:', orderCleanupError)
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role key (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get authenticated user ID from JWT if present
    let userId = null
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (!authError && user) {
          userId = user.id
          console.log('Order from authenticated user:', userId)
        }
      } catch (e) {
        console.log('Could not parse user from token:', e)
      }
    }

    const orderRequest: OrderRequest = await req.json()
    console.log('Creating storefront order:', orderRequest)
    console.log('🔍 Subscription payload received:', JSON.stringify(orderRequest.subscription, null, 2))

    // Validate request
    if (!orderRequest.tenantId || !orderRequest.customerEmail || !orderRequest.lines.length) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // IDEMPOTENCY CHECK: Use stripe_payment_intent_id as stable key
    if (orderRequest.stripePaymentIntentId) {
      const { data: existingOrder, error: checkError } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('tenant_id', orderRequest.tenantId)
        .eq('stripe_payment_intent_id', orderRequest.stripePaymentIntentId)
        .maybeSingle()

      if (existingOrder) {
        console.log('✅ Idempotent request detected, returning existing order:', existingOrder.id)
        return new Response(
          JSON.stringify({ orderId: existingOrder.id, success: true, idempotent: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Derive weight-based pre-order flags (used to mark orders as estimates)
    const isWeightEstimate = orderRequest.isWeightEstimate ?? orderRequest.lines.some((line) => {
      const lineIsPreOrder = line.isPreOrder ?? false
      const hasWeight = (line.weightLbs ?? 0) > 0 || (line.binWeight ?? 0) > 0 || (line.requestedWeightLbs ?? 0) > 0
      const isWeightPriced = line.pricePer === 'lb'
      return lineIsPreOrder && (hasWeight || isWeightPriced)
    })

    let estimatedTotalCents: number | null = orderRequest.estimatedTotalCents ?? null

    // Preflight stock check to prevent orders on unavailable items
    const productIds = Array.from(new Set(orderRequest.lines.map((l) => l.productId)))

    const { data: tenantTaxConfig, error: tenantTaxError } = await supabaseAdmin
      .from('tenants')
      .select('tax_rate, tax_included, charge_tax_on_online, stripe_account_id')
      .eq('id', orderRequest.tenantId)
      .single()

    if (tenantTaxError) {
      console.error('Error fetching tenant tax config:', tenantTaxError)
      return new Response(JSON.stringify({ error: 'Unable to load tenant tax settings' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, unit, qty, tax_behavior, is_deposit_product, deposit_prod_price_per_lb, deposit_fixed_total, reserved_weight_lbs')
      .eq('tenant_id', orderRequest.tenantId)
      .in('id', productIds)

    if (productsError) {
      console.error('Error fetching products for stock check:', productsError)
      return new Response(JSON.stringify({ error: 'Inventory check failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: bins, error: binsError } = await supabaseAdmin
      .from('package_bins')
      .select('product_id, package_key, qty, reserved_qty, bin_kind, qty_lbs, reserved_lbs, weight_btn')
      .eq('tenant_id', orderRequest.tenantId)
      .in('product_id', productIds)

    if (binsError) {
      console.error('Error fetching package_bins for stock check:', binsError)
      return new Response(JSON.stringify({ error: 'Inventory check failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: activeOrders, error: activeOrdersError } = await supabaseAdmin
      .from('orders')
      .select('payment_status, order_lines(product_id, quantity, weight_lbs, bin_weight, requested_weight_lbs, is_pre_order, line_type, fulfillment_bucket, reserved_at, selected_bins)')
      .eq('tenant_id', orderRequest.tenantId)
      .in('status', ['pending', 'ready'])

    if (activeOrdersError) {
      console.error('Error fetching active orders for stock check:', activeOrdersError)
      return new Response(JSON.stringify({ error: 'Inventory check failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    type ProductRow = {
      id: string;
      unit?: string | null;
      qty?: number | null;
      tax_behavior?: 'inherit' | 'taxable' | 'exempt' | null;
      allow_pre_order?: boolean | null;
      pricing_mode?: string | null;
      is_deposit_product?: boolean | null;
      deposit_prod_price_per_lb?: number | string | null;
      deposit_fixed_total?: number | string | null;
      reserved_weight_lbs?: number | null;
    }
    type PackageBinRow = {
      package_key: string;
      qty?: number | null;
      reserved_qty?: number | null;
      bin_kind?: string | null;
      qty_lbs?: number | null;
      reserved_lbs?: number | null;
      weight_btn?: number | null;
      product_id?: string | null;
    }

    const productsById = new Map<string, ProductRow>((products ?? []).map((p: ProductRow) => [p.id, p]))

    const subtotalCentsServer = orderRequest.lines.reduce(
      (sum, line) => sum + Math.max(0, Number(line.lineTotalCents ?? 0)),
      0
    )
    const discountCentsServer = Math.max(0, Number(orderRequest.discountCents ?? 0))
    const shippingChargeCentsServer = Math.max(0, Number(orderRequest.shippingChargeCents ?? 0))
    const deliveryChargeCentsServer = Math.max(0, Number(orderRequest.deliveryChargeCents ?? 0))
    const onlinePaymentFeeCentsServer = Math.max(0, Number(orderRequest.onlinePaymentFeeCents ?? 0))
    const subtotalAfterDiscountCentsServer = Math.max(0, subtotalCentsServer - discountCentsServer)

    const tenantChargeTax = tenantTaxConfig?.charge_tax_on_online !== false
    const tenantTaxIncluded = tenantTaxConfig?.tax_included === true
    const tenantTaxRate = Number(tenantTaxConfig?.tax_rate ?? 0)

    const taxableSubtotalCentsServer = orderRequest.lines.reduce((sum, line) => {
      const product = productsById.get(line.productId)
      const behavior = (product?.tax_behavior ?? 'exempt') as 'inherit' | 'taxable' | 'exempt'
      const lineTotal = Math.max(0, Number(line.lineTotalCents ?? 0))
      const taxable = behavior === 'taxable' || (behavior === 'inherit' && tenantChargeTax)
      return taxable ? (sum + lineTotal) : sum
    }, 0)

    let taxCentsServer = 0
    if (tenantChargeTax && !tenantTaxIncluded && tenantTaxRate > 0) {
      const discountRatio = subtotalCentsServer > 0
        ? Math.min(1, subtotalAfterDiscountCentsServer / subtotalCentsServer)
        : 0
      const taxableAfterDiscountCents = Math.max(0, Math.round(taxableSubtotalCentsServer * discountRatio))
      taxCentsServer = Math.round(taxableAfterDiscountCents * tenantTaxRate)
    }

    const totalCentsServer = subtotalAfterDiscountCentsServer + taxCentsServer + shippingChargeCentsServer + deliveryChargeCentsServer + onlinePaymentFeeCentsServer
    if (estimatedTotalCents === null && isWeightEstimate) {
      estimatedTotalCents = totalCentsServer
    }
    const binsByKey = new Map<string, PackageBinRow>((bins ?? []).map((b: PackageBinRow) => [b.package_key, b]))
    const bulkBinsByProduct = new Map<string, PackageBinRow>()
    const binsByProduct = new Map<string, PackageBinRow[]>()
    const activeDemandByProduct = new Map<string, { qty: number; lbs: number }>()
    ;(bins ?? []).forEach((b: PackageBinRow) => {
      if (b.product_id) {
        const list = binsByProduct.get(b.product_id) ?? []
        list.push(b)
        binsByProduct.set(b.product_id, list)
      }
      if (b.bin_kind === 'bulk_weight' && b.product_id) {
        bulkBinsByProduct.set(b.product_id, b)
      }
    })

    for (const order of activeOrders ?? []) {
      for (const activeLine of order.order_lines ?? []) {
        const productId = String(activeLine.product_id ?? '').trim()
        if (!productId || activeLine.is_pre_order === true || activeLine.line_type === 'pack_for_you') continue
        if (hasReservationEvidence(activeLine)) continue

        const quantity = Math.max(0, Number(activeLine.quantity ?? 0))
        const requestedWeightLbs = Number(activeLine.requested_weight_lbs ?? 0)
        const weightLbs = Number(activeLine.weight_lbs ?? 0)
        const binWeight = Number(activeLine.bin_weight ?? 0)
        const lbs = requestedWeightLbs > 0
          ? requestedWeightLbs * quantity
          : weightLbs > 0
            ? weightLbs
            : binWeight > 0
              ? binWeight * quantity
              : 0
        const current = activeDemandByProduct.get(productId) ?? { qty: 0, lbs: 0 }
        activeDemandByProduct.set(productId, {
          qty: current.qty + quantity,
          lbs: current.lbs + lbs,
        })
      }
    }
    const depositProducts = (products ?? []).filter((p: ProductRow) => p.is_deposit_product === true)
    for (const p of depositProducts) {
      const hasWeightFinal = p.deposit_prod_price_per_lb !== null && p.deposit_prod_price_per_lb !== undefined && Number(p.deposit_prod_price_per_lb) > 0
      const hasFixedFinal = p.deposit_fixed_total !== null && p.deposit_fixed_total !== undefined && Number(p.deposit_fixed_total) > 0
      if (hasWeightFinal && hasFixedFinal) {
        console.warn('Blocking order: deposit pricing conflict (both weight and fixed configured)', {
          productId: p.id,
          deposit_prod_price_per_lb: p.deposit_prod_price_per_lb,
          deposit_fixed_total: p.deposit_fixed_total,
        })
        return new Response(JSON.stringify({ error: 'deposit_pricing_mode_conflict' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!hasWeightFinal && !hasFixedFinal) {
        console.warn('Deposit pricing mode not configured on product; continuing with order total as source of truth', {
          productId: p.id,
        })
      }
    }
    const hasDepositProduct = depositProducts.length > 0
    const externalDepositPaymentMethod = ['venmo', 'zelle'].includes((orderRequest.paymentMethod || '').toLowerCase())
    const cardDepositPaymentNow = orderRequest.paymentMethod === 'card' && orderRequest.paymentNowChoice !== 'pay_at_pickup'
    const depositPaymentWillBeCollectedNow = cardDepositPaymentNow || externalDepositPaymentMethod

    if (hasDepositProduct && !depositPaymentWillBeCollectedNow) {
      return new Response(JSON.stringify({ error: 'deposit_requires_pay_now' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const depositAmount = hasDepositProduct
      ? ((orderRequest.depositChargeCents ?? totalCentsServer) / 100)
      : null
    const depositPaidAt = hasDepositProduct && orderRequest.stripePaymentIntentId ? new Date().toISOString() : null
    const depositPricePerLb = depositProducts.find((p: ProductRow) => p.deposit_prod_price_per_lb !== null && p.deposit_prod_price_per_lb !== undefined)?.deposit_prod_price_per_lb
    // Delivery/shipping are paid at checkout; balance_due should represent product/tax remaining.
    const baseOrderTotalExcludingFulfillmentCents = Math.max(0, totalCentsServer - shippingChargeCentsServer - deliveryChargeCentsServer)
    const balanceDue = hasDepositProduct && depositAmount !== null
      ? Math.max(0, (baseOrderTotalExcludingFulfillmentCents / 100) - depositAmount)
      : null

    const shortages: Array<{
      productId: string;
      productName: string;
      requestedQty: number;
      requestedWeightLbs?: number | null;
      binWeight?: number | null;
      weightLbs?: number | null;
      lineType?: 'exact_package' | 'pack_for_you';
      available: number;
    }> = []

    for (const line of orderRequest.lines) {
      // Skip inventory check for pre-order items
      if (line.isPreOrder) {
        console.log('Skipping inventory check for pre-order item:', line.productId)
        continue
      }

      const productRow = productsById.get(line.productId)
      const activeDemand = activeDemandByProduct.get(line.productId) ?? { qty: 0, lbs: 0 }
      const normalizedLine = normalizeStorefrontWeightLine(line, productRow?.unit ?? null)
      const isPackForYou = normalizedLine.lineType === 'pack_for_you'
      const requestedWeight = normalizedLine.requestedWeightLbs ?? normalizedLine.weightLbs ?? line.binWeight ?? 0
      const requestedWeightTotal = requestedWeight * (line.qty ?? 1)
      const bulkBinKey = `${line.productId}|bulk`
      const bulkBin = bulkBinsByProduct.get(line.productId) ?? binsByKey.get(bulkBinKey)

      if (isPackForYou && bulkBin) {
        const availableBulk = Math.max(0, (bulkBin.qty_lbs ?? 0) - (bulkBin.reserved_lbs ?? 0))
        const requiredBulk = requestedWeightTotal
        if (requiredBulk > availableBulk) {
          shortages.push({
            productId: line.productId,
            productName: line.productName,
            requestedQty: line.qty ?? 1,
            requestedWeightLbs: requestedWeight,
            binWeight: line.binWeight,
            weightLbs: line.weightLbs,
            lineType: line.lineType,
            available: availableBulk,
          })
        }
        continue
      }

      const unitLower = (productRow?.unit || '').toLowerCase()
      const required = line.qty ?? 1

      if (unitLower.startsWith('lb')) {
        // Weight-based item: use dual-check (bin reserves + product reserves)
        // available = SUM(weight_btn × qty) - SUM(weight_btn × reserved_qty) - products.reserved_weight_lbs
        const productBins = binsByProduct.get(line.productId) ?? []
        const totalWeight = productBins.reduce((sum, b) => {
          if (b.bin_kind === 'bulk_weight') return sum // bulk handled separately above
          return sum + ((b.weight_btn ?? 0) * (b.qty ?? 0))
        }, 0)
        const reservedBinWeight = productBins.reduce((sum, b) => {
          if (b.bin_kind === 'bulk_weight') return sum
          return sum + ((b.weight_btn ?? 0) * (b.reserved_qty ?? 0))
        }, 0)
        const reservedProductWeight = productRow?.reserved_weight_lbs ?? 0
        const available = Math.max(0, totalWeight - reservedBinWeight - reservedProductWeight - activeDemand.lbs)
        const requestedWeight = line.requestedWeightLbs ?? line.weightLbs ?? line.binWeight ?? 0
        const requiredWeight = requestedWeight * required

        if (requiredWeight > available) {
          shortages.push({
            productId: line.productId,
            productName: line.productName,
            requestedQty: required,
            requestedWeightLbs: requestedWeight,
            binWeight: line.binWeight,
            weightLbs: line.weightLbs,
            lineType: line.lineType,
            available,
          })
        }
      } else {
        const productBins = (binsByProduct.get(line.productId) ?? []).filter((b) => b.bin_kind !== 'bulk_weight')
        const availableFromBins = productBins.length > 0
          ? productBins.reduce((sum, b) => sum + Math.max(0, (b.qty ?? 0) - (b.reserved_qty ?? 0)), 0)
          : null
        const available = Math.max(0, (availableFromBins !== null ? availableFromBins : (productRow?.qty ?? 0)) - activeDemand.qty)

        if (required > available) {
          shortages.push({
            productId: line.productId,
            productName: line.productName,
            requestedQty: required,
            requestedWeightLbs: line.requestedWeightLbs ?? null,
            binWeight: line.binWeight,
            weightLbs: line.weightLbs,
            lineType: line.lineType,
            available,
          })
        }
      }
    }

    // If shortages were found, re-verify against actual product_reservations
    // (the products.reserved_weight_lbs cache can drift from reality)
    if (shortages.length > 0) {
      const shortageProductIds = Array.from(new Set(shortages.map((s) => s.productId)))

      // Fetch ACTUAL active product-level reservations for the affected products
      const { data: activeReservations, error: resError } = await supabaseAdmin
        .from('product_reservations')
        .select('product_id, reserved_weight_lbs')
        .eq('tenant_id', orderRequest.tenantId)
        .in('product_id', shortageProductIds)
        .eq('status', 'active')

      if (resError) {
        console.error('Error fetching product_reservations for recheck:', resError)
        // Fall through to original shortages check for safety
      }

      // Sum actual reserved weight per product
      const actualReservedByProduct = new Map<string, number>()
      if (activeReservations) {
        for (const r of activeReservations) {
          const cur = actualReservedByProduct.get(r.product_id) ?? 0
          actualReservedByProduct.set(r.product_id, cur + (Number(r.reserved_weight_lbs) || 0))
        }
      }

      // Recompute shortages using actual reservations instead of cached value
      const verifiedShortages: typeof shortages = []
      for (const line of orderRequest.lines) {
        if (line.isPreOrder) continue
        // Only recheck products that were in the initial shortage list
        if (!shortageProductIds.includes(line.productId)) continue

        const productRow = productsById.get(line.productId)
        const unitLower = (productRow?.unit || '').toLowerCase()
        const required = line.qty ?? 1

        if (unitLower.startsWith('lb')) {
          const productBins = binsByProduct.get(line.productId) ?? []
          const totalWeight = productBins.reduce((sum, b) => {
            if (b.bin_kind === 'bulk_weight') return sum
            return sum + ((b.weight_btn ?? 0) * (b.qty ?? 0))
          }, 0)
          const reservedBinWeight = productBins.reduce((sum, b) => {
            if (b.bin_kind === 'bulk_weight') return sum
            return sum + ((b.weight_btn ?? 0) * (b.reserved_qty ?? 0))
          }, 0)
          const cachedReservedWeight = productRow?.reserved_weight_lbs ?? 0
          const actualReservedWeight = actualReservedByProduct.get(line.productId) ?? 0
          const available = Math.max(0, totalWeight - reservedBinWeight - actualReservedWeight)
          const reqWeight = line.requestedWeightLbs ?? line.weightLbs ?? line.binWeight ?? 0
          const requiredWeight = reqWeight * required

          console.warn(`📊 Stock recheck for ${line.productId}: totalWeight=${totalWeight}, reservedBinWeight=${reservedBinWeight}, cachedReservedWeight=${cachedReservedWeight}, actualReservedWeight=${actualReservedWeight}, available=${available}, required=${requiredWeight}`)

          // If cache was stale, fix it immediately to avoid dangling async work in edge runtime.
          if (cachedReservedWeight !== actualReservedWeight) {
            console.warn(`⚠️ Cache drift detected for product ${line.productId}: cached=${cachedReservedWeight}, actual=${actualReservedWeight}. Repairing.`)
            const { error: repairError } = await supabaseAdmin
              .from('products')
              .update({ reserved_weight_lbs: actualReservedWeight })
              .eq('id', line.productId)
              .eq('tenant_id', orderRequest.tenantId)

            if (repairError) {
              console.error('Failed to repair reserved_weight_lbs cache:', repairError)
            } else {
              console.log(`✅ Repaired reserved_weight_lbs for ${line.productId}: ${cachedReservedWeight} → ${actualReservedWeight}`)
            }
          }

          if (requiredWeight > available) {
            verifiedShortages.push({
              productId: line.productId,
              productName: line.productName,
              requestedQty: required,
              requestedWeightLbs: reqWeight,
              binWeight: line.binWeight,
              weightLbs: line.weightLbs,
              lineType: line.lineType,
              available,
            })
          }
        } else {
          // Non-lb items: recheck uses bin data directly (no cache dependency), so keep original shortage
          const originalShortage = shortages.find((s) => s.productId === line.productId)
          if (originalShortage) {
            verifiedShortages.push(originalShortage)
          }
        }
      }

      if (verifiedShortages.length > 0) {
        console.warn('Blocking order: insufficient stock for lines (verified)', verifiedShortages)
        return new Response(JSON.stringify({ error: 'out_of_stock', shortages: verifiedShortages }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      console.log('✅ Initial shortages resolved after cache recheck — proceeding with order')
    }

    // Charge card payments before creating order records so checkout cannot succeed without a Stripe charge.
    let chargedStripePaymentIntentId: string | null = orderRequest.stripePaymentIntentId ?? null
    const shouldChargeCardNow = orderRequest.paymentMethod === 'card' && orderRequest.paymentNowChoice !== 'pay_at_pickup'
    if (shouldChargeCardNow && !chargedStripePaymentIntentId) {
      const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
      if (!stripeSecretKey) {
        return new Response(JSON.stringify({ error: 'payment_processing_not_configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const connectedAccountId = typeof tenantTaxConfig?.stripe_account_id === 'string'
        ? tenantTaxConfig.stripe_account_id
        : ''
      if (!connectedAccountId) {
        return new Response(JSON.stringify({ error: 'stripe_account_not_connected' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const paymentMethodId = (orderRequest.paymentMethodId || '').trim()
      const confirmationToken = (orderRequest.confirmationToken || '').trim()
      if (!paymentMethodId && !confirmationToken) {
        return new Response(JSON.stringify({ error: 'card_payment_method_required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const chargeAmountCents = hasDepositProduct
        ? Math.max(0, Math.round(Number((orderRequest.depositChargeCents ?? totalCentsServer) + onlinePaymentFeeCentsServer)))
        : totalCentsServer

      if (!Number.isFinite(chargeAmountCents) || chargeAmountCents <= 0) {
        return new Response(JSON.stringify({ error: 'invalid_charge_amount' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      try {
        const stripe = new Stripe(stripeSecretKey, {
          apiVersion: '2023-10-16',
          httpClient: Stripe.createFetchHttpClient(),
        })

        const paymentIntentParams: Record<string, any> = {
          amount: chargeAmountCents,
          currency: 'usd',
          payment_method_types: ['card'],
          confirm: true,
          return_url: `${req.headers.get('origin') || 'https://app.purveyos.com'}/checkout/success`,
          metadata: {
            tenantId: orderRequest.tenantId,
            customerEmail: orderRequest.customerEmail,
            source: 'storefront',
          },
        }

        if (paymentMethodId) {
          paymentIntentParams.payment_method = paymentMethodId
        } else {
          paymentIntentParams.confirmation_token = confirmationToken
        }

        const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams, {
          stripeAccount: connectedAccountId,
        })

        if (paymentIntent.status === 'succeeded') {
          chargedStripePaymentIntentId = paymentIntent.id
          orderRequest.stripePaymentIntentId = paymentIntent.id
        } else if (paymentIntent.status === 'requires_action') {
          return new Response(JSON.stringify({ error: 'card_authentication_required' }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        } else {
          console.error('Card payment did not succeed:', paymentIntent.status)
          return new Response(JSON.stringify({ error: 'card_payment_failed' }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      } catch (stripeError) {
        console.error('Error charging Stripe card payment:', stripeError)
        return new Response(JSON.stringify({ error: 'card_payment_failed' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Start a transaction by using multiple operations
    // 1. Create the order
    const orderId = crypto.randomUUID()

    const normalizedRequestedDeliveryDate =
      orderRequest.deliveryMethod === 'delivery' && typeof orderRequest.requestedDeliveryDate === 'string'
        ? orderRequest.requestedDeliveryDate.trim()
        : null

    if (orderRequest.deliveryMethod === 'delivery' && normalizedRequestedDeliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalizedRequestedDeliveryDate)) {
      return new Response(
        JSON.stringify({ error: 'requested_delivery_date_invalid' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    
    // Build note field with delivery/payment info
    const noteParts = []
    if (orderRequest.deliveryMethod) {
      noteParts.push(`fulfillment: ${orderRequest.deliveryMethod}`)
    }
    if (orderRequest.fulfillmentLocation) {
      noteParts.push(`location: ${orderRequest.fulfillmentLocation}`)
    }
    if (orderRequest.deliveryAddress) {
      noteParts.push(`address: ${orderRequest.deliveryAddress}`)
    }
    if (normalizedRequestedDeliveryDate) {
      noteParts.push(`requested delivery date: ${normalizedRequestedDeliveryDate}`)
    }
    if (orderRequest.shippingChargeCents && orderRequest.shippingChargeCents > 0) {
      noteParts.push(`shipping charge: $${(orderRequest.shippingChargeCents / 100).toFixed(2)}`)
    }
    if (orderRequest.deliveryChargeCents && orderRequest.deliveryChargeCents > 0) {
      noteParts.push(`delivery charge: $${(orderRequest.deliveryChargeCents / 100).toFixed(2)}`)
    }
    if (orderRequest.paymentMethod) {
      noteParts.push(`payment: ${orderRequest.paymentMethod}`)
    }
    if (orderRequest.deliveryNotes) {
      noteParts.push(`notes: ${orderRequest.deliveryNotes}`)
    }
    const note = noteParts.join(' | ')
    
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        id: orderId,
        tenant_id: orderRequest.tenantId,
        user_id: userId, // Link to authenticated user if logged in
        customer_name: orderRequest.customerName,
        customer_email: orderRequest.customerEmail,
        customer_phone: orderRequest.customerPhone,
        customer_zip: orderRequest.customerZip ?? null,
        customer_street: orderRequest.customerStreet ?? null,
        customer_city: orderRequest.customerCity ?? null,
        customer_state: orderRequest.customerState ?? null,
        note: note || null,
        fulfillment_method: orderRequest.deliveryMethod,
        requested_delivery_date: normalizedRequestedDeliveryDate,
        subtotal_cents: subtotalCentsServer,
        tax_cents: taxCentsServer,
        shipping_cents: shippingChargeCentsServer,
        shipping_estimate_high_cents: orderRequest.shippingEstimateHighCents ?? shippingChargeCentsServer,
        delivery_cents: deliveryChargeCentsServer,
        online_payment_fee_cents: onlinePaymentFeeCentsServer,
        total_cents: totalCentsServer,
        total: (totalCentsServer / 100).toFixed(2),
        discount_cents: discountCentsServer,
        payment_method: orderRequest.paymentMethod,
        is_weight_estimate: isWeightEstimate,
        estimated_total_cents: estimatedTotalCents,
        is_subscription_order: orderRequest.subscription?.enabled ?? false,
        ...(hasDepositProduct
          ? {
              deposit_amount: depositAmount,
              deposit_paid_at: depositPaidAt,
              balance_due: balanceDue,
              hanging_weight_lbs: null,
              price_per_lb: depositPricePerLb !== undefined && depositPricePerLb !== null ? Number(depositPricePerLb) : null,
            }
          : {}),
        source: 'storefront',
        status: 'pending',
        payment_status: orderRequest.stripePaymentIntentId ? 'paid' : 'pending',
        stripe_payment_intent_id: orderRequest.stripePaymentIntentId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    console.log('💳 [Edge] Order created with discount_cents:', discountCentsServer, 'Full order object:', {
      subtotal_cents: subtotalCentsServer,
      discount_cents: discountCentsServer,
      tax_cents: taxCentsServer,
      online_payment_fee_cents: onlinePaymentFeeCentsServer,
      total_cents: totalCentsServer,
    });

    if (orderError) {
      console.error('Error creating order:', orderError)
      const orderMessage = `${orderError.message || ''}`
      if (
        orderMessage.includes('delivery_date_capacity_reached') ||
        orderMessage.includes('delivery_date_in_past') ||
        orderMessage.includes('delivery_date_outside_window') ||
        orderMessage.includes('delivery_date_not_allowed') ||
        orderMessage.includes('delivery_date_before_lead_time')
      ) {
        return new Response(
          JSON.stringify({
            error: orderMessage,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }
      throw orderError
    }

    console.log('Order created:', order)

    // Log discount usage if discount was applied
    if (discountCentsServer > 0) {
      console.log('📝 Creating discount_usage_log entry for order:', { orderId, discountCents: discountCentsServer })
      
      // Find discount by matching the discount amount (heuristic - may need refinement)
      const { data: discounts } = await supabaseAdmin
        .from('tenant_discounts')
        .select('id')
        .eq('tenant_id', orderRequest.tenantId)
        .eq('is_active', true)
        .limit(1)
      
      const discountId = discounts?.[0]?.id || 'unknown-discount'
      
      const { error: usageError } = await supabaseAdmin
        .from('discount_usage_log')
        .insert({
          id: crypto.randomUUID(),
          discount_id: discountId,
          tenant_id: orderRequest.tenantId,
          order_id: orderId,
          customer_id: userId || null,
          discount_amount_applied: discountCentsServer,
          created_at: new Date().toISOString(),
        })
      
      if (usageError) {
        console.warn('Error logging discount usage (non-blocking):', usageError)
        // Don't throw - discount logging is not critical to order creation
      } else {
        console.log('✓ Discount usage logged for order:', orderId)
      }
    }

    // 2. Create order lines and reserve inventory only (never decrement here)
    for (const line of orderRequest.lines) {
      // Convert unitPriceCents to dollars for price_per field
      const pricePerDollars = line.unitPriceCents / 100
      const normalizedLine = normalizeStorefrontWeightLine(line, line.pricePer)

      console.log('📦 Processing line:', {
        productName: line.productName,
        qty: line.qty,
        unitPriceCents: line.unitPriceCents,
        pricePerDollars,
        lineTotalCents: line.lineTotalCents,
        weightLbs: line.weightLbs,
        binWeight: line.binWeight,
        isPreOrder: line.isPreOrder
      })

      const isPackForYou = normalizedLine.lineType === 'pack_for_you'
      const requestedWeight = normalizedLine.requestedWeightLbs ?? normalizedLine.weightLbs ?? line.binWeight ?? 0
      const requestedWeightTotal = requestedWeight * (line.qty ?? 1)
      // Do not pre-reserve bins during storefront checkout.
      // Active pending order demand is enforced by DB triggers, and pre-reserving here
      // can double-count demand and leave stale reserved_qty on partial failures.
      const selectedBinsPayload = null

      // Reservation metadata stays null until fulfillment/make-ready time.
      let reservedAt: string | null = null
      let reservationExpiresAt: string | null = null

      // For pack-for-you orders: Create product-level reservation (reserves weight, not packages)
      // This updates products.reserved_lbs via trigger, without touching package_bins.reserved_qty
      const orderLineId = crypto.randomUUID()

      // Insert order line with reservation metadata (if any)
      const { error: lineError } = await supabaseAdmin
        .from('order_lines')
        .insert({
          id: orderLineId,
          order_id: orderId,
          tenant_id: orderRequest.tenantId,
          product_id: line.productId,
          product_name: line.productName,
          quantity: line.qty,
          unit_price_cents: line.unitPriceCents,
          price_per: pricePerDollars,
          line_total_cents: line.lineTotalCents,
          bin_weight: line.binWeight ?? null,
          weight_lbs: normalizedLine.weightLbs,
          requested_weight_lbs: normalizedLine.requestedWeightLbs,
          line_type: normalizedLine.lineType,
          is_pre_order: line.isPreOrder ?? false,
          fulfillment_bucket: line.isPreOrder ? 'LATER' : 'NOW',
          selected_bins: selectedBinsPayload,
          reserved_at: reservedAt,
          reservation_expires_at: reservationExpiresAt,
          created_at: new Date().toISOString(),
        })

      if (lineError) {
        console.error('Error creating order line:', lineError)
        await rollbackFailedStorefrontOrder({
          supabaseAdmin,
          tenantId: orderRequest.tenantId,
          orderId,
        })
        const lineMessage = `${lineError.message || ''}`
        if (lineMessage.includes('out_of_stock')) {
          const availableMatch = lineMessage.match(/has\s+([0-9]+(?:\.[0-9]+)?)\s+available/i)
          const available = availableMatch ? Number(availableMatch[1]) : 0
          return new Response(
            JSON.stringify({
              error: 'out_of_stock',
              shortages: [{
                productId: line.productId,
                productName: line.productName,
                requestedQty: line.qty ?? 1,
                requestedWeightLbs: line.requestedWeightLbs ?? line.weightLbs ?? line.binWeight ?? null,
                binWeight: line.binWeight ?? null,
                weightLbs: line.weightLbs ?? null,
                lineType: line.lineType,
                available,
              }],
            }),
            {
              status: 409,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }
        throw lineError
      }

      if (isPackForYou && requestedWeightTotal > 0) {
        const { error: productReservationError } = await supabaseAdmin
          .from('product_reservations')
          .insert({
            id: crypto.randomUUID(),
            tenant_id: orderRequest.tenantId,
            order_id: orderId,
            order_line_id: orderLineId,
            product_id: line.productId,
            reserved_weight_lbs: requestedWeightTotal,
            reserved_qty: null, // NULL for weight-only reservations
            status: 'active',
            created_at: new Date().toISOString(),
          })

        if (productReservationError) {
          console.error('Error creating product reservation for pack-for-you:', productReservationError)
          await rollbackFailedStorefrontOrder({
            supabaseAdmin,
            tenantId: orderRequest.tenantId,
            orderId,
          })
          throw productReservationError
        }

        console.log(`✅ Reserved ${requestedWeightTotal} lbs at product level for pack-for-you order (no package count)`)
      }

      if (line.isPreOrder) {
        console.log(`Skipping inventory reservation for pre-order line ${line.productName}`)
      } else {
        console.log(`Stored pending line demand for storefront line ${line.productName}`)
      }
    }

    // 3. Create customer_subscription if subscription is enabled
    if (orderRequest.subscription?.enabled) {
      const sub = orderRequest.subscription
      console.log('Creating customer subscription:', JSON.stringify(sub, null, 2))
      
      if (!sub.subscriptionProductId) {
        console.error('⚠️ subscriptionProductId is missing from subscription payload!');
        console.error('Full subscription object:', sub);
      } else {
        // Calculate next delivery date based on cadence
        const startDate = sub.startDate ? new Date(sub.startDate) : new Date()
        const nextDeliveryDate = new Date(startDate)
        
        if (sub.cadence === 'weekly') {
          nextDeliveryDate.setDate(nextDeliveryDate.getDate() + 7)
        } else if (sub.cadence === 'biweekly') {
          nextDeliveryDate.setDate(nextDeliveryDate.getDate() + 14)
        } else if (sub.cadence === 'monthly') {
          nextDeliveryDate.setMonth(nextDeliveryDate.getMonth() + 1)
        }
        
        // Get subscription product details
        console.log(`Looking up subscription_product with id: ${sub.subscriptionProductId}`);
        const { data: subscriptionProduct, error: subProductError } = await supabaseAdmin
          .from('subscription_products')
          .select('*')
          .eq('id', sub.subscriptionProductId)
          .single()
        
        if (subProductError) {
          console.error('Error fetching subscription product:', subProductError)
          console.error('Query was for subscription_product_id:', sub.subscriptionProductId);
          // Don't fail the order, but log it
        } else if (!subscriptionProduct) {
          console.error('⚠️ No subscription_product found with id:', sub.subscriptionProductId);
        } else {
          console.log('✓ Found subscription product:', subscriptionProduct.name);
          
          const subscriptionRecord = {
            id: crypto.randomUUID(),
            tenant_id: orderRequest.tenantId,
            subscription_product_id: sub.subscriptionProductId!,
            user_id: userId, // Link to authenticated user for portal access
            customer_name: orderRequest.customerName,
            customer_email: orderRequest.customerEmail,
            customer_phone: orderRequest.customerPhone || null,
            status: 'active',
            start_date: startDate.toISOString().split('T')[0], // DATE field, not TIMESTAMPTZ
            next_delivery_date: nextDeliveryDate.toISOString().split('T')[0], // DATE field
            price_per_interval: subscriptionProduct.price_per_interval,
            interval_type: sub.cadence!,
            interval_count: subscriptionProduct.interval_count || 1,
            total_deliveries_expected: subscriptionProduct.duration_type === 'fixed_duration' 
              ? subscriptionProduct.duration_intervals 
              : null,
            end_date: subscriptionProduct.duration_type === 'seasonal' && subscriptionProduct.season_end_date
              ? subscriptionProduct.season_end_date
              : null,
            deliveries_fulfilled: 0,  // Changed from 1 to 0 (not fulfilled yet, just ordered)
            payment_status: orderRequest.stripePaymentIntentId ? 'paid' : 'pending',
            total_paid_cents: orderRequest.stripePaymentIntentId
              ? (hasDepositProduct
                ? ((orderRequest.depositChargeCents ?? totalCentsServer) + onlinePaymentFeeCentsServer)
                : totalCentsServer)
              : 0,
            stripe_payment_intent_id: orderRequest.stripePaymentIntentId || null,  // Link for idempotency + tracking
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          
          console.log('Inserting customer_subscription:', JSON.stringify(subscriptionRecord, null, 2));
          
          // Create customer_subscription record
          const { error: subscriptionError } = await supabaseAdmin
            .from('customer_subscriptions')
            .insert(subscriptionRecord)
          
          if (subscriptionError) {
            console.error('❌ Error creating customer subscription:', subscriptionError)
            console.error('Error details:', JSON.stringify(subscriptionError, null, 2));
            // Don't fail the order, but log it
          } else {
            console.log('✓ Customer subscription created successfully with id:', subscriptionRecord.id)
            
            // ===== NEW: Create subscription_deliveries =====
            try {
              const deliveryId = crypto.randomUUID()
              const startDateStr = startDate.toISOString().split('T')[0]
              
              console.log('🎁 [Subscription Setup] Fetching box items for subscription product:', sub.subscriptionProductId)
              // Fetch box items for the subscription product
              const { data: boxItems, error: boxItemsError } = await supabaseAdmin
                .from('subscription_box_items')
                .select(
                  'id, product_id, substitution_group, substitution_group_units_allowed, is_optional, is_substitution_option, display_order, default_quantity'
                )
                .eq('subscription_product_id', sub.subscriptionProductId)
                .order('display_order', { ascending: true })
              
              console.log('🎁 [Subscription Setup] Box items query result:', { boxItemsError, boxItemsCount: boxItems?.length })
              
              if (boxItemsError) {
                console.error('❌ [Subscription Setup] Could not fetch subscription box template:', boxItemsError)
              } else if (!boxItems || boxItems.length === 0) {
                console.warn('⚠️ [Subscription Setup] No box items found for subscription product')
              } else {
                console.log('✓ [Subscription Setup] Found', boxItems.length, 'box items:', boxItems.map((b: any) => ({ id: b.id, product_id: b.product_id, group: b.substitution_group })))
                // Build custom_items snapshot (JSONB object, not stringified)
                const choices = buildChoicesFromRequest(orderRequest, boxItems)
                console.log('🎁 [Subscription Setup] Built choices:', choices)
                
                const customItems = {
                  snapshot: {
                    client_generated_id: crypto.randomUUID(),
                    subscription_product_id: sub.subscriptionProductId,
                    subscription_product_name: subscriptionProduct.name,
                    choices: choices,
                  },
                  components: boxItems.map((item: any) => ({
                    subscription_box_item_id: item.id,
                    product_id: item.product_id,
                    substitution_group: item.substitution_group,
                    group_units_allowed: item.substitution_group_units_allowed,
                    is_optional: item.is_optional,
                    default_quantity: item.default_quantity,
                  })),
                }
                
                // Create subscription_deliveries (order_id = orders.id, UUID to UUID FK)
                const { error: deliveryError } = await supabaseAdmin
                  .from('subscription_deliveries')
                  .insert({
                    id: deliveryId,
                    tenant_id: orderRequest.tenantId,
                    customer_subscription_id: subscriptionRecord.id,
                    order_id: orderId,  // UUID link to orders.id
                    scheduled_date: startDateStr,
                    delivery_number: 1,
                    status: 'scheduled',  // NOT fulfilled yet
                    custom_items: customItems,  // JSONB object (NOT stringified)
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  })
                
                if (deliveryError) {
                  console.warn('⚠️ Error creating subscription_deliveries:', deliveryError)
                } else {
                  console.log('✓ Subscription delivery created:', deliveryId)
                  
                  // Create customer_substitution_preferences (normalized rows)
                  console.log('🎁 [Subscription Setup] Building preferences from', boxItems.length, 'box items and subscriptions:', orderRequest.subscription?.substitutions)
                  const preferences = buildPreferencesFromRequest(
                    subscriptionRecord.id,
                    orderRequest.tenantId,
                    orderRequest,
                    boxItems,
                    1  // delivery_number
                  )
                  
                  console.log('🎁 [Subscription Setup] Built', preferences.length, 'preferences')
                  if (preferences.length > 0) {
                    console.log('📝 [DEBUG] Inserting preferences:', JSON.stringify(preferences, null, 2))
                    const { error: prefsError, data: prefsData } = await supabaseAdmin
                      .from('customer_substitution_preferences')
                      .insert(preferences)
                    
                    if (prefsError) {
                      console.error('❌ [Subscription Setup] Error creating substitution preferences:', prefsError)
                      console.error('❌ [Subscription Setup] Error details:', JSON.stringify(prefsError, null, 2))
                    } else {
                      console.log('✓ [Subscription Setup] Created', preferences.length, 'substitution preferences. Response:', prefsData)
                    }
                  } else {
                    console.log('⚠️ [Subscription Setup] No preferences to insert')
                  }
                }
              }
            } catch (subRecordError) {
              console.warn('⚠️ Error creating subscription delivery records:', subRecordError)
              // Don't fail the order
            }
          }
        }
      }
    }

    // Send confirmation email to customer (non-blocking, don't fail order if notification fails)
    try {
      if (orderRequest.customerEmail) {
        console.log('📧 [Notify] Sending order confirmation email to customer:', orderRequest.customerEmail);
        console.log('📧 [Notify] Invoking order-notify function with body:', { orderId, emailType: 'order_confirmation', triggerSource: 'storefront' })
        const notifyResult = await supabaseAdmin.functions.invoke('order-notify', {
          body: {
            orderId,
            emailType: 'order_confirmation',
            triggerSource: 'storefront'
          }
        });
        console.log('📧 [Notify] Order confirmation notification result:', JSON.stringify(notifyResult, null, 2));
        if (notifyResult.error) {
          console.error('❌ [Notify] order-notify returned error (non-fatal):', JSON.stringify(notifyResult.error, null, 2));
        } else {
          console.log('✓ [Notify] Confirmation email triggered successfully');
        }
      }
    } catch (notifyError) {
      console.error('❌ [Notify] Failed to send confirmation email (non-fatal):', notifyError);
      console.error('❌ [Notify] Error details:', JSON.stringify(notifyError, null, 2));
    }

    // Notify tenant about new order using order-created-notify function
    try {
      console.log('📧 [Notify Tenant] Sending new order notification to tenant for order:', orderId);
      const tenantNotifyResult = await supabaseAdmin.functions.invoke('order-created-notify', {
        body: {
          orderId,
          tenantId: orderRequest.tenantId,
          customerName: orderRequest.customerName,
          customerEmail: orderRequest.customerEmail,
          customerPhone: orderRequest.customerPhone || null,
          totalCents: totalCentsServer,
          source: 'web',
          notifyCustomer: false  // Send tenant notification (not customer confirmation)
        }
      });
      console.log('📧 [Notify Tenant] Tenant notification result:', JSON.stringify(tenantNotifyResult, null, 2));
      if (tenantNotifyResult.error) {
        console.error('❌ [Notify Tenant] order-created-notify returned error (non-fatal):', JSON.stringify(tenantNotifyResult.error, null, 2));
      } else {
        console.log('✓ [Notify Tenant] Tenant notification triggered successfully');
      }
    } catch (tenantNotifyError) {
      console.error('❌ [Notify Tenant] Failed to send tenant notification (non-fatal):', tenantNotifyError);
      console.error('❌ [Notify Tenant] Error details:', JSON.stringify(tenantNotifyError, null, 2));
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        orderId: orderId,
        message: 'Order created successfully',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error in create-storefront-order function:', error)
    return new Response(
      JSON.stringify({
        error: message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

// ===== HELPER FUNCTIONS =====

/**
 * Build choices from customer's substitution selections
 * CORRECTED: Deduplicates groups and uses base item ID (not option row ID)
 */
function buildChoicesFromRequest(
  orderRequest: OrderRequest,
  boxItems: any[]
): Array<{
  subscription_box_item_id: string
  chosen_product_id: string
  qty: number
}> {
  const choices: any[] = []
  const processedGroups = new Set<string>()  // Deduplicate groups

  for (const boxItem of boxItems) {
    const groupName = boxItem.substitution_group

    if (groupName && orderRequest.subscription?.substitutions?.[groupName]) {
      // Skip if group already processed (avoid duplicate rows)
      if (processedGroups.has(groupName)) continue
      processedGroups.add(groupName)

      // Find base item (is_substitution_option=false) for this group
      const baseItem = boxItems.find(
        item => item.substitution_group === groupName && !item.is_substitution_option
      )

      if (!baseItem) {
        console.error(`No base item found for substitution group: ${groupName}`)
        continue
      }

      // Group items: customer picked alternatives
      const groupChoices = orderRequest.subscription.substitutions[groupName]
      if (Array.isArray(groupChoices)) {
        for (const choice of groupChoices) {
          choices.push({
            subscription_box_item_id: baseItem.id,  // Use BASE item ID
            chosen_product_id: choice.productId || choice.product_id,
            qty: choice.quantity || choice.qty || 1,
          })
        }
      }
    } else if (!boxItem.is_optional && !groupName && !boxItem.is_substitution_option) {
      // Non-optional, ungrouped: use default product
      choices.push({
        subscription_box_item_id: boxItem.id,
        chosen_product_id: boxItem.product_id,
        qty: boxItem.default_quantity || 1,
      })
    }
    // Optional items without explicit selection: skip
  }

  return choices
}

/**
 * Build normalized preferences for customer_substitution_preferences table
 * FIXED: Handles flat productId -> quantity map from storefront
 */
function buildPreferencesFromRequest(
  customerSubscriptionId: string,
  tenantId: string,
  orderRequest: OrderRequest,
  boxItems: any[],
  deliveryNumber: number
): any[] {
  const preferences: any[] = []
  const processedGroups = new Set<string>()

  console.log('📝 [buildPreferencesFromRequest] Input substitutions:', orderRequest.subscription?.substitutions)

  // Helper: find base item for a group (or first item if no base exists)
  const getBaseItemForGroup = (groupName: string) => {
    // Try to find base item (is_substitution_option=false)
    const baseItem = boxItems.find(
      item => item.substitution_group === groupName && !item.is_substitution_option
    )
    if (baseItem) return baseItem
    
    // Fallback: use first item in group if all are substitution options
    return boxItems.find(item => item.substitution_group === groupName)
  }

  // Helper: find which group a product belongs to
  const getGroupForProduct = (productId: string) => {
    const item = boxItems.find(item => item.product_id === productId)
    return item?.substitution_group || null
  }

  // Process explicit substitutions from storefront
  const substitutions = orderRequest.subscription?.substitutions || {}
  console.log('📝 Substitutions object type:', typeof substitutions, 'value:', substitutions)

  // Substitutions can be:
  // 1. Flat: { productId1: qty, productId2: qty }
  // 2. Grouped: { groupName: [{ productId, quantity }, ...] }
  // Detect format and process accordingly
  const isGrouped = Object.values(substitutions).some(v => Array.isArray(v))

  if (isGrouped) {
    // Format: { groupName: [{productId, quantity}, ...] }
    console.log('📝 Processing grouped substitutions format')
    for (const [groupName, items] of Object.entries(substitutions)) {
      if (!Array.isArray(items)) continue
      if (processedGroups.has(groupName)) continue
      processedGroups.add(groupName)

      const baseItem = getBaseItemForGroup(groupName)
      if (!baseItem) {
        console.warn(`⚠️ No base item found for group: ${groupName}`)
        continue
      }

      for (const item of items) {
        preferences.push({
          tenant_id: tenantId,
          customer_subscription_id: customerSubscriptionId,
          subscription_box_item_id: baseItem.id,
          chosen_product_id: item.productId || item.product_id,
          chosen_quantity: item.quantity || item.qty || 1,
          delivery_number: deliveryNumber,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
    }
  } else {
    // Format: { productId: qty, productId: qty, ... } (flat)
    console.log('📝 Processing flat substitutions format')
    for (const [key, qty] of Object.entries(substitutions)) {
      const groupName = getGroupForProduct(key)
      if (!groupName) {
        console.log(`⚠️ Product ${key} not found in box items, skipping`)
        continue
      }

      // For flat format: Allow multiple products from same group (customer can pick multiple substitutions)
      // Mark group as processed only for default-filling later
      const baseItem = getBaseItemForGroup(groupName)
      if (!baseItem) {
        console.warn(`⚠️ No base item found for group: ${groupName}`)
        continue
      }

      preferences.push({
        tenant_id: tenantId,
        customer_subscription_id: customerSubscriptionId,
        subscription_box_item_id: baseItem.id,
        chosen_product_id: key,  // The product ID
        chosen_quantity: Number(qty) || 1,
        delivery_number: deliveryNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      console.log(`✓ Added preference: group=${groupName}, product=${key}, qty=${qty}`)
      
      // Mark group as processed so we don't add defaults for it later
      processedGroups.add(groupName)
    }
  }

  // Also add defaults for groups NOT in substitutions (non-optional groups)
  for (const boxItem of boxItems) {
    const groupName = boxItem.substitution_group
    if (groupName && !processedGroups.has(groupName) && !boxItem.is_optional) {
      // Non-optional group with no substitution: add default
      processedGroups.add(groupName)
      const baseItem = getBaseItemForGroup(groupName)
      if (baseItem) {
        preferences.push({
          tenant_id: tenantId,
          customer_subscription_id: customerSubscriptionId,
          subscription_box_item_id: baseItem.id,
          chosen_product_id: baseItem.product_id,
          chosen_quantity: baseItem.default_quantity || 1,
          delivery_number: deliveryNumber,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        console.log(`✓ Added default preference for group: ${groupName}`)
      }
    }
  }

  // Add non-grouped, non-optional items with their defaults
  for (const boxItem of boxItems) {
    if (!boxItem.substitution_group && !boxItem.is_optional && !boxItem.is_substitution_option) {
      preferences.push({
        tenant_id: tenantId,
        customer_subscription_id: customerSubscriptionId,
        subscription_box_item_id: boxItem.id,
        chosen_product_id: boxItem.product_id,
        chosen_quantity: boxItem.default_quantity || 1,
        delivery_number: deliveryNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      console.log(`✓ Added default for non-grouped item: ${boxItem.product_id}`)
    }
  }

  console.log(`✓ Built ${preferences.length} total preferences`)
  return preferences
}
