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

  if (
    msg.includes('some selected packages are no longer available') ||
    msg.includes('remove or adjust these items:')
  ) {
    return raw;
  }

  if (msg.includes('preorder_mixed_cart')) {
    return 'Preorder items must be checked out separately from in-stock items.';
  }
  if (msg.includes('preorder_not_enabled') || msg.includes('preorder_not_configured')) {
    return 'This preorder is not currently available.';
  }
  if (msg.includes('preorder_not_open')) {
    return 'This preorder has not opened yet. Please check back when ordering begins.';
  }
  if (msg.includes('preorder_closed')) {
    return 'The preorder window for this item has ended.';
  }
  if (msg.includes('preorder_sold_out')) {
    return 'The requested quantity is no longer available for preorder. Please refresh and try again.';
  }
  if (msg.includes('preorder_invalid_quantity')) {
    return 'Please enter a valid preorder quantity.';
  }
  if (msg.includes('preorder_duplicate_product_line')) {
    return 'Each preorder product can only appear once per order.';
  }
  if (msg.includes('preorder_invalid_weight_line')) {
    return 'Invalid preorder weight. Please enter a whole-pound amount and try again.';
  }
  if (msg.includes('preorder_selected_bins_not_allowed')) {
    return 'Preorder items cannot have packages selected at checkout.';
  }

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
