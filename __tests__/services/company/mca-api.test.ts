/**
 * MCA API Client Tests
 *
 * Tests the response parsing and error handling of the Sandbox.co.in MCA API client.
 * Uses mocked fetch to avoid real API calls in CI.
 */

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch

// Reset modules to clear cached token between tests
beforeEach(() => {
  jest.resetModules()
  mockFetch.mockReset()
  process.env.SANDBOX_API_KEY = 'key_test_xxx'
  process.env.SANDBOX_API_SECRET = 'secret_test_xxx'
})

describe('fetchCompanyByCIN', () => {
  async function getFetchCompanyByCIN() {
    const mod = await import('@/lib/services/company/mca-api')
    return mod.fetchCompanyByCIN
  }

  const mockAuthResponse = {
    ok: true,
    json: async () => ({
      code: 200,
      data: { access_token: 'test_token_123' },
    }),
  }

  const mockCompanyResponse = {
    ok: true,
    json: async () => ({
      code: 200,
      transaction_id: 'txn_123',
      data: {
        company_master_data: {
          company_name: 'ACME TECH PRIVATE LIMITED',
          cin: 'U72200KA2020PTC045678',
          class_of_company: 'Private',
          company_category: 'Company limited by Shares',
          company_status: 'Active',
          registered_address: '123, MG Road, Bangalore',
          email_id: 'info@acmetech.in',
          date_of_incorporation: '15/06/2020',
          'authorised_capital(rs)': '1000000',
          'paid_up_capital(rs)': '100000',
          roc_code: 'RoC-Bangalore',
          whether_listed_or_not: 'Unlisted',
          registration_number: '045678',
        },
        'directors/signatory_details': [
          {
            'din/pan': '12345678',
            name: 'MAYANK GOEL',
            designation: 'Director',
            begin_date: '15/06/2020',
            end_date: '-',
          },
          {
            'din/pan': '87654321',
            name: 'ANSHIKA JAIN',
            designation: 'Director',
            begin_date: '15/06/2020',
            end_date: '-',
          },
        ],
        charges: [],
      },
    }),
  }

  it('authenticates and fetches company data', async () => {
    mockFetch
      .mockResolvedValueOnce(mockAuthResponse)
      .mockResolvedValueOnce(mockCompanyResponse)

    const fetchCompanyByCIN = await getFetchCompanyByCIN()
    const result = await fetchCompanyByCIN('U72200KA2020PTC045678')

    expect(result.companyName).toBe('ACME TECH PRIVATE LIMITED')
    expect(result.cin).toBe('U72200KA2020PTC045678')
    expect(result.companyStatus).toBe('Active')
    expect(result.authorizedCapital).toBe('1000000')
    expect(result.paidUpCapital).toBe('100000')
    expect(result.directors).toHaveLength(2)
    expect(result.directors[0].name).toBe('MAYANK GOEL')
    expect(result.directors[0].dinOrPan).toBe('12345678')
    expect(result.directors[1].name).toBe('ANSHIKA JAIN')
  })

  it('sends correct headers for auth', async () => {
    mockFetch
      .mockResolvedValueOnce(mockAuthResponse)
      .mockResolvedValueOnce(mockCompanyResponse)

    const fetchCompanyByCIN = await getFetchCompanyByCIN()
    await fetchCompanyByCIN('U72200KA2020PTC045678')

    // First call should be auth
    const authCall = mockFetch.mock.calls[0]
    expect(authCall[0]).toContain('/authenticate')
    expect(authCall[1].headers['x-api-key']).toBe('key_test_xxx')
    expect(authCall[1].headers['x-api-secret']).toBe('secret_test_xxx')
  })

  it('sends correct body for company lookup', async () => {
    mockFetch
      .mockResolvedValueOnce(mockAuthResponse)
      .mockResolvedValueOnce(mockCompanyResponse)

    const fetchCompanyByCIN = await getFetchCompanyByCIN()
    await fetchCompanyByCIN('U72200KA2020PTC045678')

    // Second call should be company lookup
    const lookupCall = mockFetch.mock.calls[1]
    const body = JSON.parse(lookupCall[1].body)
    expect(body['@entity']).toBe('in.co.sandbox.kyc.mca.master_data.request')
    expect(body.id).toBe('U72200KA2020PTC045678')
    expect(body.consent).toBe('y')
  })

  it('uses raw token without Bearer prefix', async () => {
    mockFetch
      .mockResolvedValueOnce(mockAuthResponse)
      .mockResolvedValueOnce(mockCompanyResponse)

    const fetchCompanyByCIN = await getFetchCompanyByCIN()
    await fetchCompanyByCIN('U72200KA2020PTC045678')

    const lookupCall = mockFetch.mock.calls[1]
    expect(lookupCall[1].headers.authorization).toBe('test_token_123')
    expect(lookupCall[1].headers.authorization).not.toContain('Bearer')
  })

  it('throws MCAApiError on 422 (company not found)', async () => {
    mockFetch
      .mockResolvedValueOnce(mockAuthResponse)
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          code: 422,
          message: 'Entered CIN/LLPIN/FLLPIN/FCRN is not found.',
          transaction_id: 'txn_err',
        }),
      })

    const fetchCompanyByCIN = await getFetchCompanyByCIN()
    const { MCAApiError } = await import('@/lib/services/company/mca-api')

    await expect(fetchCompanyByCIN('U72200KA2020PTC000000')).rejects.toThrow(MCAApiError)
  })

  it('throws error when API keys are missing', async () => {
    delete process.env.SANDBOX_API_KEY
    delete process.env.SANDBOX_API_SECRET

    const fetchCompanyByCIN = await getFetchCompanyByCIN()

    await expect(fetchCompanyByCIN('U72200KA2020PTC045678')).rejects.toThrow('must be set')
  })

  it('handles empty directors array', async () => {
    const noDirectorsResponse = {
      ok: true,
      json: async () => ({
        code: 200,
        data: {
          company_master_data: {
            company_name: 'EMPTY CO',
            cin: 'U72200KA2020PTC000001',
            class_of_company: 'Private',
            company_status: 'Active',
            date_of_incorporation: '01/01/2020',
            'authorised_capital(rs)': '100000',
            'paid_up_capital(rs)': '100000',
          },
          // no directors/signatory_details key
        },
      }),
    }

    mockFetch
      .mockResolvedValueOnce(mockAuthResponse)
      .mockResolvedValueOnce(noDirectorsResponse)

    const fetchCompanyByCIN = await getFetchCompanyByCIN()
    const result = await fetchCompanyByCIN('U72200KA2020PTC000001')

    expect(result.directors).toEqual([])
    expect(result.charges).toEqual([])
  })
})
