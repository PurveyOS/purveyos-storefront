export const ONLINE_PAYMENT_FEE_LABEL = 'Online Convenience Fee';

export interface OnlinePaymentFeeSettings {
  enabled: boolean;
  feePercent: number;
}

interface OnlinePaymentFeeInput {
  paymentMethod?: string | null;
  paymentNowChoice?: string | null;
  baseTotalCents?: number | null;
  settings?: Partial<OnlinePaymentFeeSettings> | null;
}

export function normalizeOnlinePaymentFeeSettings(
  settings?: Partial<OnlinePaymentFeeSettings> | null
): OnlinePaymentFeeSettings {
  const feePercent = Number.isFinite(settings?.feePercent)
    ? Math.max(0, Math.min(100, Number(settings?.feePercent)))
    : 0;

  return {
    enabled: Boolean(settings?.enabled),
    feePercent,
  };
}

export function shouldApplyOnlinePaymentFee({
  paymentMethod,
  paymentNowChoice,
}: OnlinePaymentFeeInput): boolean {
  return paymentMethod === 'card' && paymentNowChoice !== 'pay_at_pickup';
}

export function getOnlinePaymentFeeCents(input: OnlinePaymentFeeInput): number {
  const settings = normalizeOnlinePaymentFeeSettings(input.settings);
  if (!settings.enabled || !shouldApplyOnlinePaymentFee(input)) {
    return 0;
  }

  const baseTotalCents = Number.isFinite(input.baseTotalCents)
    ? Math.max(0, Math.round(Number(input.baseTotalCents)))
    : 0;

  if (baseTotalCents <= 0) return 0;
  return Math.round(baseTotalCents * (settings.feePercent / 100));
}

export function addOnlinePaymentFee(baseTotalCents: number, feeCents: number): number {
  return Math.max(0, Math.round(baseTotalCents)) + Math.max(0, Math.round(feeCents));
}