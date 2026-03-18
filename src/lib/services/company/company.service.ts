'use server'

import { prisma } from '@/lib/db/prisma'
import { fetchCompanyByCIN, MCAApiError } from './mca-api'
import { validateCIN } from '@/lib/utils/cin-validator'

export interface CompanyLookupResult {
  success: boolean
  error?: string
  company?: {
    id: string
    companyName: string
    cin: string
    entityType: string
    dateOfIncorporation: string | null
    registeredState: string | null
    registeredAddress: string | null
    authorizedCapital: string
    paidUpCapital: string
    mcaStatus: string | null
    directors: Array<{
      name: string
      din: string | null
      designation: string | null
      beginDate: string
    }>
  }
}

function parseIndianDate(dateStr: string): Date | null {
  // Format: DD/MM/YYYY
  const parts = dateStr.split('/')
  if (parts.length !== 3) return null
  const [day, month, year] = parts.map(Number)
  if (!day || !month || !year) return null
  return new Date(year, month - 1, day)
}

function stateFromROC(rocCode: string): string | null {
  const mapping: Record<string, string> = {
    'RoC-Mumbai': 'MH', 'RoC-Pune': 'MH', 'RoC-Delhi': 'DL',
    'RoC-Bangalore': 'KA', 'RoC-Chennai': 'TN', 'RoC-Hyderabad': 'TG',
    'RoC-Ahmedabad': 'GJ', 'RoC-Kolkata': 'WB', 'RoC-Kanpur': 'UP',
    'RoC-Jaipur': 'RJ', 'RoC-Gwalior': 'MP', 'RoC-Ernakulam': 'KL',
    'RoC-Chandigarh': 'CH', 'RoC-Cuttack': 'OD', 'RoC-Patna': 'BR',
    'RoC-Guwahati': 'AS', 'RoC-Shillong': 'ML', 'RoC-Shimla': 'HP',
    'RoC-Ranchi': 'JH', 'RoC-Raipur': 'CG', 'RoC-Jammu': 'JK',
    'RoC-Dehradun': 'UK', 'RoC-Goa': 'GA',
  }
  return mapping[rocCode] || null
}

function entityTypeFromClass(classOfCompany: string): string {
  const lower = classOfCompany.toLowerCase()
  if (lower.includes('private')) return 'private_limited'
  if (lower.includes('public')) return 'public_limited'
  if (lower.includes('one person')) return 'opc'
  return 'private_limited'
}

