export const TAX_RATE_BASIS_POINTS_MAX = 10_000;

export type TaxRateSnapshot = {
  id: string;
  name: string;
  rateBasisPoints: number;
};

export type TaxCalculationLine = {
  key: string;
  subtotalCents: number;
  taxRate: TaxRateSnapshot | null;
};

export type TaxLineSnapshot = {
  key: string;
  taxRateId: string | null;
  taxRateName: string;
  taxRateBasisPoints: number;
  discountCents: number;
  taxableAmountCents: number;
  taxCents: number;
};

export type TaxRateBreakdown = {
  taxRateId: string;
  taxRateName: string;
  taxRateBasisPoints: number;
  taxableAmountCents: number;
  taxCents: number;
};

export type MixedRateTaxResult = {
  subtotalCents: number;
  discountCents: number;
  taxableSubtotalCents: number;
  taxCents: number;
  totalCents: number;
  lines: TaxLineSnapshot[];
  breakdown: TaxRateBreakdown[];
};

function clampInteger(value: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function allocateCents(totalCents: number, weights: number[]): number[] {
  const total = clampInteger(totalCents);
  const normalizedWeights = weights.map((weight) => clampInteger(weight));
  const weightTotal = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0 || weightTotal === 0) return normalizedWeights.map(() => 0);

  const allocations = normalizedWeights.map((weight) => Math.floor((total * weight) / weightTotal));
  const remaining = total - allocations.reduce((sum, value) => sum + value, 0);
  const ranked = normalizedWeights
    .map((weight, index) => ({ index, remainder: (total * weight) % weightTotal }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);

  for (let index = 0; index < remaining; index += 1) {
    allocations[ranked[index].index] += 1;
  }
  return allocations;
}

function calculateGroupTaxCents(amountCents: number, rateBasisPoints: number, pricesIncludeTax: boolean): number {
  const amount = clampInteger(amountCents);
  const rate = clampInteger(rateBasisPoints, 0, TAX_RATE_BASIS_POINTS_MAX);
  if (amount === 0 || rate === 0) return 0;
  if (pricesIncludeTax) {
    return amount - Math.round((amount * 10_000) / (10_000 + rate));
  }
  return Math.round((amount * rate) / 10_000);
}

export function calculateMixedRateTax(args: {
  lines: TaxCalculationLine[];
  discountCents?: number;
  pricesIncludeTax?: boolean;
}): MixedRateTaxResult {
  const lines = args.lines.map((line) => ({
    ...line,
    subtotalCents: clampInteger(line.subtotalCents),
  }));
  const subtotalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0);
  const discountCents = clampInteger(args.discountCents ?? 0, 0, subtotalCents);
  const lineDiscounts = allocateCents(discountCents, lines.map((line) => line.subtotalCents));

  const snapshots: TaxLineSnapshot[] = lines.map((line, index) => ({
    key: line.key,
    taxRateId: line.taxRate?.id ?? null,
    taxRateName: line.taxRate?.name ?? 'No tax',
    taxRateBasisPoints: line.taxRate?.rateBasisPoints ?? 0,
    discountCents: lineDiscounts[index],
    taxableAmountCents: line.taxRate ? line.subtotalCents - lineDiscounts[index] : 0,
    taxCents: 0,
  }));

  const groups = new Map<string, number[]>();
  snapshots.forEach((line, index) => {
    if (!line.taxRateId) return;
    const indexes = groups.get(line.taxRateId) ?? [];
    indexes.push(index);
    groups.set(line.taxRateId, indexes);
  });

  const breakdown: TaxRateBreakdown[] = [];
  for (const indexes of groups.values()) {
    const first = snapshots[indexes[0]];
    const grossTaxableCents = indexes.reduce((sum, index) => sum + snapshots[index].taxableAmountCents, 0);
    const groupTaxCents = calculateGroupTaxCents(
      grossTaxableCents,
      first.taxRateBasisPoints,
      Boolean(args.pricesIncludeTax),
    );
    const lineTaxes = allocateCents(groupTaxCents, indexes.map((index) => snapshots[index].taxableAmountCents));
    indexes.forEach((snapshotIndex, allocationIndex) => {
      snapshots[snapshotIndex].taxCents = lineTaxes[allocationIndex];
    });

    const taxableAmountCents = args.pricesIncludeTax
      ? grossTaxableCents - groupTaxCents
      : grossTaxableCents;
    if (args.pricesIncludeTax) {
      const netAmounts = allocateCents(taxableAmountCents, indexes.map((index) => snapshots[index].taxableAmountCents));
      indexes.forEach((snapshotIndex, allocationIndex) => {
        snapshots[snapshotIndex].taxableAmountCents = netAmounts[allocationIndex];
      });
    }

    breakdown.push({
      taxRateId: first.taxRateId!,
      taxRateName: first.taxRateName,
      taxRateBasisPoints: first.taxRateBasisPoints,
      taxableAmountCents,
      taxCents: groupTaxCents,
    });
  }

  const taxableSubtotalCents = breakdown.reduce((sum, group) => sum + group.taxableAmountCents, 0);
  const taxCents = breakdown.reduce((sum, group) => sum + group.taxCents, 0);
  return {
    subtotalCents,
    discountCents,
    taxableSubtotalCents,
    taxCents,
    totalCents: subtotalCents - discountCents + (args.pricesIncludeTax ? 0 : taxCents),
    lines: snapshots,
    breakdown,
  };
}

export function formatTaxRate(rateBasisPoints: number): string {
  return `${(clampInteger(rateBasisPoints, 0, TAX_RATE_BASIS_POINTS_MAX) / 100).toFixed(2)}%`;
}