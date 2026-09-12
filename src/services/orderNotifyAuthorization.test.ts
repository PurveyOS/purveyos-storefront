import { describe, expect, it } from 'vitest';
import {
  canSendNotificationForOrderState,
  isInternalServiceRequest,
  onlineFeeLabel,
} from '../../supabase/functions/_shared/orderNotifyAuthorization';

describe('isInternalServiceRequest', () => {
  it('accepts an exact service-role bearer token match', () => {
    expect(isInternalServiceRequest('Bearer secret-key', 'secret-key')).toBe(true);
  });

  it('rejects a missing or mismatched header', () => {
    expect(isInternalServiceRequest(null, 'secret-key')).toBe(false);
    expect(isInternalServiceRequest('Bearer wrong', 'secret-key')).toBe(false);
    expect(isInternalServiceRequest('Bearer secret-key', undefined)).toBe(false);
  });
});

describe('canSendNotificationForOrderState', () => {
  it('blocks payment_received unless the stored payment_status is paid', () => {
    expect(canSendNotificationForOrderState('payment_received', { payment_status: 'pending' }))
      .toEqual({ ok: false, error: 'order_not_paid' });
    expect(canSendNotificationForOrderState('payment_received', { payment_status: 'paid' })).toEqual({ ok: true });
  });

  it('blocks order_ready unless the stored status is ready', () => {
    expect(canSendNotificationForOrderState('order_ready', { status: 'pending' }))
      .toEqual({ ok: false, error: 'order_not_ready' });
    expect(canSendNotificationForOrderState('order_ready', { status: 'ready' })).toEqual({ ok: true });
  });

  it('always allows order_confirmation', () => {
    expect(canSendNotificationForOrderState('order_confirmation', {})).toEqual({ ok: true });
  });
});

describe('onlineFeeLabel', () => {
  it('uses the settled platform fee label for Base plan', () => {
    expect(onlineFeeLabel('base')).toBe('PurveyOS Platform Fee (1.75%)');
  });

  it('keeps the legacy label for other plans', () => {
    expect(onlineFeeLabel('core')).toBe('Online convenience fee');
    expect(onlineFeeLabel(null)).toBe('Online convenience fee');
  });
});
