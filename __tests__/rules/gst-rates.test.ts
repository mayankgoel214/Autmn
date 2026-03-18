import { determineGSTType, computeInvoiceGST } from '@/lib/rules/gst-rates'

describe('determineGSTType', () => {
  it('intra-state supply → CGST_SGST', () => {
    expect(determineGSTType('MH', 'MH')).toBe('CGST_SGST')
  })

  it('inter-state supply → IGST', () => {
    expect(determineGSTType('MH', 'KA')).toBe('IGST')
  })

  it('same state different codes → CGST_SGST', () => {
    expect(determineGSTType('DL', 'DL')).toBe('CGST_SGST')
  })
})

describe('computeInvoiceGST', () => {
  it('computes intra-state GST correctly (18%)', () => {
    const result = computeInvoiceGST(100000, 18, 'MH', 'MH')
    expect(result.cgst).toBe(9000)
    expect(result.sgst).toBe(9000)
    expect(result.igst).toBe(0)
    expect(result.totalTax).toBe(18000)
  })

  it('computes inter-state GST correctly (18%)', () => {
    const result = computeInvoiceGST(100000, 18, 'MH', 'KA')
    expect(result.cgst).toBe(0)
    expect(result.sgst).toBe(0)
    expect(result.igst).toBe(18000)
    expect(result.totalTax).toBe(18000)
  })

  it('computes 5% rate correctly', () => {
    const result = computeInvoiceGST(50000, 5, 'DL', 'DL')
    expect(result.cgst).toBe(1250)
    expect(result.sgst).toBe(1250)
    expect(result.totalTax).toBe(2500)
  })

  it('computes 12% rate correctly', () => {
    const result = computeInvoiceGST(80000, 12, 'KA', 'TN')
    expect(result.igst).toBe(9600)
    expect(result.cgst).toBe(0)
  })

  it('computes 28% rate correctly', () => {
    const result = computeInvoiceGST(200000, 28, 'GJ', 'GJ')
    expect(result.cgst).toBe(28000)
    expect(result.sgst).toBe(28000)
    expect(result.totalTax).toBe(56000)
  })

  it('handles zero amount', () => {
    const result = computeInvoiceGST(0, 18, 'MH', 'KA')
    expect(result.totalTax).toBe(0)
  })

  it('CGST and SGST are exactly half each', () => {
    const result = computeInvoiceGST(100001, 18, 'MH', 'MH')
    // 18% of 100001 = 18000.18
    // Each half = 9000.09
    expect(result.cgst).toBeCloseTo(9000.09, 2)
    expect(result.sgst).toBeCloseTo(9000.09, 2)
  })

  it('CGST+SGST and IGST are mutually exclusive', () => {
    // Intra-state: no IGST
    const intra = computeInvoiceGST(100000, 18, 'MH', 'MH')
    expect(intra.igst).toBe(0)
    expect(intra.cgst).toBeGreaterThan(0)

    // Inter-state: no CGST/SGST
    const inter = computeInvoiceGST(100000, 18, 'MH', 'KA')
    expect(inter.cgst).toBe(0)
    expect(inter.sgst).toBe(0)
    expect(inter.igst).toBeGreaterThan(0)
  })
})