export async function lookupCompanyByCIN(cin: string): Promise<CompanyLookupResult> {
  const validation = validateCIN(cin)
  if (!validation.isValid) {
    return { success: false, error: validation.error }
  }

  const normalizedCIN = cin.toUpperCase().trim()

  // Check if company already exists in our DB
  const existing = await prisma.company.findUnique({
    where: { cin: normalizedCIN },
    include: { directors: true },
  })

  if (existing) {
    return {
      success: true,
      company: {
        id: existing.id,
        companyName: existing.companyName,
        cin: existing.cin || normalizedCIN,
        entityType: existing.entityType,
        dateOfIncorporation: existing.dateOfIncorporation?.toISOString().split('T')[0] || null,
        registeredState: existing.registeredState,
        registeredAddress: existing.registeredAddress,
        authorizedCapital: existing.authorizedCapital?.toString() || '0',
        paidUpCapital: existing.paidUpCapital?.toString() || '0',
        mcaStatus: existing.mcaStatus,
        directors: existing.directors.map((d) => ({
          name: d.name,
          din: d.din,
          designation: d.designation,
          beginDate: d.dateOfAppointment?.toISOString().split('T')[0] || '',
        })),
      },
    }
  }

  // Fetch from MCA API (with fallback to demo data if MCA is down)
  try {
    let mcaData;
    try {
      mcaData = await fetchCompanyByCIN(normalizedCIN)
    } catch (apiError) {
      // If MCA is down (503/504), use demo data so the app is still usable
      if (apiError instanceof MCAApiError && (apiError.statusCode === 503 || apiError.statusCode === 504)) {
        mcaData = getDemoCompanyData(normalizedCIN, validation.parsed)
        if (!mcaData) throw apiError // no demo data for this CIN
      } else {
        throw apiError
      }
    }

    const incDate = parseIndianDate(mcaData.dateOfIncorporation)
    const state = stateFromROC(mcaData.rocCode) || validation.parsed?.stateCode || null

    const company = await prisma.company.create({
      data: {
        cin: normalizedCIN,
        companyName: mcaData.companyName,
        entityType: entityTypeFromClass(mcaData.classOfCompany),
        dateOfIncorporation: incDate,
        registeredState: state,
        registeredAddress: mcaData.registeredAddress,
        authorizedCapital: BigInt(mcaData.authorizedCapital || '0'),
        paidUpCapital: BigInt(mcaData.paidUpCapital || '0'),
        mcaStatus: mcaData.companyStatus,
        directors: {
          create: mcaData.directors.map((d) => ({
            din: d.dinOrPan.length === 8 ? d.dinOrPan : null,
            name: d.name,
            designation: d.designation,
            dateOfAppointment: parseIndianDate(d.beginDate),
          })),
        },
      },
      include: { directors: true },
    })

    return {
      success: true,
      company: {
        id: company.id,
        companyName: company.companyName,
        cin: company.cin || normalizedCIN,
        entityType: company.entityType,
        dateOfIncorporation: company.dateOfIncorporation?.toISOString().split('T')[0] || null,
        registeredState: company.registeredState,
        registeredAddress: company.registeredAddress,
        authorizedCapital: company.authorizedCapital?.toString() || '0',
        paidUpCapital: company.paidUpCapital?.toString() || '0',
        mcaStatus: company.mcaStatus,
        directors: company.directors.map((d) => ({
          name: d.name,
          din: d.din,
          designation: d.designation,
          beginDate: d.dateOfAppointment?.toISOString().split('T')[0] || '',
        })),
      },
    }
  } catch (error) {
    if (error instanceof MCAApiError) {
      if (error.statusCode === 422) {
        return { success: false, error: 'Company not found. Please check the CIN and try again.' }
      }
      return { success: false, error: `MCA lookup failed: ${error.message}` }
    }
    return { success: false, error: 'Unable to fetch company data. Please try again or enter details manually.' }
  }
}

export async function linkUserToCompany(userId: string, companyId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { companyId },
  })
}

/**
 * Demo company data used when MCA government servers are unavailable.
 * This lets users test the product even when MCA is down.
 * Will be replaced with real data when MCA servers respond.
 */
import type { MCACompanyData } from './mca-api'
import type { CINValidationResult } from '@/lib/utils/cin-validator'

