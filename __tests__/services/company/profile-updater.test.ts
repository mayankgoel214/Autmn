/**
 * Tests for the profile updater — parsing natural language answers
 * into structured company profile fields.
 *
 * These are critical because wrong parsing means wrong compliance mapping.
 */

// Mock Prisma
jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    company: {
      update: jest.fn().mockResolvedValue({}),
    },
  },
}))

import { updateCompanyProfile } from '@/lib/services/company/profile-updater'
import { prisma } from '@/lib/db/prisma'

const mockUpdate = prisma.company.update as jest.Mock

beforeEach(() => {
  mockUpdate.mockClear()
})

describe('employee_count parsing', () => {
  it('parses "14" as 14', async () => {
    await updateCompanyProfile('company-1', 'employee_count', '14')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { employeeCount: 14 },
    })
  })

  it('parses "about 30 people" as 30', async () => {
    await updateCompanyProfile('company-1', 'employee_count', 'about 30 people')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { employeeCount: 30 },
    })
  })

  it('parses "250+" as 250', async () => {
    await updateCompanyProfile('company-1', 'employee_count', '250+')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { employeeCount: 250 },
    })
  })
})

describe('annual_turnover parsing', () => {
  it('parses "50 lakhs" as 5000000', async () => {
    await updateCompanyProfile('company-1', 'annual_turnover', '50 lakhs')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { annualTurnover: BigInt(5000000) },
    })
  })

  it('parses "2 crore" as 20000000', async () => {
    await updateCompanyProfile('company-1', 'annual_turnover', '2 crore')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { annualTurnover: BigInt(20000000) },
    })
  })

  it('parses "1.5 cr" as 15000000', async () => {
    await updateCompanyProfile('company-1', 'annual_turnover', '1.5 cr')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { annualTurnover: BigInt(15000000) },
    })
  })

  it('parses "Rs. 80 lakh" as 8000000', async () => {
    await updateCompanyProfile('company-1', 'annual_turnover', 'Rs. 80 lakh')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { annualTurnover: BigInt(8000000) },
    })
  })

  it('parses "about 25 lakhs" as 2500000', async () => {
    await updateCompanyProfile('company-1', 'annual_turnover', 'about 25 lakhs')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { annualTurnover: BigInt(2500000) },
    })
  })

  it('parses "₹10,00,000" as 1000000', async () => {
    await updateCompanyProfile('company-1', 'annual_turnover', '₹10,00,000')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { annualTurnover: BigInt(1000000) },
    })
  })
})

describe('gst_number parsing', () => {
  it('stores valid GSTIN and marks registered', async () => {
    await updateCompanyProfile('company-1', 'gst_number', '27AABCM1234C1Z5')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { gstNumber: '27AABCM1234C1Z5', gstRegistered: true },
    })
  })

  it('marks not registered when answer is "No"', async () => {
    await updateCompanyProfile('company-1', 'gst_number', 'No, not registered')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { gstRegistered: false },
    })
  })
})

describe('operating_states parsing', () => {
  it('parses "Mumbai and Bangalore"', async () => {
    await updateCompanyProfile('company-1', 'operating_states', 'Mumbai and Bangalore')
    const call = mockUpdate.mock.calls[0][0]
    expect(call.data.operatingStates).toContain('MH')
    expect(call.data.operatingStates).toContain('KA')
  })

  it('parses "Delhi, Chennai, Hyderabad"', async () => {
    await updateCompanyProfile('company-1', 'operating_states', 'Delhi, Chennai, Hyderabad')
    const call = mockUpdate.mock.calls[0][0]
    expect(call.data.operatingStates).toContain('DL')
    expect(call.data.operatingStates).toContain('TN')
    expect(call.data.operatingStates).toContain('TG')
  })

  it('parses state codes "MH, KA"', async () => {
    await updateCompanyProfile('company-1', 'operating_states', 'MH, KA')
    const call = mockUpdate.mock.calls[0][0]
    expect(call.data.operatingStates).toContain('MH')
    expect(call.data.operatingStates).toContain('KA')
  })

  it('parses "just Karnataka" as single state', async () => {
    await updateCompanyProfile('company-1', 'operating_states', 'just Karnataka')
    const call = mockUpdate.mock.calls[0][0]
    expect(call.data.operatingStates).toEqual(['KA'])
  })
})

describe('foreign_investment parsing', () => {
  it('detects "yes" as true', async () => {
    await updateCompanyProfile('company-1', 'foreign_investment', 'Yes, we received funding from a US VC')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { hasForeignInvestment: true },
    })
  })

  it('detects "no" as false', async () => {
    await updateCompanyProfile('company-1', 'foreign_investment', 'No, all domestic investors')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { hasForeignInvestment: false },
    })
  })
})

describe('dpiit parsing', () => {
  it('detects "yes recognized" as true', async () => {
    await updateCompanyProfile('company-1', 'dpiit', 'Yes, we are recognized')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { dpiitRecognized: true },
    })
  })

  it('detects "no" as false', async () => {
    await updateCompanyProfile('company-1', 'dpiit', 'No')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { dpiitRecognized: false },
    })
  })
})

describe('gst_scheme parsing', () => {
  it('detects "monthly"', async () => {
    await updateCompanyProfile('company-1', 'gst_scheme', 'We file monthly')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { gstScheme: 'regular' },
    })
  })

  it('detects "QRMP"', async () => {
    await updateCompanyProfile('company-1', 'gst_scheme', 'QRMP quarterly')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { gstScheme: 'qrmp' },
    })
  })
})
