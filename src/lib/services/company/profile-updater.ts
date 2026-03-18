'use server'

import { prisma } from '@/lib/db/prisma'

/**
 * Parse a user's natural language answer into structured profile updates.
 * Called after each AI conversation turn to update the company profile.
 */
export async function updateCompanyProfile(
  companyId: string,
  field: string,
  value: string
) {
  const updates: Record<string, unknown> = {}

  switch (field) {
    case 'employee_count': {
      const num = parseNumber(value)
      if (num !== null) updates.employeeCount = num
      break
    }
    case 'annual_turnover': {
      const amount = parseIndianAmount(value)
      if (amount !== null) updates.annualTurnover = BigInt(amount)
      break
    }
    case 'gst_number': {
      const gstin = value.trim().toUpperCase()
      if (gstin.length === 15) {
        updates.gstNumber = gstin
        updates.gstRegistered = true
      } else if (value.toLowerCase().includes('no') || value.toLowerCase().includes('not')) {
        updates.gstRegistered = false
      }
      break
    }
    case 'gst_scheme': {
      const lower = value.toLowerCase()
      if (lower.includes('qrmp') || lower.includes('quarterly')) {
        updates.gstScheme = 'qrmp'
      } else if (lower.includes('monthly')) {
        updates.gstScheme = 'regular'
      } else if (lower.includes('composition')) {
        updates.gstScheme = 'composition'
      }
      break
    }
    case 'operating_states': {
      const states = parseStates(value)
      if (states.length > 0) updates.operatingStates = states
      break
    }
    case 'foreign_investment': {
      const lower = value.toLowerCase()
      updates.hasForeignInvestment = lower.includes('yes') || lower.includes('have') || lower.includes('received')
      break
    }
    case 'dpiit': {
      const lower = value.toLowerCase()
      updates.dpiitRecognized = lower.includes('yes') || lower.includes('recognized') || lower.includes('registered')
      break
    }
    case 'pf_registered': {
      const lower = value.toLowerCase()
      updates.pfRegistered = lower.includes('yes') || lower.includes('registered')
      break
    }
    case 'esi_registered': {
      const lower = value.toLowerCase()
      updates.esiRegistered = lower.includes('yes') || lower.includes('registered')
      break
    }
    case 'industry_sector': {
      updates.industrySector = value.trim()
      break
    }
    case 'onboarding_complete': {
      updates.onboardingComplete = true
      break
    }
  }

  if (Object.keys(updates).length > 0) {
    await prisma.company.update({
      where: { id: companyId },
      data: updates,
    })
  }

  return updates
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[^0-9]/g, '')
  const num = parseInt(cleaned, 10)
  return isNaN(num) ? null : num
}

function parseIndianAmount(value: string): number | null {
  const lower = value.toLowerCase().replace(/,/g, '').replace(/₹/g, '').replace(/rs\.?/g, '').trim()

  // Handle "X crore" or "X cr"
  const croreMatch = lower.match(/([\d.]+)\s*(?:crore|cr)/)
  if (croreMatch) return Math.round(parseFloat(croreMatch[1]) * 10000000)

  // Handle "X lakh" or "X L"
  const lakhMatch = lower.match(/([\d.]+)\s*(?:lakh|lac|l\b)/)
  if (lakhMatch) return Math.round(parseFloat(lakhMatch[1]) * 100000)

  // Handle "X thousand" or "X K"
  const thousandMatch = lower.match(/([\d.]+)\s*(?:thousand|k\b)/)
  if (thousandMatch) return Math.round(parseFloat(thousandMatch[1]) * 1000)

  // Plain number
  const num = parseFloat(lower.replace(/[^0-9.]/g, ''))
  return isNaN(num) ? null : Math.round(num)
}

function parseStates(value: string): string[] {
  const stateMap: Record<string, string> = {
    'maharashtra': 'MH', 'mumbai': 'MH', 'pune': 'MH',
    'karnataka': 'KA', 'bangalore': 'KA', 'bengaluru': 'KA',
    'delhi': 'DL', 'new delhi': 'DL', 'noida': 'UP', 'gurgaon': 'HR', 'gurugram': 'HR',
    'tamil nadu': 'TN', 'chennai': 'TN',
    'telangana': 'TG', 'hyderabad': 'TG',
    'gujarat': 'GJ', 'ahmedabad': 'GJ',
    'west bengal': 'WB', 'kolkata': 'WB',
    'uttar pradesh': 'UP', 'lucknow': 'UP',
    'rajasthan': 'RJ', 'jaipur': 'RJ',
    'kerala': 'KL', 'kochi': 'KL',
    'madhya pradesh': 'MP',
    'haryana': 'HR',
    'punjab': 'PB',
    'goa': 'GA',
    'assam': 'AS',
    'odisha': 'OD', 'orissa': 'OD',
    'jharkhand': 'JH',
    'bihar': 'BR',
    'himachal pradesh': 'HP',
    'uttarakhand': 'UK',
    'chhattisgarh': 'CG',
  }

  const lower = value.toLowerCase()
  const found = new Set<string>()

  for (const [key, code] of Object.entries(stateMap)) {
    if (lower.includes(key)) found.add(code)
  }

  // Also accept direct state codes like "MH, KA, DL"
  const codePattern = /\b([A-Z]{2})\b/g
  const originalValue = value.toUpperCase()
  let match
  while ((match = codePattern.exec(originalValue)) !== null) {
    const validCodes = Object.values(stateMap)
    if (validCodes.includes(match[1])) found.add(match[1])
  }

  return Array.from(found)
}
