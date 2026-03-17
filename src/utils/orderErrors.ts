export function isInventoryOrderError(raw: string | null | undefined): boolean {
  if (!raw) return false;

  const msg = raw.toLowerCase();

  return (
    msg.includes('not found or does not belong') ||
    msg.includes('bin') ||
    msg.includes('p0001') ||
    msg.includes('out of stock') ||
    msg.includes('insufficient') ||
    msg.includes('inventory')
  );
}

export function friendlyOrderError(raw: string | null | undefined): string {
  if (!raw) return 'Something went wrong. Please try again.';

  const msg = raw.toLowerCase();

  if (isInventoryOrderError(raw)) {
    return 'One or more items in your cart are no longer available. Please go back and update your cart.';
  }

  if (
    msg.includes('non-2xx') ||
    msg.includes('edge function') ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('500') ||
    msg.includes('503')
  ) {
    return 'We were unable to complete your order right now. Please try again in a moment.';
  }

  if (msg.includes('stripe') || msg.includes('payment') || msg.includes('card')) {
    return 'There was a problem processing your payment. Please check your details and try again.';
  }

  const isAlreadyFriendly =
    msg.includes('please') ||
    msg.includes('required') ||
    msg.includes('select a') ||
    msg.includes('provide');

  if (isAlreadyFriendly) return raw;

  return 'Your order could not be completed. Please try again or contact the store.';
}
