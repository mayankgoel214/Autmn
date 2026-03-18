'use server'

import { prisma } from '@/lib/db/prisma'
import { refreshAccessToken, fetchInvoices, fetchBills } from './zoho-client'

/**
 * Sync financial data from Zoho Books for a company.
 * Pulls invoices and bills, stores them in the financial_data table.
 */
export async function syncZohoData(companyId: string): Promise<{
  success: boolean
  invoiceCount: number
  billCount: number
  error?: string
}> {
  // Get stored tokens
  const token = await prisma.integrationToken.findUnique({
    where: { companyId_provider: { companyId, provider: 'zoho_books' } },
  })

  if (!token) {
    return { success: false, invoiceCount: 0, billCount: 0, error: 'Zoho Books not connected' }
  }

  // Check if access token needs refresh
  let accessToken = token.accessToken
  if (token.expiresAt < new Date()) {
    try {
      const refreshed = await refreshAccessToken(token.refreshToken)
      accessToken = refreshed.accessToken
      await prisma.integrationToken.update({
        where: { id: token.id },
        data: {
          accessToken: refreshed.accessToken,
          expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
        },
      })
    } catch (error) {
      return { success: false, invoiceCount: 0, billCount: 0, error: 'Failed to refresh Zoho token. Please reconnect.' }
    }
  }

  const metadata = token.metadata as Record<string, string> | null
  const organizationId = metadata?.organizationId

  if (!organizationId) {
    return { success: false, invoiceCount: 0, billCount: 0, error: 'No Zoho organization found. Please reconnect.' }
  }

  let totalInvoices = 0
  let totalBills = 0

  try {
    // Fetch invoices (paginated)
    let page = 1
    let hasMore = true

    while (hasMore && page <= 10) { // Max 10 pages = 2000 invoices
      const result = await fetchInvoices(accessToken, organizationId, { page })

      for (const invoice of result.invoices) {
        // Upsert each invoice
        await prisma.$executeRaw`
          INSERT INTO financial_data (id, company_id, source, data_type, reference_number, date, amount, tax_amount, gst_rate, hsn_sac_code, counterparty_gstin, counterparty_name, place_of_supply, raw_data, synced_at)
          VALUES (gen_random_uuid(), ${companyId}::uuid, 'zoho_books', 'invoice', ${invoice.invoiceNumber}, ${new Date(invoice.date)}::date,
                  ${invoice.total}::decimal, ${invoice.taxTotal}::decimal, ${invoice.lineItems[0]?.taxPercentage || 0}::decimal,
                  ${invoice.lineItems[0]?.hsnOrSac || ''}::varchar, ${invoice.customerGstin || ''}::varchar,
                  ${invoice.customerName}::varchar, ${invoice.placeOfSupply || ''}::varchar,
                  ${JSON.stringify(invoice)}::jsonb, NOW())
          ON CONFLICT DO NOTHING
        `
        totalInvoices++
      }

      hasMore = result.hasMore
      page++
    }

    // Fetch bills (paginated)
    page = 1
    hasMore = true

    while (hasMore && page <= 10) {
      const result = await fetchBills(accessToken, organizationId, { page })

      for (const bill of result.bills) {
        await prisma.$executeRaw`
          INSERT INTO financial_data (id, company_id, source, data_type, reference_number, date, amount, tax_amount, counterparty_gstin, counterparty_name, raw_data, synced_at)
          VALUES (gen_random_uuid(), ${companyId}::uuid, 'zoho_books', 'bill', ${bill.billNumber}, ${new Date(bill.date)}::date,
                  ${bill.total}::decimal, ${bill.taxTotal}::decimal, ${bill.vendorGstin || ''}::varchar,
                  ${bill.vendorName}::varchar, ${JSON.stringify(bill)}::jsonb, NOW())
          ON CONFLICT DO NOTHING
        `
        totalBills++
      }

      hasMore = result.hasMore
      page++
    }

    return { success: true, invoiceCount: totalInvoices, billCount: totalBills }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    return { success: false, invoiceCount: totalInvoices, billCount: totalBills, error: message }
  }
}
