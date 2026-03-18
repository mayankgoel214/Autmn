/**
 * Condition Evaluator
 *
 * Evaluates applicability condition JSON against a company profile.
 * Conditions use a recursive AND/OR tree structure.
 *
 * Example condition:
 * {
 *   "operator": "AND",
 *   "conditions": [
 *     { "field": "entity_type", "op": "in", "value": ["private_limited", "public_limited"] },
 *     { "field": "employee_count", "op": "gte", "value": 20 }
 *   ]
 * }
 */

export interface CompanyProfile {
  entityType: string
  mcaStatus: string | null
  employeeCount: number
  annualTurnover: number // in rupees
  gstRegistered: boolean
  gstScheme: string | null
  pfRegistered: boolean
  esiRegistered: boolean
  hasForeignInvestment: boolean
  dpiitRecognized: boolean
  operatingStates: string[]
  industrySector: string | null
}

interface Condition {
  field: string
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'contains' | 'exists'
  value: unknown
}

interface ConditionGroup {
  operator: 'AND' | 'OR'
  conditions: (Condition | ConditionGroup)[]
}

// Map condition field names to company profile fields
function getFieldValue(profile: CompanyProfile, field: string): unknown {
  const fieldMap: Record<string, unknown> = {
    entity_type: profile.entityType,
    mca_status: profile.mcaStatus,
    employee_count: profile.employeeCount,
    annual_turnover: profile.annualTurnover,
    gst_registered: profile.gstRegistered,
    gst_scheme: profile.gstScheme,
    pf_registered: profile.pfRegistered,
    esi_registered: profile.esiRegistered,
    has_foreign_investment: profile.hasForeignInvestment,
    dpiit_recognized: profile.dpiitRecognized,
    operating_states: profile.operatingStates,
    industry_sector: profile.industrySector,
  }
  return fieldMap[field]
}

function evaluateCondition(condition: Condition, profile: CompanyProfile): boolean {
  const fieldValue = getFieldValue(profile, condition.field)

  switch (condition.op) {
    case 'eq':
      return fieldValue === condition.value
    case 'neq':
      return fieldValue !== condition.value
    case 'gt':
      return typeof fieldValue === 'number' && fieldValue > (condition.value as number)
    case 'gte':
      return typeof fieldValue === 'number' && fieldValue >= (condition.value as number)
    case 'lt':
      return typeof fieldValue === 'number' && fieldValue < (condition.value as number)
    case 'lte':
      return typeof fieldValue === 'number' && fieldValue <= (condition.value as number)
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(fieldValue)
    case 'not_in':
      return Array.isArray(condition.value) && !condition.value.includes(fieldValue)
    case 'contains':
      return Array.isArray(fieldValue) && fieldValue.includes(condition.value as string)
    case 'exists':
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== '' && fieldValue !== 0
    default:
      return false
  }
}

function isConditionGroup(obj: Condition | ConditionGroup): obj is ConditionGroup {
  return 'operator' in obj && 'conditions' in obj
}

export function evaluateConditions(
  conditionGroup: ConditionGroup,
  profile: CompanyProfile
): boolean {
  const { operator, conditions } = conditionGroup

  const results = conditions.map((condition) => {
    if (isConditionGroup(condition)) {
      return evaluateConditions(condition, profile)
    }
    return evaluateCondition(condition, profile)
  })

  if (operator === 'AND') {
    return results.every(Boolean)
  }
  return results.some(Boolean) // OR
}
