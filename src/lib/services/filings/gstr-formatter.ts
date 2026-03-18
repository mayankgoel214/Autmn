/**
 * GSTR-1 and GSTR-3B Data Formatter
 *
 * Formats financial data into the exact JSON structure required by GSTN.
 * GSTR-1: Invoice-level details grouped by supply type
 * GSTR-3B: Summary return with aggregated tax amounts
 */

import { determineGSTType } from '@/lib/rules/gst-rates'

export interface InvoiceData {
  invoiceNumber: string
  invoiceDate: string
  customerName: string
  customerGstin: string | null
  placeOfSupply: string
  taxableAmount: number
  gstRate: number
  cgst: number
  sgst: number
  igst: number
  totalTax: number
  totalAmount: number
  hsnSac: string | null
  isReverseCharge: boolean
}

// ============================================================
// GSTR-1 FORMAT
// ============================================================

export interface GSTR1Data {
  gstin: string
  period: string // MMYYYY format
  b2b: GSTR1_B2B[]       // B2B invoices (to registered persons)
  b2cs: GSTR1_B2CS[]     // B2C small (unregistered, intra-state ≤ 2.5L)
  b2cl: GSTR1_B2CL[]     // B2C large (unregistered, inter-state > 2.5L)
  cdnr: GSTR1_CDNR[]     // Credit/Debit notes to registered
  hsn: GSTR1_HSN[]       // HSN-wise summary
  totalInvoices: number
  totalTaxableValue: number
  totalTax: number
}

interface GSTR1_B2B {
  customerGstin: string
  invoices: Array<{
    invoiceNumber: string
    invoiceDate: string
    invoiceValue: number
    placeOfSupply: string
    reverseCharge: 'Y' | 'N'
    items: Array<{
      taxableValue: number
      gstRate: number
      cgst: number
      sgst: number
      igst: number
    }>
  }>
}

interface GSTR1_B2CS {
  placeOfSupply: string
  gstRate: number
  taxableValue: number
  cgst: number
  sgst: number
}

interface GSTR1_B2CL {
  placeOfSupply: string
  invoices: Array<{
    invoiceNumber: string
    invoiceDate: string
    invoiceValue: number
    taxableValue: number
    igst: number
    gstRate: number
  }>
}

interface GSTR1_CDNR {
  customerGstin: string
  notes: Array<{
    noteNumber: string
    noteDate: string
    noteType: 'C' | 'D'
    noteValue: number
    items: Array<{
      taxableValue: number
      gstRate: number
      cgst: number
      sgst: number
      igst: number
    }>
  }>
}

interface GSTR1_HSN {
  hsnCode: string
  description: string
  quantity: number
  taxableValue: number
  cgst: number
  sgst: number
  igst: number
  totalTax: number
}

/**
 * Format invoices into GSTR-1 structure.
 */
