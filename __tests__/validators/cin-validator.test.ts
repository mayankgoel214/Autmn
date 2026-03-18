import { validateCIN, validateGSTIN } from '@/lib/utils/cin-validator'

describe('validateCIN', () => {
  // Valid CINs
  it('accepts a valid unlisted private limited CIN', () => {
    const result = validateCIN('U72200KA2020PTC045678')
    expect(result.isValid).toBe(true)
    expect(result.parsed).toEqual({
      listingStatus: 'Unlisted',
      industryCode: '72200',
      stateCode: 'KA',
      yearOfIncorporation: 2020,
      companyType: 'PTC',
      registrationNumber: '045678',
    })
  })

  it('accepts a valid listed public limited CIN', () => {
    const result = validateCIN('L12345MH2015PLC123456')
    expect(result.isValid).toBe(true)
    expect(result.parsed?.listingStatus).toBe('Listed')
    expect(result.parsed?.companyType).toBe('PLC')
  })

  it('accepts a valid OPC CIN', () => {
    const result = validateCIN('U99999DL2022OPC000001')
    expect(result.isValid).toBe(true)
    expect(result.parsed?.companyType).toBe('OPC')
  })

  it('handles lowercase input by normalizing', () => {
    const result = validateCIN('u72200ka2020ptc045678')
    expect(result.isValid).toBe(true)
  })

  it('trims whitespace', () => {
    const result = validateCIN('  U72200KA2020PTC045678  ')
    expect(result.isValid).toBe(true)
  })

  // Invalid CINs
  it('rejects empty string', () => {
    const result = validateCIN('')
    expect(result.isValid).toBe(false)
    expect(result.error).toBe('CIN is required')
  })

  it('rejects CIN shorter than 21 characters', () => {
    const result = validateCIN('U72200KA2020PTC0456')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('21 characters')
  })

  it('rejects CIN longer than 21 characters', () => {
    const result = validateCIN('U72200KA2020PTC04567899')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('21 characters')
  })

  it('rejects CIN starting with invalid letter', () => {
    const result = validateCIN('X72200KA2020PTC045678')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('format is invalid')
  })

  it('rejects invalid state code', () => {
    const result = validateCIN('U72200XX2020PTC045678')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('Invalid state code')
  })

  it('rejects invalid company type', () => {
    const result = validateCIN('U72200KA2020XYZ045678')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('Invalid company type')
  })

  it('rejects future incorporation year', () => {
    const result = validateCIN('U72200KA2099PTC045678')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('Invalid incorporation year')
  })

  it('rejects year before 1900', () => {
    const result = validateCIN('U72200KA1800PTC045678')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('Invalid incorporation year')
  })

  // All valid state codes
  const stateCodesInCIN = ['MH', 'KA', 'DL', 'TN', 'TG', 'GJ', 'WB', 'UP', 'RJ', 'KL']
  it.each(stateCodesInCIN)('accepts state code %s', (state) => {
    const cin = `U72200${state}2020PTC045678`
    const result = validateCIN(cin)
    expect(result.isValid).toBe(true)
    expect(result.parsed?.stateCode).toBe(state)
  })

  // All valid company types
  const companyTypes = ['PTC', 'PLC', 'OPC', 'NPL', 'FTC', 'GAP', 'SGC']
  it.each(companyTypes)('accepts company type %s', (type) => {
    const cin = `U72200KA2020${type}045678`
    const result = validateCIN(cin)
    expect(result.isValid).toBe(true)
    expect(result.parsed?.companyType).toBe(type)
  })
})

describe('validateGSTIN', () => {
  it('accepts a valid GSTIN', () => {
    const result = validateGSTIN('27AABCM1234C1Z5')
    expect(result.isValid).toBe(true)
  })

  it('rejects empty string', () => {
    const result = validateGSTIN('')
    expect(result.isValid).toBe(false)
  })

  it('rejects GSTIN with wrong length', () => {
    const result = validateGSTIN('27AABCM1234C1Z')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('15 characters')
  })

  it('rejects GSTIN with invalid state code', () => {
    const result = validateGSTIN('99AABCM1234C1Z5')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('Invalid state code')
  })

  it('handles lowercase input', () => {
    const result = validateGSTIN('27aabcm1234c1z5')
    expect(result.isValid).toBe(true)
  })
})
