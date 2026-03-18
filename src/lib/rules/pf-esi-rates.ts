/**
 * PF and ESI Rate Tables
 * Current as of FY 2025-26
 */

export const PF_RATES = {
  employee: 12,         // 12% of (Basic + DA)
  employer_epf: 3.67,   // 3.67% to EPF
  employer_eps: 8.33,   // 8.33% to EPS (capped at Rs.15,000 wage)
  employer_total: 12,   // Total employer = 3.67 + 8.33 = 12%
  eps_wage_ceiling: 15000, // EPS contribution capped at this wage
  edli: 0.5,            // EDLI insurance (capped at Rs.15,000)
  admin: 0.5,           // Admin charges (minimum Rs.500/month)
  admin_minimum: 500,
  trigger_employee_count: 20, // Mandatory when 20+ employees
} as const

export const ESI_RATES = {
  employee: 0.75,       // 0.75% of gross wages
  employer: 3.25,       // 3.25% of gross wages
  total: 4.0,           // Total = 4%
  wage_ceiling: 21000,  // Applicable for employees earning up to Rs.21,000/month
  trigger_employee_count: 10, // Mandatory when 10+ employees
} as const

/**
 * Compute PF contribution for one employee for one month.
 */
export function computePFContribution(basicPlusDA: number): {
  employeePF: number
  employerEPF: number
  employerEPS: number
  employerEDLI: number
  employerAdmin: number
  totalEmployee: number
  totalEmployer: number
} {
  const employeePF = Math.round(basicPlusDA * PF_RATES.employee / 100)

  // EPS is capped at Rs.15,000 wage ceiling
  const epsWage = Math.min(basicPlusDA, PF_RATES.eps_wage_ceiling)
  const employerEPS = Math.round(epsWage * PF_RATES.employer_eps / 100)

  // EPF = total employer (12%) minus EPS
  const employerTotal = Math.round(basicPlusDA * PF_RATES.employer_total / 100)
  const employerEPF = employerTotal - employerEPS

  // EDLI capped at Rs.15,000
  const edliWage = Math.min(basicPlusDA, PF_RATES.eps_wage_ceiling)
  const employerEDLI = Math.round(edliWage * PF_RATES.edli / 100)

  // Admin charges — 0.5% of Basic + DA, minimum Rs.500
  const employerAdmin = Math.max(
    Math.round(basicPlusDA * PF_RATES.admin / 100),
    PF_RATES.admin_minimum
  )

  return {
    employeePF,
    employerEPF,
    employerEPS,
    employerEDLI,
    employerAdmin,
    totalEmployee: employeePF,
    totalEmployer: employerEPF + employerEPS + employerEDLI + employerAdmin,
  }
}

/**
 * Compute ESI contribution for one employee for one month.
 */
export function computeESIContribution(grossWages: number): {
  employeeESI: number
  employerESI: number
  totalESI: number
  isEligible: boolean
} {
  const isEligible = grossWages <= ESI_RATES.wage_ceiling

  if (!isEligible) {
    return { employeeESI: 0, employerESI: 0, totalESI: 0, isEligible: false }
  }

  const employeeESI = Math.round(grossWages * ESI_RATES.employee / 100)
  const employerESI = Math.round(grossWages * ESI_RATES.employer / 100)

  return {
    employeeESI,
    employerESI,
    totalESI: employeeESI + employerESI,
    isEligible: true,
  }
}