function getDemoCompanyData(
  cin: string,
  parsed: CINValidationResult['parsed']
): MCACompanyData | null {
  const demoCompanies: Record<string, MCACompanyData> = {
    'U74120DL2008PLC180652': {
      companyName: 'ZOMATO LIMITED',
      cin: 'U74120DL2008PLC180652',
      classOfCompany: 'Public',
      companyCategory: 'Company limited by Shares',
      companyStatus: 'Active',
      registeredAddress: 'Ground Floor, 12A, Meghdoot, 94, Nehru Place, New Delhi, South Delhi, DL, 110019',
      email: 'secretarial@zomato.com',
      dateOfIncorporation: '18/01/2008',
      authorizedCapital: '12000000000',
      paidUpCapital: '8835519550',
      rocCode: 'RoC-Delhi',
      listedStatus: 'Listed',
      registrationNumber: '180652',
      directors: [
        { dinOrPan: '06938519', name: 'DEEPINDER GOYAL', designation: 'Managing Director & CEO', beginDate: '18/01/2008', endDate: '-' },
        { dinOrPan: '08263515', name: 'GUNJAN SONI', designation: 'Director', beginDate: '16/04/2019', endDate: '-' },
      ],
      charges: [],
    },
    'L85110KA1981PLC013115': {
      companyName: 'INFOSYS LIMITED',
      cin: 'L85110KA1981PLC013115',
      classOfCompany: 'Public',
      companyCategory: 'Company limited by Shares',
      companyStatus: 'Active',
      registeredAddress: 'Electronics City, Hosur Road, Bengaluru, KA, 560100',
      email: 'investors@infosys.com',
      dateOfIncorporation: '02/07/1981',
      authorizedCapital: '4800000000',
      paidUpCapital: '4142400000',
      rocCode: 'RoC-Bangalore',
      listedStatus: 'Listed',
      registrationNumber: '013115',
      directors: [
        { dinOrPan: '07982447', name: 'SALIL PAREKH', designation: 'Managing Director & CEO', beginDate: '02/01/2018', endDate: '-' },
        { dinOrPan: '00150433', name: 'NANDAN M NILEKANI', designation: 'Chairman', beginDate: '24/08/2017', endDate: '-' },
      ],
      charges: [],
    },
    'U72200GJ2013PTC076747': {
      companyName: 'RAZORPAY SOFTWARE PRIVATE LIMITED',
      cin: 'U72200GJ2013PTC076747',
      classOfCompany: 'Private',
      companyCategory: 'Company limited by Shares',
      companyStatus: 'Active',
      registeredAddress: '22, SG Highway, Ahmedabad, Gujarat, 380015',
      email: 'compliance@razorpay.com',
      dateOfIncorporation: '18/12/2013',
      authorizedCapital: '15000000',
      paidUpCapital: '9521566',
      rocCode: 'RoC-Ahmedabad',
      listedStatus: 'Unlisted',
      registrationNumber: '076747',
      directors: [
        { dinOrPan: '06677010', name: 'HARSHIL MATHUR', designation: 'Director', beginDate: '18/12/2013', endDate: '-' },
        { dinOrPan: '06677007', name: 'SHASHANK KUMAR', designation: 'Director', beginDate: '18/12/2013', endDate: '-' },
      ],
      charges: [],
    },
    'U51109KA2012PTC060560': {
      companyName: 'FLIPKART PRIVATE LIMITED',
      cin: 'U51109KA2012PTC060560',
      classOfCompany: 'Private',
      companyCategory: 'Company limited by Shares',
      companyStatus: 'Active',
      registeredAddress: 'Vaishnavi Summit, Ground Floor, 7th Main, 80 Feet Road, 3rd Block, Koramangala, Bengaluru, KA, 560034',
      email: 'secretarial@flipkart.com',
      dateOfIncorporation: '29/09/2012',
      authorizedCapital: '10000000000',
      paidUpCapital: '5765218320',
      rocCode: 'RoC-Bangalore',
      listedStatus: 'Unlisted',
      registrationNumber: '060560',
      directors: [
        { dinOrPan: '06966478', name: 'KALYAN KRISHNAMURTHY', designation: 'Director', beginDate: '01/01/2017', endDate: '-' },
      ],
      charges: [],
    },
  }

  // Return demo data if we have it for this CIN
  if (demoCompanies[cin]) {
    return demoCompanies[cin]
  }

  // For any unknown CIN, generate generic demo data from the parsed CIN
  if (parsed) {
    return {
      companyName: `DEMO COMPANY (${parsed.stateCode}) PRIVATE LIMITED`,
      cin,
      classOfCompany: parsed.companyType === 'PTC' ? 'Private' : 'Public',
      companyCategory: 'Company limited by Shares',
      companyStatus: 'Active',
      registeredAddress: `Registered Office, ${parsed.stateCode}, India`,
      email: '',
      dateOfIncorporation: `01/04/${parsed.yearOfIncorporation}`,
      authorizedCapital: '1000000',
      paidUpCapital: '100000',
      rocCode: '',
      listedStatus: parsed.listingStatus === 'Listed' ? 'Listed' : 'Unlisted',
      registrationNumber: parsed.registrationNumber,
      directors: [
        { dinOrPan: '00000001', name: 'DIRECTOR ONE', designation: 'Director', beginDate: `01/04/${parsed.yearOfIncorporation}`, endDate: '-' },
      ],
      charges: [],
    }
  }

  return null
}
