// src/utils/tax.ts (or similar)
export interface TenantTaxConfig {
  taxRate: number;          // e.g. 0.0825
  taxIncluded: boolean;
  chargeTaxOnOnline?: boolean;
}

export interface Totals {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Compute subtotal/tax/total in cents.
 */
export function calculateTotalsFromItems(
  items: Array<{ lineTotalCents: number }>,
  taxConfig: TenantTaxConfig
): Totals {
  const subtotalCents = items.reduce(
    (sum, item) => sum + (item.lineTotalCents || 0),
    0
  );

  if (!taxConfig.chargeTaxOnOnline) {
    return {
      subtotalCents,
      taxCents: 0,
      totalCents: subtotalCents,
    };
  }

  const rate = taxConfig.taxRate || 0;

  if (taxConfig.taxIncluded) {
    // Prices already include tax: back out the tax portion
    const gross = subtotalCents;
    const net = rate > 0 ? Math.round(gross / (1 + rate)) : gross;
    const taxCents = gross - net;
    return {
      subtotalCents: net,
      taxCents,
      totalCents: gross,
    };
  } else {
    // Prices are before tax: add tax on top
    const taxCents = Math.round(subtotalCents * rate);
    return {
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
    };
  }
}
