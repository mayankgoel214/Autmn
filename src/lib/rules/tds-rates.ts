/**
 * TDS Rate Tables
 * CORRECTED per Finance Act 2024
 */

export interface TDSSection {
  section: string
  description: string
  rateIndividual: number   // Rate for individual/HUF payees
  rateOthers: number       // Rate for company/firm payees
  threshold: number        // Annual threshold below which no TDS
  thresholdType: 'single' | 'aggregate' // Per payment or aggregate annual
}

export const TDS_SECTIONS: TDSSection[] = [
  {
    section: '192',
    description: 'Salary',
    rateIndividual: -1, // Per slab
    rateOthers: -1,
    threshold: 0,
    thresholdType: 'aggregate',
  },
  {
    section: '194A',
    description: 'Interest (non-bank)',
    rateIndividual: 10,
    rateOthers: 10,
    threshold: 40000,
    thresholdType: 'aggregate',
  },
  {
    section: '194C',
    description: 'Contractors',
    rateIndividual: 1,
    rateOthers: 2,
    threshold: 30000, // single payment, or 100000 aggregate
    thresholdType: 'single',
  },
  {
    section: '194H',
    description: 'Commission/Brokerage',
    rateIndividual: 2, // Changed from 5% by Finance Act 2024
    rateOthers: 2,
    threshold: 15000,
    thresholdType: 'aggregate',
  },
  {
    section: '194I',
    description: 'Rent (building)',
    rateIndividual: 10,
    rateOthers: 10,
    threshold: 240000,
    thresholdType: 'aggregate',
  },
  {
    section: '194I_MACHINERY',
    description: 'Rent (machinery)',
    rateIndividual: 2,
    rateOthers: 2,
    threshold: 240000,
    thresholdType: 'aggregate',
  },
  {
    section: '194J',
    description: 'Professional fees',
    rateIndividual: 10,
    rateOthers: 10,
    threshold: 30000,
    thresholdType: 'aggregate',
  },
  {
    section: '194J_TECHNICAL',
    description: 'Technical fees',
    rateIndividual: 2,
    rateOthers: 2,
    threshold: 30000,
    thresholdType: 'aggregate',
  },
  {
    section: '194O',
    description: 'E-commerce operator',
    rateIndividual: 0.1, // Changed from 1% by Finance Act 2024
    rateOthers: 0.1,
    threshold: 500000,
    thresholdType: 'aggregate',
  },
  {
    section: '194Q',
    description: 'Purchase of goods',
    rateIndividual: 0.1,
    rateOthers: 0.1,
    threshold: 5000000,
    thresholdType: 'aggregate',
  },
  {
    section: '194R',
    description: 'Benefits/perquisites (non-salary)',
    rateIndividual: 10,
    rateOthers: 10,
    threshold: 20000,
    thresholdType: 'aggregate',
  },
]

/**
 * Get TDS rate for a given section and payee type.
 */
export function getTDSRate(
  section: string,
  payeeType: 'individual' | 'company' | 'firm' = 'individual'
): number {
  const entry = TDS_SECTIONS.find(s => s.section === section)
  if (!entry) return 0

  if (payeeType === 'individual') return entry.rateIndividual
  return entry.rateOthers
}

/**
 * Compute TDS amount.
 */
export function computeTDS(
  section: string,
  amount: number,
  payeeType: 'individual' | 'company' | 'firm' = 'individual',
  hasPAN: boolean = true
): number {
  const entry = TDS_SECTIONS.find(s => s.section === section)
  if (!entry) return 0

  if (entry.rateIndividual === -1) return 0 // Salary — per slab, not a fixed rate

  const rate = payeeType === 'individual' ? entry.rateIndividual : entry.rateOthers

  // No PAN → 20% or rate, whichever is higher (Section 206AA)
  const effectiveRate = hasPAN ? rate : Math.max(rate, 20)

  return Math.round((amount * effectiveRate) / 100 * 100) / 100
}
