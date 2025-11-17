export type SubscriptionTier = string | undefined | null;

// Tier definitions:
// - trial: PRO features for 21 days
// - Purvey Starter Monthly: Basic features
// - PurveyOS PRO Monthly: PRO features without webhosting
// - PurveyOS PRO + Webhosting: Full PRO features with webhosting

export function hasProFeatures(tier: SubscriptionTier): boolean {
  if (!tier) return false;
  const t = String(tier).toLowerCase();
  // Trial and any tier containing "pro" get PRO features
  return t === 'trial' || t.includes('pro');
}

export function canUseAnalytics(tier: SubscriptionTier): boolean {
  return hasProFeatures(tier);
}

export function canUsePreOrders(tier: SubscriptionTier): boolean {
  return hasProFeatures(tier);
}

export function canUseAdvancedThemes(_tier: SubscriptionTier): boolean {
  // All tiers can use advanced themes (template switching)
  return true;
}

// All templates are available to all tiers
export function getAllowedTemplates(_tier: SubscriptionTier): string[] {
  return ['classic', 'minimal', 'modern'];
}
