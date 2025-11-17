// Lightweight analytics facade: supports Plausible, GA4 (gtag), Meta Pixel (fbq), PostHog, and dataLayer.
// Usage: import { trackEvent, trackPageView, trackAddToCart, trackProductView, trackBeginCheckout, trackPurchase } from './analytics'

type Props = Record<string, any>;

let analyticsEnabled = true;

export function setAnalyticsEnabled(enabled: boolean) {
  analyticsEnabled = !!enabled;
}

function callProviders(event: string, props?: Props) {
  if (!analyticsEnabled) return;
  // Plausible
  try {
    if (typeof window !== 'undefined' && typeof (window as any).plausible === 'function') {
      (window as any).plausible(event, props ? { props } : undefined);
    }
  } catch {}

  // GA4
  try {
    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', event, props || {});
    } else if (typeof window !== 'undefined' && Array.isArray((window as any).dataLayer)) {
      (window as any).dataLayer.push({ event, ...(props || {}) });
    }
  } catch {}

  // Meta Pixel
  try {
    if (typeof window !== 'undefined' && typeof (window as any).fbq === 'function') {
      (window as any).fbq('trackCustom', event, props || {});
    }
  } catch {}

  // PostHog
  try {
    const ph = (typeof window !== 'undefined' ? (window as any).posthog : undefined);
    if (ph && typeof ph.capture === 'function') {
      ph.capture(event, props || {});
    }
  } catch {}

  // Fallback: dev console
  try {
    if (typeof window !== 'undefined' && (window as any).location?.hostname?.includes('localhost')) {
      // eslint-disable-next-line no-console
      console.debug('[analytics]', event, props || {});
    }
  } catch {}
}

export function trackEvent(event: string, props?: Props) {
  callProviders(event, props);
}

export function trackPageView(path: string, props?: Props) {
  callProviders('page_view', { path, ...(props || {}) });
}

export function trackProductView(props: {
  productId: string;
  name?: string;
  price?: number;
  category?: string;
  tenantId?: string;
}) {
  callProviders('product_view', props);
}

export function trackAddToCart(props: {
  productId: string;
  quantity?: number;
  tenantId?: string;
  binWeight?: number;
  unitPriceCents?: number;
  weight?: number;
  isPreOrder?: boolean;
}) {
  callProviders('add_to_cart', props);
}

export function trackRemoveFromCart(props: {
  productId: string;
  quantity?: number;
  tenantId?: string;
  binWeight?: number;
}) {
  callProviders('remove_from_cart', props);
}

export function trackClearCart(props?: { tenantId?: string }) {
  callProviders('clear_cart', props);
}

export function trackBeginCheckout(props: {
  tenantId?: string;
  itemsCount: number;
  value?: number;
  currency?: string;
}) {
  callProviders('begin_checkout', props);
}

export function trackPurchase(props: {
  orderId: string;
  tenantId?: string;
  value: number;
  currency?: string;
  itemsCount?: number;
}) {
  callProviders('purchase', props);
}
