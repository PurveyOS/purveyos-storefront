export const MAX_ORDER_LINES = 200

const ALLOWED_DELIVERY_METHODS = ['pickup', 'delivery', 'shipping', 'dropoff', 'other']
const ALLOWED_PAYMENT_METHODS = ['venmo', 'zelle', 'cashapp', 'card', 'cash', 'pay_later']

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export type MinimalOrderLine = {
  productId?: unknown
  productName?: unknown
  qty?: unknown
  unitPriceCents?: unknown
  lineTotalCents?: unknown
}

export type MinimalOrderRequest = {
  tenantId?: unknown
  customerEmail?: unknown
  customerName?: unknown
  deliveryMethod?: unknown
  paymentMethod?: unknown
  lines?: unknown
  subtotalCents?: unknown
  taxCents?: unknown
  totalCents?: unknown
  discountCents?: unknown
  shippingChargeCents?: unknown
  deliveryChargeCents?: unknown
  onlinePaymentFeeCents?: unknown
  depositChargeCents?: unknown
}

/**
 * Structural validation for the storefront checkout payload. This rejects
 * malformed/negative/non-integer input before any pricing or Stripe logic
 * runs. It does not (and cannot) validate that prices are authoritative —
 * that happens separately via server-side product price recomputation.
 */
export function validateOrderRequestShape(orderRequest: MinimalOrderRequest): string | null {
  if (!isNonEmptyString(orderRequest.tenantId)) return 'tenantId is required'
  if (!isNonEmptyString(orderRequest.customerEmail)) return 'customerEmail is required'
  if (!isNonEmptyString(orderRequest.customerName)) return 'customerName is required'
  if (!isNonEmptyString(orderRequest.deliveryMethod) || !ALLOWED_DELIVERY_METHODS.includes(orderRequest.deliveryMethod as string)) {
    return 'deliveryMethod must be one of: ' + ALLOWED_DELIVERY_METHODS.join(', ')
  }
  if (!isNonEmptyString(orderRequest.paymentMethod) || !ALLOWED_PAYMENT_METHODS.includes(orderRequest.paymentMethod as string)) {
    return 'paymentMethod must be one of: ' + ALLOWED_PAYMENT_METHODS.join(', ')
  }
  if (!Array.isArray(orderRequest.lines) || orderRequest.lines.length === 0) {
    return 'lines must be a non-empty array'
  }
  if (orderRequest.lines.length > MAX_ORDER_LINES) {
    return `lines exceeds the maximum of ${MAX_ORDER_LINES}`
  }

  for (const optionalMonetaryField of [
    'subtotalCents', 'taxCents', 'totalCents', 'discountCents',
    'shippingChargeCents', 'deliveryChargeCents', 'onlinePaymentFeeCents', 'depositChargeCents',
  ] as const) {
    const value = orderRequest[optionalMonetaryField]
    if (value !== undefined && value !== null && !isNonNegativeInteger(value)) {
      return `${optionalMonetaryField} must be a non-negative integer`
    }
  }

  for (const [index, rawLine] of orderRequest.lines.entries()) {
    if (!rawLine || typeof rawLine !== 'object') {
      return `Line ${index} must be an object`
    }
    const line = rawLine as MinimalOrderLine
    if (!isNonEmptyString(line.productId)) return `Line ${index} is missing productId`
    if (!isNonEmptyString(line.productName)) return `Line ${index} is missing productName`
    if (!isPositiveInteger(line.qty)) return `Line ${index} qty must be a positive integer`
    if (!isNonNegativeInteger(line.unitPriceCents)) return `Line ${index} unitPriceCents must be a non-negative integer`
    if (!isNonNegativeInteger(line.lineTotalCents)) return `Line ${index} lineTotalCents must be a non-negative integer`
  }

  return null
}