export function formatGSTR1(
  gstin: string,
  period: string,
  sellerState: string,
  invoices: InvoiceData[]
): GSTR1Data {
  const b2bMap = new Map<string, GSTR1_B2B>()
  const b2csList: GSTR1_B2CS[] = []
  const b2clMap = new Map<string, GSTR1_B2CL>()
  const hsnMap = new Map<string, GSTR1_HSN>()

  for (const inv of invoices) {
    const gstType = determineGSTType(sellerState, inv.placeOfSupply)

    // HSN aggregation
    const hsnKey = inv.hsnSac || 'UNKNOWN'
    const existing = hsnMap.get(hsnKey) || {
      hsnCode: hsnKey,
      description: '',
      quantity: 0,
      taxableValue: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalTax: 0,
    }
    existing.quantity++
    existing.taxableValue += inv.taxableAmount
    existing.cgst += inv.cgst
    existing.sgst += inv.sgst
    existing.igst += inv.igst
    existing.totalTax += inv.totalTax
    hsnMap.set(hsnKey, existing)

    if (inv.customerGstin) {
      // B2B — to registered person
      const b2b = b2bMap.get(inv.customerGstin) || {
        customerGstin: inv.customerGstin,
        invoices: [],
      }
      b2b.invoices.push({
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        invoiceValue: inv.totalAmount,
        placeOfSupply: inv.placeOfSupply,
        reverseCharge: inv.isReverseCharge ? 'Y' : 'N',
        items: [{
          taxableValue: inv.taxableAmount,
          gstRate: inv.gstRate,
          cgst: inv.cgst,
          sgst: inv.sgst,
          igst: inv.igst,
        }],
      })
      b2bMap.set(inv.customerGstin, b2b)
    } else if (gstType === 'IGST' && inv.totalAmount > 250000) {
      // B2CL — unregistered, inter-state, > 2.5 lakh
      const b2cl = b2clMap.get(inv.placeOfSupply) || {
        placeOfSupply: inv.placeOfSupply,
        invoices: [],
      }
      b2cl.invoices.push({
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        invoiceValue: inv.totalAmount,
        taxableValue: inv.taxableAmount,
        igst: inv.igst,
        gstRate: inv.gstRate,
      })
      b2clMap.set(inv.placeOfSupply, b2cl)
    } else {
      // B2CS — unregistered, intra-state or inter-state ≤ 2.5 lakh
      b2csList.push({
        placeOfSupply: inv.placeOfSupply,
        gstRate: inv.gstRate,
        taxableValue: inv.taxableAmount,
        cgst: inv.cgst,
        sgst: inv.sgst,
      })
    }
  }

  const totalTaxableValue = invoices.reduce((sum, i) => sum + i.taxableAmount, 0)
  const totalTax = invoices.reduce((sum, i) => sum + i.totalTax, 0)

  return {
    gstin,
    period,
    b2b: Array.from(b2bMap.values()),
    b2cs: b2csList,
    b2cl: Array.from(b2clMap.values()),
    cdnr: [], // Credit notes handled separately
    hsn: Array.from(hsnMap.values()),
    totalInvoices: invoices.length,
    totalTaxableValue: Math.round(totalTaxableValue * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
  }
}

// ============================================================
// GSTR-3B FORMAT
// ============================================================

export interface GSTR3BData {
  gstin: string
  period: string
  outwardSupplies: {
    taxable: { taxableValue: number; igst: number; cgst: number; sgst: number }
    exempt: { taxableValue: number }
    nilRated: { taxableValue: number }
  }
  itcAvailable: {
    igst: number
    cgst: number
    sgst: number
    total: number
  }
  netTaxPayable: {
    igst: number
    cgst: number
    sgst: number
    total: number
  }
}

/**
 * Format data into GSTR-3B summary.
 */
export function formatGSTR3B(
  gstin: string,
  period: string,
  invoices: InvoiceData[],
  purchaseITC: { igst: number; cgst: number; sgst: number }
): GSTR3BData {
  // Aggregate outward supplies
  const outward = invoices.reduce(
    (acc, inv) => {
      acc.taxableValue += inv.taxableAmount
      acc.igst += inv.igst
      acc.cgst += inv.cgst
      acc.sgst += inv.sgst
      return acc
    },
    { taxableValue: 0, igst: 0, cgst: 0, sgst: 0 }
  )

  // Net tax = output tax - ITC
  const netIgst = Math.max(0, outward.igst - purchaseITC.igst)
  const netCgst = Math.max(0, outward.cgst - purchaseITC.cgst)
  const netSgst = Math.max(0, outward.sgst - purchaseITC.sgst)

  return {
    gstin,
    period,
    outwardSupplies: {
      taxable: {
        taxableValue: Math.round(outward.taxableValue * 100) / 100,
        igst: Math.round(outward.igst * 100) / 100,
        cgst: Math.round(outward.cgst * 100) / 100,
        sgst: Math.round(outward.sgst * 100) / 100,
      },
      exempt: { taxableValue: 0 },
      nilRated: { taxableValue: 0 },
    },
    itcAvailable: {
      igst: Math.round(purchaseITC.igst * 100) / 100,
      cgst: Math.round(purchaseITC.cgst * 100) / 100,
      sgst: Math.round(purchaseITC.sgst * 100) / 100,
      total: Math.round((purchaseITC.igst + purchaseITC.cgst + purchaseITC.sgst) * 100) / 100,
    },
    netTaxPayable: {
      igst: Math.round(netIgst * 100) / 100,
      cgst: Math.round(netCgst * 100) / 100,
      sgst: Math.round(netSgst * 100) / 100,
      total: Math.round((netIgst + netCgst + netSgst) * 100) / 100,
    },
  }
}
