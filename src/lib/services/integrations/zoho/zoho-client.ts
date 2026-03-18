/**
 * Zoho Books API Client
 *
 * OAuth 2.0 flow:
 * 1. Redirect user to Zoho consent screen
 * 2. User authorizes → Zoho redirects back with auth code
 * 3. Exchange auth code for access_token + refresh_token
 * 4. Access token expires in 1 hour, refresh token is permanent
 * 5. Use refresh token to get new access tokens automatically
 *
 * Indian Zoho accounts use .in domains (accounts.zoho.com, www.zohoapis.in)
 */

const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com'
const ZOHO_API_URL = 'https://www.zohoapis.in/books/v3'

export function getZohoAuthURL(): string {
  const clientId = process.env.ZOHO_CLIENT_ID
  const redirectUri = process.env.ZOHO_REDIRECT_URI

  if (!clientId || !redirectUri) {
    throw new Error('ZOHO_CLIENT_ID and ZOHO_REDIRECT_URI must be set')
  }

  const scopes = [
    'ZohoBooks.invoices.READ',
    'ZohoBooks.bills.READ',
    'ZohoBooks.expenses.READ',
    'ZohoBooks.creditnotes.READ',
    'ZohoBooks.contacts.READ',
    'ZohoBooks.settings.READ',
  ].join(',')

  const params = new URLSearchParams({
    scope: scopes,
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    access_type: 'offline', // gets refresh token
    prompt: 'consent',
  })

  return `${ZOHO_ACCOUNTS_URL}/oauth/v2/auth?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
}> {
  const response = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      redirect_uri: process.env.ZOHO_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  })

  const data = await response.json()

  if (data.error) {
    throw new Error(`Zoho token exchange failed: ${data.error}`)
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in || 3600,
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string
  expiresIn: number
}> {
  const response = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })

  const data = await response.json()

  if (data.error) {
    throw new Error(`Zoho token refresh failed: ${data.error}`)
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600,
  }
}

/**
 * Get the organization ID (required for all Zoho Books API calls)
 */
export async function getOrganizations(accessToken: string): Promise<Array<{
  organizationId: string
  name: string
  country: string
}>> {
  const response = await fetch(`${ZOHO_API_URL}/organizations`, {
    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
  })

  const data = await response.json()
  return (data.organizations || []).map((org: Record<string, string>) => ({
    organizationId: org.organization_id,
    name: org.name,
    country: org.country,
  }))
}

/**
 * Fetch invoices from Zoho Books
 */
export async function fetchInvoices(
  accessToken: string,
  organizationId: string,
  params?: { page?: number; dateStart?: string; dateEnd?: string }
): Promise<{
  invoices: ZohoInvoice[]
  hasMore: boolean
  totalPages: number
}> {
  const queryParams = new URLSearchParams({
    organization_id: organizationId,
    page: String(params?.page || 1),
    per_page: '200',
    sort_column: 'date',
    sort_order: 'D',
  })

  if (params?.dateStart) queryParams.set('date_start', params.dateStart)
  if (params?.dateEnd) queryParams.set('date_end', params.dateEnd)

  const response = await fetch(`${ZOHO_API_URL}/invoices?${queryParams}`, {
    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
  })

  const data = await response.json()

  return {
    invoices: (data.invoices || []).map(mapZohoInvoice),
    hasMore: data.page_context?.has_more_page || false,
    totalPages: data.page_context?.total_pages || 1,
  }
}

/**
 * Fetch bills (purchase invoices) from Zoho Books
 */
export async function fetchBills(
  accessToken: string,
  organizationId: string,
  params?: { page?: number; dateStart?: string; dateEnd?: string }
): Promise<{
  bills: ZohoBill[]
  hasMore: boolean
}> {
  const queryParams = new URLSearchParams({
    organization_id: organizationId,
    page: String(params?.page || 1),
    per_page: '200',
  })

  if (params?.dateStart) queryParams.set('date_start', params.dateStart)
  if (params?.dateEnd) queryParams.set('date_end', params.dateEnd)

  const response = await fetch(`${ZOHO_API_URL}/bills?${queryParams}`, {
    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
  })

  const data = await response.json()

  return {
    bills: (data.bills || []).map(mapZohoBill),
    hasMore: data.page_context?.has_more_page || false,
  }
}

// Types
export interface ZohoInvoice {
  invoiceId: string
  invoiceNumber: string
  date: string
  dueDate: string
  customerName: string
  customerGstin: string | null
  gstTreatment: string | null
  placeOfSupply: string | null
  total: number
  taxTotal: number
  status: string
  lineItems: Array<{
    name: string
    rate: number
    quantity: number
    amount: number
    taxPercentage: number
    hsnOrSac: string | null
    cgst: number
    sgst: number
    igst: number
  }>
}

export interface ZohoBill {
  billId: string
  billNumber: string
  date: string
  vendorName: string
  vendorGstin: string | null
  total: number
  taxTotal: number
  status: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapZohoInvoice(inv: any): ZohoInvoice {
  return {
    invoiceId: inv.invoice_id,
    invoiceNumber: inv.invoice_number,
    date: inv.date,
    dueDate: inv.due_date,
    customerName: inv.customer_name,
    customerGstin: inv.gst_no || null,
    gstTreatment: inv.gst_treatment || null,
    placeOfSupply: inv.place_of_supply || null,
    total: inv.total || 0,
    taxTotal: inv.tax_total || 0,
    status: inv.status,
    lineItems: (inv.line_items || []).map((li: Record<string, unknown>) => ({
      name: li.name || li.description || '',
      rate: li.rate || 0,
      quantity: li.quantity || 1,
      amount: li.item_total || 0,
      taxPercentage: li.tax_percentage || 0,
      hsnOrSac: li.hsn_or_sac || null,
      cgst: li.cgst_amount || 0,
      sgst: li.sgst_amount || 0,
      igst: li.igst_amount || 0,
    })),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapZohoBill(bill: any): ZohoBill {
  return {
    billId: bill.bill_id,
    billNumber: bill.bill_number,
    date: bill.date,
    vendorName: bill.vendor_name,
    vendorGstin: bill.gst_no || null,
    total: bill.total || 0,
    taxTotal: bill.tax_total || 0,
    status: bill.status,
  }
}
