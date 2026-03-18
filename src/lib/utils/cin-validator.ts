/**
 * CIN (Corporate Identification Number) Validator
 *
 * Format: L/U XXXXX SS YYYY PTC NNNNNN (21 characters)
 * - Position 1: L (Listed) or U (Unlisted)
 * - Position 2-6: NIC 2008 industry code (5 digits)
 * - Position 7-8: State code (2 letters)
 * - Position 9-12: Year of incorporation (4 digits)
 * - Position 13-15: Company type (PTC/PLC/OPC/NPL/FTC/GAP/SGC)
 * - Position 16-21: ROC registration number (6 digits)
 */

const CIN_REGEX = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/

const VALID_STATE_CODES = [
  'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'GA',
  'GJ', 'HP', 'HR', 'JH', 'JK', 'KA', 'KL', 'LA', 'LD', 'MH',
  'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'PB', 'PY', 'RJ', 'SK',
  'TG', 'TN', 'TR', 'UK', 'UP', 'WB',
]

const VALID_COMPANY_TYPES = ['PTC', 'PLC', 'OPC', 'NPL', 'FTC', 'GAP', 'SGC']

export interface CINValidationResult {
  isValid: boolean
  error?: string
  parsed?: {
    listingStatus: 'Listed' | 'Unlisted'
    industryCode: string
    stateCode: string
    yearOfIncorporation: number
    companyType: string
    registrationNumber: string
  }
}

export function validateCIN(cin: string): CINValidationResult {
  if (!cin) {
    return { isValid: false, error: 'CIN is required' }
  }

  const normalized = cin.toUpperCase().trim()

  if (normalized.length !== 21) {
    return { isValid: false, error: 'CIN must be exactly 21 characters' }
  }

  if (!CIN_REGEX.test(normalized)) {
    return { isValid: false, error: 'CIN format is invalid' }
  }

  const stateCode = normalized.substring(6, 8)
  if (!VALID_STATE_CODES.includes(stateCode)) {
    return { isValid: false, error: `Invalid state code: ${stateCode}` }
  }

  const companyType = normalized.substring(12, 15)
  if (!VALID_COMPANY_TYPES.includes(companyType)) {
    return { isValid: false, error: `Invalid company type: ${companyType}` }
  }

  const year = parseInt(normalized.substring(8, 12), 10)
  const currentYear = new Date().getFullYear()
  if (year < 1900 || year > currentYear) {
    return { isValid: false, error: `Invalid incorporation year: ${year}` }
  }

  return {
    isValid: true,
    parsed: {
      listingStatus: normalized[0] === 'L' ? 'Listed' : 'Unlisted',
      industryCode: normalized.substring(1, 6),
      stateCode,
      yearOfIncorporation: year,
      companyType,
      registrationNumber: normalized.substring(15, 21),
    },
  }
}

/**
 * GSTIN Validator
 * Format: 2-digit state code + 10-char PAN + 1-digit entity number + Z + 1 check digit
 * Example: 27AABCM1234C1Z5
 */
const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d$/

export function validateGSTIN(gstin: string): { isValid: boolean; error?: string } {
  if (!gstin) return { isValid: false, error: 'GSTIN is required' }

  const normalized = gstin.toUpperCase().trim()

  if (normalized.length !== 15) {
    return { isValid: false, error: 'GSTIN must be exactly 15 characters' }
  }

  if (!GSTIN_REGEX.test(normalized)) {
    return { isValid: false, error: 'GSTIN format is invalid' }
  }

  const stateCodeNum = parseInt(normalized.substring(0, 2), 10)
  if (stateCodeNum < 1 || stateCodeNum > 37) {
    return { isValid: false, error: 'Invalid state code in GSTIN' }
  }

  return { isValid: true }
}
