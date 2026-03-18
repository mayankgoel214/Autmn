/**
 * Master Compliance Obligations Seed Data
 *
 * Every compliance obligation a Private Limited Company in India can face.
 * Each has: due date rules, applicability conditions, penalty rules.
 */

export const allObligations = [
  // ============================================================
  // MONTHLY — GST
  // ============================================================
  {
    obligationCode: 'GSTR1',
    obligationName: 'GST Outward Supply Return',
    category: 'gst',
    frequency: 'monthly',
    baseDueDateRule: { type: 'fixed_day_of_month', day: 11, relative_to: 'next_month', holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'gst_registered', op: 'eq', value: true },
        { field: 'gst_scheme', op: 'neq', value: 'composition' },
        { field: 'gst_scheme', op: 'neq', value: 'qrmp' },
      ],
    },
    penaltyDescription: 'Rs.50/day (Rs.20 for nil return). Max Rs.10,000/month',
    penaltyCalculationRule: { type: 'per_day', amount: 50, nil_amount: 20, max: 10000 },
    filingPortal: 'GSTN',
    requiresDsc: false,
    canFileViaApi: true,
    legalReference: 'Section 37, CGST Act',
  },
  {
    obligationCode: 'GSTR3B',
    obligationName: 'GST Summary Return with Tax Payment',
    category: 'gst',
    frequency: 'monthly',
    baseDueDateRule: { type: 'fixed_day_of_month', day: 20, relative_to: 'next_month', holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'gst_registered', op: 'eq', value: true },
        { field: 'gst_scheme', op: 'neq', value: 'composition' },
        { field: 'gst_scheme', op: 'neq', value: 'qrmp' },
      ],
    },
    penaltyDescription: 'Rs.50/day + 18% interest on unpaid tax. Max Rs.10,000',
    penaltyCalculationRule: { type: 'per_day', amount: 50, max: 10000, interest_rate: 18 },
    filingPortal: 'GSTN',
    requiresDsc: false,
    canFileViaApi: true,
    legalReference: 'Section 39, CGST Act',
  },

  // ============================================================
  // MONTHLY — TDS
  // ============================================================
  {
    obligationCode: 'TDS_DEPOSIT',
    obligationName: 'TDS Deposit',
    category: 'tds',
    frequency: 'monthly',
    baseDueDateRule: { type: 'fixed_day_of_month', day: 7, relative_to: 'next_month', holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'entity_type', op: 'in', value: ['private_limited', 'public_limited', 'llp'] },
      ],
    },
    penaltyDescription: '1.5% per month interest on late deposit',
    penaltyCalculationRule: { type: 'percentage_per_month', rate: 1.5 },
    filingPortal: 'NSDL/Bank',
    requiresDsc: false,
    canFileViaApi: false,
    legalReference: 'Section 200(1), Income Tax Act',
  },

  // ============================================================
  // MONTHLY — PF
  // ============================================================
  {
    obligationCode: 'PF_PAYMENT',
    obligationName: 'PF Contribution Deposit',
    category: 'labour',
    frequency: 'monthly',
    baseDueDateRule: { type: 'fixed_day_of_month', day: 15, relative_to: 'next_month', holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'employee_count', op: 'gte', value: 20 },
        { field: 'pf_registered', op: 'eq', value: true },
      ],
    },
    penaltyDescription: '12% interest + damages up to 100% of arrears',
    penaltyCalculationRule: { type: 'percentage_per_annum', rate: 12, damages_up_to: 100 },
    filingPortal: 'EPFO',
    requiresDsc: false,
    canFileViaApi: false,
    legalReference: 'Section 38, EPF & MP Act 1952',
  },

  // ============================================================
  // MONTHLY — ESI
  // ============================================================
  {
    obligationCode: 'ESI_PAYMENT',
    obligationName: 'ESI Contribution Deposit',
    category: 'labour',
    frequency: 'monthly',
    baseDueDateRule: { type: 'fixed_day_of_month', day: 15, relative_to: 'next_month', holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'employee_count', op: 'gte', value: 10 },
        { field: 'esi_registered', op: 'eq', value: true },
      ],
    },
    penaltyDescription: '12% interest on delayed payments',
    penaltyCalculationRule: { type: 'percentage_per_annum', rate: 12 },
    filingPortal: 'ESIC',
    requiresDsc: false,
    canFileViaApi: false,
    legalReference: 'Section 39, ESI Act 1948',
  },

  // ============================================================
  // QUARTERLY — TDS Returns
  // ============================================================
  {
    obligationCode: 'TDS_24Q',
    obligationName: 'TDS Return - Salary',
    category: 'tds',
    frequency: 'quarterly',
    baseDueDateRule: {
      type: 'fixed_day_of_month', day: 31, relative_to: 'month_after_quarter',
      quarter_end_months: [6, 9, 12, 3],
      exceptions: { q4_due_month: 5, q4_due_day: 31 },
      holiday_rule: 'next_working_day',
    },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'employee_count', op: 'gte', value: 1 },
      ],
    },
    penaltyDescription: 'Rs.200/day late fee. Max: amount of TDS',
    penaltyCalculationRule: { type: 'per_day', amount: 200, max_rule: 'tds_amount' },
    filingPortal: 'TRACES',
    requiresDsc: false,
    canFileViaApi: false,
    legalReference: 'Section 200(3), Income Tax Act',
  },
  {
    obligationCode: 'TDS_26Q',
    obligationName: 'TDS Return - Non-salary',
    category: 'tds',
    frequency: 'quarterly',
    baseDueDateRule: {
      type: 'fixed_day_of_month', day: 31, relative_to: 'month_after_quarter',
      quarter_end_months: [6, 9, 12, 3],
      exceptions: { q4_due_month: 5, q4_due_day: 31 },
      holiday_rule: 'next_working_day',
    },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'entity_type', op: 'in', value: ['private_limited', 'public_limited', 'llp'] },
      ],
    },
    penaltyDescription: 'Rs.200/day late fee. Max: amount of TDS',
    penaltyCalculationRule: { type: 'per_day', amount: 200, max_rule: 'tds_amount' },
    filingPortal: 'TRACES',
    requiresDsc: false,
    canFileViaApi: false,
    legalReference: 'Section 200(3), Income Tax Act',
  },

  // ============================================================
  // QUARTERLY — Advance Tax
  // ============================================================
  {
    obligationCode: 'ADVANCE_TAX',
    obligationName: 'Advance Tax Payment',
    category: 'income_tax',
    frequency: 'quarterly',
    baseDueDateRule: {
      type: 'specific_dates',
      dates: [
        { month: 6, day: 15 },
        { month: 9, day: 15 },
        { month: 12, day: 15 },
        { month: 3, day: 15 },
      ],
      holiday_rule: 'next_working_day',
    },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'entity_type', op: 'in', value: ['private_limited', 'public_limited', 'llp'] },
      ],
    },
    penaltyDescription: 'Interest under Section 234B and 234C',
    penaltyCalculationRule: { type: 'percentage_per_month', rate: 1 },
    filingPortal: 'Income Tax Portal',
    requiresDsc: false,
    canFileViaApi: false,
    legalReference: 'Section 208-211, Income Tax Act',
  },

  // ============================================================
  // ANNUAL — MCA
  // ============================================================
  {
    obligationCode: 'AGM',
    obligationName: 'Annual General Meeting',
    category: 'mca',
    frequency: 'annual',
    baseDueDateRule: { type: 'fixed_date', month: 9, day: 30, holiday_rule: 'none' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'entity_type', op: 'in', value: ['private_limited', 'public_limited'] },
        { field: 'mca_status', op: 'eq', value: 'Active' },
      ],
    },
    penaltyDescription: 'Rs.1,00,000 + Rs.5,000/day on company and every officer',
    penaltyCalculationRule: { type: 'fixed_plus_per_day', fixed: 100000, per_day: 5000 },
    filingPortal: 'Internal',
    requiresDsc: false,
    canFileViaApi: false,
    legalReference: 'Section 96, Companies Act 2013',
  },
  {
    obligationCode: 'AOC4',
    obligationName: 'Financial Statements Filing',
    category: 'mca',
    frequency: 'annual',
    baseDueDateRule: { type: 'relative_to_event', event: 'agm_date', offset_days: 30, holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'entity_type', op: 'in', value: ['private_limited', 'public_limited'] },
        { field: 'mca_status', op: 'eq', value: 'Active' },
      ],
    },
    penaltyDescription: 'Rs.10,000 + Rs.100/day. Max Rs.2,00,000. Director disqualification after 3 years',
    penaltyCalculationRule: { type: 'fixed_plus_per_day', fixed: 10000, per_day: 100, max: 200000 },
    filingPortal: 'MCA V3',
    requiresDsc: true,
    canFileViaApi: false,
    legalReference: 'Section 137, Companies Act 2013',
  },
  {
    obligationCode: 'MGT7',
    obligationName: 'Annual Return',
    category: 'mca',
    frequency: 'annual',
    baseDueDateRule: { type: 'relative_to_event', event: 'agm_date', offset_days: 60, holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'entity_type', op: 'in', value: ['private_limited', 'public_limited'] },
        { field: 'mca_status', op: 'eq', value: 'Active' },
      ],
    },
    penaltyDescription: 'Rs.10,000 + Rs.100/day. Max Rs.2,00,000. Director disqualification after 3 years',
    penaltyCalculationRule: { type: 'fixed_plus_per_day', fixed: 10000, per_day: 100, max: 200000 },
    filingPortal: 'MCA V3',
    requiresDsc: true,
    canFileViaApi: false,
    legalReference: 'Section 92, Companies Act 2013',
  },
  {
    obligationCode: 'DIR3_KYC',
    obligationName: 'Director KYC',
    category: 'mca',
    frequency: 'annual',
    baseDueDateRule: { type: 'fixed_date', month: 9, day: 30, holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'entity_type', op: 'in', value: ['private_limited', 'public_limited'] },
      ],
    },
    penaltyDescription: 'Rs.5,000 penalty. DIN deactivated',
    penaltyCalculationRule: { type: 'fixed', amount: 5000 },
    filingPortal: 'MCA V3',
    requiresDsc: true,
    canFileViaApi: false,
    legalReference: 'Rule 12A, Companies (Appointment and Qualification of Directors) Rules',
  },
  {
    obligationCode: 'ADT1',
    obligationName: 'Auditor Appointment Filing',
    category: 'mca',
    frequency: 'annual',
    baseDueDateRule: { type: 'relative_to_event', event: 'agm_date', offset_days: 15, holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'entity_type', op: 'in', value: ['private_limited', 'public_limited'] },
        { field: 'mca_status', op: 'eq', value: 'Active' },
      ],
    },
    penaltyDescription: 'Rs.300/day additional fee. Max Rs.12,00,000',
    penaltyCalculationRule: { type: 'per_day', amount: 300, max: 1200000 },
    filingPortal: 'MCA V3',
    requiresDsc: true,
    canFileViaApi: false,
    legalReference: 'Section 139, Companies Act 2013',
  },
  {
    obligationCode: 'DPT3',
    obligationName: 'Return of Deposits',
    category: 'mca',
    frequency: 'annual',
    baseDueDateRule: { type: 'fixed_date', month: 6, day: 30, holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'entity_type', op: 'in', value: ['private_limited', 'public_limited'] },
        { field: 'mca_status', op: 'eq', value: 'Active' },
      ],
    },
    penaltyDescription: 'Rs.10,000 + Rs.100/day. Max Rs.25,00,000',
    penaltyCalculationRule: { type: 'fixed_plus_per_day', fixed: 10000, per_day: 100, max: 2500000 },
    filingPortal: 'MCA V3',
    requiresDsc: true,
    canFileViaApi: false,
    legalReference: 'Section 73/76, Companies Act 2013',
  },

  // ============================================================
  // ANNUAL — Income Tax
  // ============================================================
  {
    obligationCode: 'ITR',
    obligationName: 'Income Tax Return',
    category: 'income_tax',
    frequency: 'annual',
    baseDueDateRule: { type: 'fixed_date', month: 10, day: 31, holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'entity_type', op: 'in', value: ['private_limited', 'public_limited', 'llp'] },
      ],
    },
    penaltyDescription: 'Rs.5,000 late fee. Loss carry-forward not allowed',
    penaltyCalculationRule: { type: 'fixed', amount: 5000 },
    filingPortal: 'Income Tax Portal',
    requiresDsc: true,
    canFileViaApi: false,
    legalReference: 'Section 139, Income Tax Act',
  },
  {
    obligationCode: 'TAX_AUDIT',
    obligationName: 'Tax Audit Report',
    category: 'income_tax',
    frequency: 'annual',
    baseDueDateRule: { type: 'fixed_date', month: 9, day: 30, holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'annual_turnover', op: 'gt', value: 10000000 }, // > 1 crore
      ],
    },
    penaltyDescription: '0.5% of turnover or Rs.1,50,000 (whichever is lower)',
    penaltyCalculationRule: { type: 'percentage_or_fixed', percentage: 0.5, max: 150000 },
    filingPortal: 'Income Tax Portal',
    requiresDsc: true,
    canFileViaApi: false,
    legalReference: 'Section 44AB, Income Tax Act',
  },

  // ============================================================
  // ANNUAL — GST
  // ============================================================
  {
    obligationCode: 'GSTR9',
    obligationName: 'GST Annual Return',
    category: 'gst',
    frequency: 'annual',
    baseDueDateRule: { type: 'fixed_date', month: 12, day: 31, holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'gst_registered', op: 'eq', value: true },
        { field: 'annual_turnover', op: 'gt', value: 20000000 }, // > 2 crore
      ],
    },
    penaltyDescription: 'Rs.200/day. Max 0.5% of state turnover',
    penaltyCalculationRule: { type: 'per_day', amount: 200, max_rule: 'half_percent_turnover' },
    filingPortal: 'GSTN',
    requiresDsc: false,
    canFileViaApi: false,
    legalReference: 'Section 44, CGST Act',
  },
  {
    obligationCode: 'GSTR9C',
    obligationName: 'GST Reconciliation Statement',
    category: 'gst',
    frequency: 'annual',
    baseDueDateRule: { type: 'fixed_date', month: 12, day: 31, holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'gst_registered', op: 'eq', value: true },
        { field: 'annual_turnover', op: 'gt', value: 50000000 }, // > 5 crore
      ],
    },
    penaltyDescription: 'Part of GSTR-9 penalty',
    penaltyCalculationRule: { type: 'included_in', parent: 'GSTR9' },
    filingPortal: 'GSTN',
    requiresDsc: false,
    canFileViaApi: false,
    legalReference: 'Section 44, CGST Act',
  },

  // ============================================================
  // ANNUAL — Labour
  // ============================================================
  {
    obligationCode: 'PF_ANNUAL',
    obligationName: 'PF Annual Return',
    category: 'labour',
    frequency: 'annual',
    baseDueDateRule: { type: 'fixed_date', month: 4, day: 25, holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'employee_count', op: 'gte', value: 20 },
        { field: 'pf_registered', op: 'eq', value: true },
      ],
    },
    penaltyDescription: 'Penalties under EPF Act',
    penaltyCalculationRule: { type: 'per_act', act: 'EPF Act' },
    filingPortal: 'EPFO',
    requiresDsc: false,
    canFileViaApi: false,
    legalReference: 'EPF & MP Act 1952',
  },

  // ============================================================
  // PROFESSIONAL TAX (State-specific)
  // ============================================================
  {
    obligationCode: 'PROF_TAX_MH',
    obligationName: 'Professional Tax - Maharashtra',
    category: 'state',
    frequency: 'monthly',
    baseDueDateRule: { type: 'fixed_day_of_month', day: 30, relative_to: 'same_month', holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'operating_states', op: 'contains', value: 'MH' },
        { field: 'employee_count', op: 'gte', value: 1 },
      ],
    },
    penaltyDescription: '10% penalty on outstanding + Rs.5/day for late return',
    penaltyCalculationRule: { type: 'percentage_plus_per_day', percentage: 10, per_day: 5 },
    filingPortal: 'Maharashtra PT Portal',
    requiresDsc: false,
    canFileViaApi: false,
    legalReference: 'Maharashtra State Tax on Professions Act',
  },
  {
    obligationCode: 'PROF_TAX_KA',
    obligationName: 'Professional Tax - Karnataka',
    category: 'state',
    frequency: 'monthly',
    baseDueDateRule: { type: 'fixed_day_of_month', day: 20, relative_to: 'next_month', holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'operating_states', op: 'contains', value: 'KA' },
        { field: 'employee_count', op: 'gte', value: 1 },
      ],
    },
    penaltyDescription: '1.25% interest per month on delayed payment',
    penaltyCalculationRule: { type: 'percentage_per_month', rate: 1.25 },
    filingPortal: 'Karnataka PT Portal',
    requiresDsc: false,
    canFileViaApi: false,
    legalReference: 'Karnataka Tax on Professions Act',
  },
  {
    obligationCode: 'PROF_TAX_TN',
    obligationName: 'Professional Tax - Tamil Nadu',
    category: 'state',
    frequency: 'half_yearly',
    baseDueDateRule: {
      type: 'specific_dates',
      dates: [{ month: 9, day: 30 }, { month: 3, day: 31 }],
      holiday_rule: 'next_working_day',
    },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'operating_states', op: 'contains', value: 'TN' },
        { field: 'employee_count', op: 'gte', value: 1 },
      ],
    },
    penaltyDescription: 'Penalty as per Tamil Nadu rules',
    penaltyCalculationRule: { type: 'per_state_rules' },
    filingPortal: 'Tamil Nadu PT Portal',
    requiresDsc: false,
    canFileViaApi: false,
    legalReference: 'Tamil Nadu Tax on Professions Act',
  },
  {
    obligationCode: 'PROF_TAX_TG',
    obligationName: 'Professional Tax - Telangana',
    category: 'state',
    frequency: 'monthly',
    baseDueDateRule: { type: 'fixed_day_of_month', day: 10, relative_to: 'next_month', holiday_rule: 'next_working_day' },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'operating_states', op: 'contains', value: 'TG' },
        { field: 'employee_count', op: 'gte', value: 1 },
      ],
    },
    penaltyDescription: 'Penalty as per Telangana rules',
    penaltyCalculationRule: { type: 'per_state_rules' },
    filingPortal: 'Telangana PT Portal',
    requiresDsc: false,
    canFileViaApi: false,
    legalReference: 'Telangana Tax on Professions Act',
  },

  // ============================================================
  // HALF-YEARLY — MSME
  // ============================================================
  {
    obligationCode: 'MSME1',
    obligationName: 'MSME Outstanding Payments Return',
    category: 'mca',
    frequency: 'half_yearly',
    baseDueDateRule: {
      type: 'specific_dates',
      dates: [{ month: 4, day: 30 }, { month: 10, day: 31 }],
      holiday_rule: 'next_working_day',
    },
    applicableConditions: {
      operator: 'AND',
      conditions: [
        { field: 'entity_type', op: 'in', value: ['private_limited', 'public_limited'] },
        { field: 'mca_status', op: 'eq', value: 'Active' },
      ],
    },
    penaltyDescription: 'Penalties under MSMED Act',
    penaltyCalculationRule: { type: 'per_act', act: 'MSMED Act' },
    filingPortal: 'MCA V3',
    requiresDsc: true,
    canFileViaApi: false,
    legalReference: 'Section 405, Companies Act 2013',
  },
]
