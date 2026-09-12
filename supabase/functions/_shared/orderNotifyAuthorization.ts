export type NotifyOrderStatus = { status?: string | null; payment_status?: string | null };

export function isInternalServiceRequest(authorizationHeader: string | null, serviceRoleKey: string | undefined): boolean {
  if (!authorizationHeader || !serviceRoleKey) return false
  return authorizationHeader === `Bearer ${serviceRoleKey}`
}

/**
 * Gate each notification type against the order's *stored* state — never the
 * caller's assertion about what happened. This prevents a caller from
 * triggering a "payment received" or "order ready" email for an order that
 * isn't actually in that state.
 */
export function canSendNotificationForOrderState(
  emailType: 'order_confirmation' | 'order_ready' | 'payment_received',
  order: NotifyOrderStatus,
): { ok: true } | { ok: false; error: string } {
  if (emailType === 'payment_received' && order.payment_status !== 'paid') {
    return { ok: false, error: 'order_not_paid' }
  }
  if (emailType === 'order_ready' && order.status !== 'ready') {
    return { ok: false, error: 'order_not_ready' }
  }
  return { ok: true }
}

/** Base-plan tenants carry the new settled 1.75% platform fee label. */
export function onlineFeeLabel(tenantPlan: string | null | undefined): string {
  return tenantPlan === 'base' ? 'PurveyOS Platform Fee (1.75%)' : 'Online convenience fee'
}
