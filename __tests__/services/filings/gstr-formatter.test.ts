import { formatGSTR1, formatGSTR3B, type InvoiceData } from '@/lib/services/filings/gstr-formatter'

const sampleInvoices: InvoiceData[] = [
  // B2B intra-state (MH to MH)
  {
    invoiceNumber: 'INV-001',
    invoiceDate: '2026-03-05',
    customerName: 'Acme Corp',
    customerGstin: '27AABCA1234C1Z5',
    placeOfSupply: 'MH',
    taxableAmount: 100000,
    gstRate: 18,
    cgst: 9000,
    sgst: 9000,
    igst: 0,
    totalTax: 18000,
    totalAmount: 118000,
    hsnSac: '998311',
    isReverseCharge: false,
  },
  // B2B inter-state (MH to KA)
  {
    invoiceNumber: 'INV-002',
    invoiceDate: '2026-03-10',
    customerName: 'Beta Ltd',
    customerGstin: '29AABCB5678D1Z3',
    placeOfSupply: 'KA',
    taxableAmount: 200000,
    gstRate: 18,
    cgst: 0,
    sgst: 0,
    igst: 36000,
    totalTax: 36000,
    totalAmount: 236000,
    hsnSac: '998311',
    isReverseCharge: false,
  },
  // B2CS — unregistered customer, intra-state, small amount
  {
    invoiceNumber: 'INV-003',
    invoiceDate: '2026-03-15',
    customerName: 'Walk-in Customer',
    customerGstin: null,
    placeOfSupply: 'MH',
    taxableAmount: 50000,
    gstRate: 18,
    cgst: 4500,
    sgst: 4500,
    igst: 0,
    totalTax: 9000,
    totalAmount: 59000,
    hsnSac: '998361',
    isReverseCharge: false,
  },
]

describe('formatGSTR1', () => {
  const gstr1 = formatGSTR1('27AABCR1234A1Z5', '032026', 'MH', sampleInvoices)

  it('sets correct GSTIN and period', () => {
    expect(gstr1.gstin).toBe('27AABCR1234A1Z5')
    expect(gstr1.period).toBe('032026')
  })

  it('counts total invoices correctly', () => {
    expect(gstr1.totalInvoices).toBe(3)
  })

  it('computes total taxable value', () => {
    expect(gstr1.totalTaxableValue).toBe(350000)
  })

  it('computes total tax', () => {
    expect(gstr1.totalTax).toBe(63000)
  })

  it('separates B2B invoices by GSTIN', () => {
    expect(gstr1.b2b).toHaveLength(2) // two different GSTINs
    const acme = gstr1.b2b.find(b => b.customerGstin === '27AABCA1234C1Z5')
    expect(acme).toBeDefined()
    expect(acme!.invoices).toHaveLength(1)
    expect(acme!.invoices[0].invoiceNumber).toBe('INV-001')
  })

  it('B2B invoice has correct tax split', () => {
    const acme = gstr1.b2b.find(b => b.customerGstin === '27AABCA1234C1Z5')
    const item = acme!.invoices[0].items[0]
    expect(item.cgst).toBe(9000) // intra-state
    expect(item.sgst).toBe(9000)
    expect(item.igst).toBe(0)
  })

  it('inter-state B2B has IGST only', () => {
    const beta = gstr1.b2b.find(b => b.customerGstin === '29AABCB5678D1Z3')
    const item = beta!.invoices[0].items[0]
    expect(item.igst).toBe(36000)
    expect(item.cgst).toBe(0)
    expect(item.sgst).toBe(0)
  })

  it('puts unregistered intra-state into B2CS', () => {
    expect(gstr1.b2cs).toHaveLength(1)
    expect(gstr1.b2cs[0].taxableValue).toBe(50000)
    expect(gstr1.b2cs[0].cgst).toBe(4500)
  })

  it('generates HSN summary', () => {
    expect(gstr1.hsn.length).toBeGreaterThanOrEqual(1)
    const hsn998311 = gstr1.hsn.find(h => h.hsnCode === '998311')
    expect(hsn998311).toBeDefined()
    expect(hsn998311!.quantity).toBe(2) // two invoices with this HSN
    expect(hsn998311!.taxableValue).toBe(300000)
  })

  it('B2CL is empty for small invoices', () => {
    expect(gstr1.b2cl).toHaveLength(0) // no unregistered inter-state > 2.5L
  })
})

describe('formatGSTR3B', () => {
  const purchaseITC = { igst: 10000, cgst: 5000, sgst: 5000 }
  const gstr3b = formatGSTR3B('27AABCR1234A1Z5', '032026', sampleInvoices, purchaseITC)

  it('computes outward supply totals', () => {
    expect(gstr3b.outwardSupplies.taxable.taxableValue).toBe(350000)
    expect(gstr3b.outwardSupplies.taxable.igst).toBe(36000)
    expect(gstr3b.outwardSupplies.taxable.cgst).toBe(13500) // 9000 + 4500
    expect(gstr3b.outwardSupplies.taxable.sgst).toBe(13500)
  })

  it('records ITC correctly', () => {
    expect(gstr3b.itcAvailable.igst).toBe(10000)
    expect(gstr3b.itcAvailable.cgst).toBe(5000)
    expect(gstr3b.itcAvailable.sgst).toBe(5000)
    expect(gstr3b.itcAvailable.total).toBe(20000)
  })

  it('computes net tax payable (output - ITC)', () => {
    expect(gstr3b.netTaxPayable.igst).toBe(26000) // 36000 - 10000
    expect(gstr3b.netTaxPayable.cgst).toBe(8500)  // 13500 - 5000
    expect(gstr3b.netTaxPayable.sgst).toBe(8500)
    expect(gstr3b.netTaxPayable.total).toBe(43000)
  })

  it('net tax never goes below 0', () => {
    const bigITC = { igst: 100000, cgst: 50000, sgst: 50000 }
    const result = formatGSTR3B('27AABCR1234A1Z5', '032026', sampleInvoices, bigITC)
    expect(result.netTaxPayable.igst).toBe(0)
    expect(result.netTaxPayable.cgst).toBe(0)
    expect(result.netTaxPayable.sgst).toBe(0)
  })
})
