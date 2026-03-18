/**
 * GST Rate Tables
 * Source: CBIC notifications, updated per Finance Act 2024
 */

export const GST_RATES = {
  // Standard rates
  EXEMPT: 0,
  RATE_5: 5,
  RATE_12: 12,
  RATE_18: 18,
  RATE_28: 28,
} as const

// Common SAC codes for services (most startups)
export const SERVICE_GST_RATES: Record<string, { rate: number; description: string }> = {
  '998311': { rate: 18, description: 'IT consulting services' },
  '998312': { rate: 18, description: 'IT design and development' },
  '998313': { rate: 18, description: 'IT infrastructure provisioning' },
  '998314': { rate: 18, description: 'IT infrastructure operations and management' },
  '998315': { rate: 18, description: 'Hardware/software maintenance and support' },
  '997331': { rate: 18, description: 'Software licensing' },
  '998361': { rate: 18, description: 'SaaS / cloud services' },
  '998211': { rate: 18, description: 'Legal advisory and representation' },
  '998221': { rate: 18, description: 'Accounting, bookkeeping, auditing' },
  '998231': { rate: 18, description: 'Management consulting' },
  '998511': { rate: 18, description: 'Telecommunications services' },
  '996311': { rate: 18, description: 'Restaurant (AC or with alcohol license)' },
  '996312': { rate: 5, description: 'Restaurant (non-AC, without alcohol)' },
}

/**
 * Determine GST type based on place of supply.
 * Intra-state: CGST + SGST (each half of rate)
 * Inter-state: IGST (full rate)
 */
export function determineGSTType(
  sellerState: string,
  placeOfSupply: string
): 'CGST_SGST' | 'IGST' {
  return sellerState === placeOfSupply ? 'CGST_SGST' : 'IGST'
}

/**
 * Compute GST amounts for a single invoice.
 */
export function computeInvoiceGST(
  taxableAmount: number,
  gstRate: number,
  sellerState: string,
  placeOfSupply: string
): {
  cgst: number
  sgst: number
  igst: number
  totalTax: number
} {
  const type = determineGSTType(sellerState, placeOfSupply)
  const totalTax = (taxableAmount * gstRate) / 100

  if (type === 'CGST_SGST') {
    const half = totalTax / 2
    return { cgst: Math.round(half * 100) / 100, sgst: Math.round(half * 100) / 100, igst: 0, totalTax: Math.round(totalTax * 100) / 100 }
  }

  return { cgst: 0, sgst: 0, igst: Math.round(totalTax * 100) / 100, totalTax: Math.round(totalTax * 100) / 100 }
}
