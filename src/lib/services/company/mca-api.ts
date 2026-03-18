/**
 * Sandbox.co.in MCA API Client
 *
 * Auth flow: POST /authenticate with x-api-key + x-api-secret → get access_token (24h)
 * Then use raw token (no Bearer prefix) in authorization header
 */

const SANDBOX_BASE_URL = 'https://api.sandbox.co.in'

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5-minute buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token
  }

  const apiKey = process.env.SANDBOX_API_KEY
  const apiSecret = process.env.SANDBOX_API_SECRET

  if (!apiKey || !apiSecret) {
    throw new Error('SANDBOX_API_KEY and SANDBOX_API_SECRET must be set in environment variables')
  }

  const response = await fetch(`${SANDBOX_BASE_URL}/authenticate`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'x-api-secret': apiSecret,
      'x-api-version': '1.0',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Sandbox auth failed (${response.status}): ${body}`)
  }

  const data = await response.json()
  const token = data.data?.access_token

  if (!token) {
    throw new Error('No access_token in Sandbox auth response')
  }

  // Cache for 23 hours (token valid for 24h)
  cachedToken = {
    token,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000,
  }

  return token
}

export interface MCACompanyData {
  companyName: string
  cin: string
  classOfCompany: string
  companyCategory: string
  companyStatus: string
  registeredAddress: string
  email: string
  dateOfIncorporation: string
  authorizedCapital: string
  paidUpCapital: string
  rocCode: string
  listedStatus: string
  registrationNumber: string
  directors: MCADirector[]
  charges: MCACharge[]
}

export interface MCADirector {
  dinOrPan: string
  name: string
  designation: string
  beginDate: string
  endDate: string
}

export interface MCACharge {
  dateOfCreation: string
  dateOfModification: string
  chargeAmount: string
  status: string
}

export class MCAApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public transactionId?: string
  ) {
    super(message)
    this.name = 'MCAApiError'
  }
}

export async function fetchCompanyByCIN(cin: string, retries = 2): Promise<MCACompanyData> {
  const token = await getAccessToken()

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Wait before retry: 2s, then 5s
      await new Promise(r => setTimeout(r, attempt * 2500))
    }

    try {
      const response = await fetch(`${SANDBOX_BASE_URL}/mca/company/master-data/search`, {
        method: 'POST',
        headers: {
          'authorization': token,
          'x-api-key': process.env.SANDBOX_API_KEY!,
          'x-api-version': '1.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          '@entity': 'in.co.sandbox.kyc.mca.master_data.request',
          id: cin,
          consent: 'y',
          reason: 'for compliance profile setup',
        }),
      })

      if (response.status === 504 || response.status === 503) {
        lastError = new MCAApiError(
          'MCA government servers are temporarily unavailable. Please try again in a few minutes.',
          response.status
        )
        continue // retry
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const message = body.message || `MCA API error (${response.status})`
        throw new MCAApiError(message, response.status, body.transaction_id)
      }

      const result = await response.json()
      const master = result.data?.company_master_data

      if (!master) {
        throw new MCAApiError('No company data returned', 422, result.transaction_id)
      }

      const directors = (result.data?.['directors/signatory_details'] || []).map(
        (d: Record<string, string>) => ({
          dinOrPan: d['din/pan'] || '',
          name: d.name || '',
          designation: d.designation || '',
          beginDate: d.begin_date || '',
          endDate: d.end_date || '-',
        })
      )

      const charges = (result.data?.charges || []).map(
        (c: Record<string, string>) => ({
          dateOfCreation: c.date_of_creation || '',
          dateOfModification: c.date_of_modification || '',
          chargeAmount: c.charge_amount || '0',
          status: c.status || '',
        })
      )

      return {
        companyName: master.company_name || '',
        cin: master.cin || cin,
        classOfCompany: master.class_of_company || '',
        companyCategory: master.company_category || '',
        companyStatus: master.company_status || '',
        registeredAddress: master.registered_address || '',
        email: master.email_id || '',
        dateOfIncorporation: master.date_of_incorporation || '',
        authorizedCapital: master['authorised_capital(rs)'] || '0',
        paidUpCapital: master['paid_up_capital(rs)'] || '0',
        rocCode: master.roc_code || '',
        listedStatus: master.whether_listed_or_not || 'Unlisted',
        registrationNumber: master.registration_number || '',
        directors,
        charges,
      }
    } catch (error) {
      if (error instanceof MCAApiError && error.statusCode !== 504 && error.statusCode !== 503) {
        throw error // don't retry non-timeout errors
      }
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  // All retries exhausted
  throw lastError || new MCAApiError('MCA servers are unavailable. Please try again later.', 503)
}
