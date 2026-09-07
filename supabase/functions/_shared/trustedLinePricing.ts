export type TrustedProduct = {
  id: string
  unit?: string | null
  pricePerCents: number
}

export type TrustedBin = {
  packageKey: string
  weightBtn: number
  unitPriceCents: number
}

export type PriceableLine = {
  productId: string
  qty?: number | null
  binWeight?: number | null
  weightLbs?: number | null
  requestedWeightLbs?: number | null
}

export type TrustedLinePrice = {
  unitPriceCents: number
  lineTotalCents: number
}

/**
 * Recomputes what a line should cost from authoritative product/bin pricing.
 * Never derives a price from anything the client submitted.
 */
export function computeTrustedLinePrice(
  line: PriceableLine,
  product: TrustedProduct,
  binsForProduct: TrustedBin[],
): TrustedLinePrice {
  const quantity = Math.max(1, Math.round(Number(line.qty ?? 1)))
  const unit = (product.unit || '').toLowerCase()
  const isWeightBased = unit.startsWith('lb')

  if (typeof line.binWeight === 'number' && line.binWeight > 0) {
    const matchingBin = binsForProduct.find((bin) => Math.abs(bin.weightBtn - (line.binWeight as number)) < 0.005)
    if (matchingBin) {
      return isWeightBased
        ? {
            unitPriceCents: matchingBin.unitPriceCents,
            lineTotalCents: Math.round(matchingBin.unitPriceCents * (line.binWeight as number) * quantity),
          }
        : {
            unitPriceCents: matchingBin.unitPriceCents,
            lineTotalCents: Math.round(matchingBin.unitPriceCents * quantity),
          }
    }
  }

  const requestedWeight = Number(line.requestedWeightLbs ?? line.weightLbs ?? line.binWeight ?? 0)
  if (isWeightBased && requestedWeight > 0) {
    return {
      unitPriceCents: product.pricePerCents,
      lineTotalCents: Math.round(product.pricePerCents * requestedWeight * quantity),
    }
  }

  return {
    unitPriceCents: product.pricePerCents,
    lineTotalCents: Math.round(product.pricePerCents * quantity),
  }
}

/** Client line totals must exactly match the server-derived amount. */
export function linePriceMatchesTrusted(clientLineTotalCents: number, trustedLineTotalCents: number): boolean {
  return Number.isInteger(clientLineTotalCents) && clientLineTotalCents === trustedLineTotalCents
}
