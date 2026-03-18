# AUTMN — Master Development Document

> Compiled March 2026. This is the single source of truth for the AUTMN project. All corrections from research (Finance Act 2024, additional obligations, expanded state coverage) have been applied inline.

---

## Part 1: Product Vision

### What AUTMN Is

AUTMN is a Compliance Intelligence Platform for Indian startups. It tells Indian company founders exactly what compliance obligations they have, when each is due, what happens if they miss them, and prepares everything needed for filing. The founder enters their company's CIN (Corporate Identification Number), the system auto-fetches their company data, figures out every legal obligation applicable to their specific company, and generates a personalized compliance calendar. When connected to their accounting software, it computes tax liabilities and prepares return data automatically. No product like this exists in India today.

### The Problem It Solves

Every registered company in India has legal obligations to multiple government authorities — MCA, GST, Income Tax, PF, ESI, state authorities. Missing deadlines means real financial penalties, director disqualification, or company dissolution. Existing tools either handle one specific filing type (ClearTax does GST only), or are human-powered services with a tech layer (VakilSearch, IndiaFilings). Nobody offers a unified, AI-powered intelligence layer that covers ALL compliance obligations personalized to a specific company.

### Target Users

Indian Private Limited Companies, LLPs, and DPIIT-recognized startups. Primary focus: Private Limited Companies because they have the highest compliance burden and are the most common structure for funded startups.

### What Makes It Life-Changing for Founders

- **One CIN, full picture**: Enter your CIN and immediately see every obligation that applies to your specific company
- **Never miss a deadline**: Personalized compliance calendar with email alerts at 7, 3, 1, and 0 days before each deadline
- **Know the cost of inaction**: Real-time penalty calculations for overdue items
- **Auto-compute taxes**: Connect accounting software and get GST/TDS/PF/ESI computations verified by dual AI + rules engine
- **File directly**: GSTR-1 and GSTR-3B filing via GSP API with OTP verification
- **Investor-ready compliance report**: Shareable PDF health score report

### Free Tier vs Paid Tiers

**Free tier (Critical Path: Phases 1-9):**
- Sign up, enter CIN, AI profiling, see all obligations, compliance calendar, dashboard, email alerts
- This is already more valuable than anything else in the Indian market

**Paid tiers (Phases 10+):**
- **Starter**: Zoho Books integration, tax computations, return preparation
- **Growth**: GST auto-filing via GSP, ITC reconciliation, compliance health score, regulatory intelligence, team/CA access

---

## Part 2: Design System

### Color Palette

AUTMN uses a monochrome foundation (black + white) with Deep Blue as the single primary accent, inspired by the design systems of Linear, Vercel, and Vanta. Blue was chosen because 42% of users associate blue with reliability and trust — critical for a compliance/financial product.

#### Primary Colors

| Token | Hex | Usage |
|-------|-----|-------|
| Primary Blue | `#2563EB` | Primary actions, interactive elements, links |
| Primary Blue Hover | `#1D4ED8` | Hover state for primary elements |
| Primary Blue Light | `#EFF6FF` | Blue tint backgrounds, selected states |

#### Semantic Status Colors

| Token | Hex | Usage |
|-------|-----|-------|
| Success Green | `#10B981` | Compliant, filed, passing |
| Success Light | `#ECFDF5` | Green tint background |
| Warning Amber | `#F59E0B` | Needs attention, upcoming deadline |
| Warning Light | `#FFFBEB` | Amber tint background |
| Error Red | `#EF4444` | Overdue, failing, critical |
| Error Light | `#FEF2F2` | Red tint background |
| Info Indigo | `#6366F1` | Informational indicators |
| Info Light | `#EEF2FF` | Indigo tint background |

#### Neutral Scale (Light Mode)

| Token | Hex | Usage |
|-------|-----|-------|
| Background Primary | `#FFFFFF` | Main background |
| Background Secondary | `#F9FAFB` | Card/section background |
| Background Tertiary | `#F3F4F6` | Hover/selected states |
| Border Default | `#E5E7EB` | Default borders |
| Border Strong | `#D1D5DB` | Emphasized borders |
| Text Primary | `#111827` | Primary text |
| Text Secondary | `#6B7280` | Secondary text |
| Text Tertiary | `#9CA3AF` | Muted text |

#### Dark Mode

| Token | Hex | Usage |
|-------|-----|-------|
| Background Primary | `#0F172A` | Main dark background |
| Background Secondary | `#1E293B` | Card background |
| Background Tertiary | `#334155` | Hover state |
| Border Dark | `#334155` | Borders |
| Text Primary | `#F1F5F9` | Primary text |
| Text Secondary | `#94A3B8` | Secondary text |

### Typography

**Primary font: Inter** — the most widely used font in compliance/fintech SaaS (used by Vanta, Sprinto, and recommended across the industry). Weights 300-700.

**Monospace font: Geist Mono** — for code, IDs, CIN numbers, GSTIN, technical data. Tabular numbers for data alignment. Distinct character shapes to prevent glyph confusion (l, 1, I).

#### Type Scale

```css
--text-xs:   0.75rem;   /* 12px — metadata, timestamps */
--text-sm:   0.875rem;  /* 14px — secondary text, labels */
--text-base: 1rem;      /* 16px — body text */
--text-lg:   1.125rem;  /* 18px — subheadings */
--text-xl:   1.25rem;   /* 20px — section titles */
--text-2xl:  1.5rem;    /* 24px — page titles */
--text-3xl:  1.875rem;  /* 30px — hero metrics/KPIs */
--text-4xl:  2.25rem;   /* 36px — large dashboard numbers */
```

#### Font Weights

```css
--font-normal:   400;  /* Body text */
--font-medium:   500;  /* Labels, navigation */
--font-semibold: 600;  /* Subheadings, emphasis */
--font-bold:     700;  /* Headings, KPI numbers */
```

### Spacing System (4px Base)

Inspired by Vercel's Geist design system:

```css
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

#### Border Radius

```css
--radius-sm:   4px;
--radius-md:   6px;
--radius-lg:   8px;
--radius-xl:   12px;
--radius-2xl:  16px;
--radius-full: 9999px;
```

### Component Patterns

#### Status Indicators (Traffic Light System)

| State | Color | Icon | Label |
|-------|-------|------|-------|
| Compliant/Filed | Green `#10B981` | Checkmark | "Filed" / "Compliant" |
| Upcoming | Amber `#F59E0B` | Clock | "Due in X days" |
| Overdue | Red `#EF4444` | X mark | "Overdue" / "X days late" |
| Not Started | Gray `#9CA3AF` | Dash | "Not started" |
| In Progress | Blue `#2563EB` | Spinner | "In progress" |

Always pair color with text label for accessibility.

#### Cards

- White background with subtle border (`#E5E7EB`)
- Status indicator (colored dot or icon) in top-right
- Item name (semibold) + category badge
- Last updated timestamp
- Consistent semantic structure across all card types

#### Compliance Progress Ring (Vanta pattern)

- Circular SVG stroke indicator
- Primary blue (`#2563EB`) for progress, neutral gray (`#D1D5DB`) for track
- Centered percentage label (semibold, 1.5rem)
- 7rem diameter for dashboard, 3rem for inline

#### Badges

- Category badges: MCA (blue), GST (green), TDS (purple), PF/ESI (orange), State (gray)
- Status badges: Filed (green), Upcoming (amber), Overdue (red), Pending (gray)
- Pill shape with `--radius-full`

### Design Principles

1. **Restraint**: Use fewer colors, fewer fonts, fewer decorative elements. The rainbow dashboard has retired.
2. **Structure should be felt, not seen**: Clarity through subtlety. Navigation recedes while task-critical content stays in focus (Linear principle).
3. **Content-first**: UI serves the content. Every pixel has purpose. Zero decoration, pure function (Vercel principle).
4. **Semantic color**: Colors always mean something. Green = good, red = bad, amber = attention needed. Never decorative.
5. **Performance IS design**: No amount of beautiful animations compensates for slow load times (Vercel principle).
6. **Progressive disclosure**: Hide advanced features behind toggles. Not everything must be visible at all times.
7. **Consistency**: Same buttons, cards, inputs everywhere. Uniform across all screens.
8. **Accessibility**: WCAG 2.0 contrast compliance. All status colors paired with text labels.

### Navigation Structure

#### Left Sidebar (Fixed, 240-280px)

```
[AUTMN Logo]

Dashboard
Calendar
Filings
Taxes
  - GST
  - TDS
  - Advance Tax
  - PF/ESI
Health Score
Regulatory Updates

[spacer]

Settings
  - Profile
  - Company
  - Team
  - Integrations
  - Notifications
  - Billing
```

- Collapsible to icon-only mode (48-64px)
- Active item highlighted with primary blue background tint
- Sidebar is intentionally dimmer than main content area
- Nested sub-navigation for Taxes and Settings sections

---

## Part 3: User Flow

### Complete Screen-by-Screen Walkthrough

#### 1. Sign Up (`/auth/signup`)
- Email + password form (Google OAuth added later)
- Zero friction — no company data at signup
- After signup, redirect to onboarding

#### 2. Login (`/auth/login`)
- Email + password
- "Forgot password" link
- Redirect to `/dashboard` if company exists, `/onboarding/cin` if not

#### 3. CIN Entry (`/onboarding/cin`)
- Single input field for 21-character CIN
- Real-time format validation (regex + checksum)
- "Look up my company" button
- Loading state while MCA API fetches
- Company card displayed: name, type, incorporation date, registered address, directors, capital
- "Yes, this is my company" confirmation button
- Manual entry fallback if API is down or CIN not found

#### 4. AI Conversation (`/onboarding/profile`)
- Chat interface with Gemini streaming responses
- AI asks 6-8 focused questions to fill profile gaps:
  - Employee count
  - Annual turnover bracket
  - Operating states
  - GST registration status and scheme
  - DPIIT recognition
  - Foreign investment (triggers Press Note 3 flag if from border-sharing country)
  - PF/ESI registration status
  - MSME vendors
- Adaptive flow — skips irrelevant questions based on prior answers (turnover < 20L skips GST questions)
- Ends with: "We found 27 obligations applicable to your company"
- Fallback: structured form with dropdowns/inputs if AI is unavailable

#### 5. Calendar Preview (`/onboarding/calendar-preview`)
- Generated compliance calendar for current quarter
- Overdue items highlighted in red with penalty calculations
- "Go to Dashboard" CTA

#### 6. Dashboard (`/dashboard`)
- **Urgency panel**: Next 3-5 upcoming deadlines as cards (obligation name, due date, days remaining, status, quick action)
- **Overdue section**: Past-due items with accrued penalty amounts
- **This month timeline**: All obligations due this month with status indicators
- **Health score widget**: Circular gauge 0-100 with category breakdown bars
- **Recent activity feed**: Last 5 actions (filings, syncs, profile updates)
- **Alerts panel**: Regulatory changes + threshold warnings (e.g., "Turnover approaching Rs.40L — GST registration required")
- **Empty state**: "You're all caught up" message when nothing is overdue

#### 7. Calendar (`/calendar`)
- **List view**: Sorted by date, color-coded status chips (green=filed, amber=upcoming, red=overdue, gray=future)
- **Month grid view**: Day cells with obligation chips
- **Quarter view**: 3-month condensed overview
- **Year view**: 12-month heatmap style
- **Filters**: By category (MCA/GST/TDS/PF/State), by status
- **Click any item**: Slide-over panel with full details — obligation name, form number, portal, due date, penalty if missed, action buttons
- **iCal export**: Download .ics file or subscribe via URL for Google Calendar/Outlook

#### 8. Taxes — GST (`/taxes/gst`)
- GST liability breakdown: output tax, ITC, net payable
- CGST/SGST/IGST split
- "Verified" badge (dual verification passed) or "Needs Review" (discrepancy found)
- "How was this computed?" expandable section showing calculation steps
- Period selector

#### 9. Taxes — TDS (`/taxes/tds`)
- TDS deductions by section (192, 194A, 194C, 194H, 194I, 194J, etc.)
- Amount, rate, deductee details
- Verified against rules engine

#### 10. Taxes — Advance Tax (`/taxes/advance-tax`)
- Quarterly projected liability
- Cumulative percentages: 15% by Jun 15, 45% by Sep 15, 75% by Dec 15, 100% by Mar 15
- Paid vs due amounts

#### 11. Taxes — PF/ESI (`/taxes/pf-esi`)
- Employee-wise PF contributions (employer + employee split)
- ESI contributions
- Monthly totals

#### 12. Filings (`/filings`)
- Table: obligation, period, due date, status, action
- Status flow: Not started -> Data synced -> Computed -> Prepared -> Under review -> Filed
- Click for detail page

#### 13. Filing Detail (`/filings/[filingId]`)
- Prepared return data at invoice level
- Summary totals
- Searchable table
- Pre-filing QC flags (duplicate invoices, rate mismatches, missing HSN)
- For GST: "File via API" button (triggers OTP flow)
- For TDS/MCA: "Download for manual filing" button (exports in portal format)

#### 14. Filing Review (`/filings/[filingId]/review`)
- Review screen with all data
- Checkbox confirmation
- OTP entry (for GST filing via GSP)
- File button
- Success: ARN displayed

#### 15. Health Score (`/health`)
- Score gauge 0-100
- Category breakdown: MCA (25), GST (25), IT&TDS (20), PF-ESI (15), Corporate (15)
- Issues list with severity and "Fix This" links
- Score history trend chart (last 12 months)
- AI-generated narrative: "Your company has a score of 78/100. Two issues need attention..."

#### 16. Health Report (`/health/report`)
- Investor-ready PDF report (branded, shareable)
- Download as PDF via @react-pdf/renderer

#### 17. Regulatory Updates (`/regulatory`)
- Latest MCA/GST/Tax notifications in plain English
- Notifications affecting your company highlighted
- AI-generated summaries + action items
- Calendar auto-updated when deadlines change

#### 18. Settings Pages
- `/settings/profile` — Edit name, change password
- `/settings/company` — Edit company details, re-run obligation mapping
- `/settings/team` — Invite CA, team members, manage roles
- `/settings/integrations` — Connect/disconnect Zoho Books, sync status, manual sync button
- `/settings/notifications` — Toggle email notifications on/off, frequency preferences
- `/settings/billing` — Subscribe to plans, manage payment (Stripe)

### Page Map (Every URL)

```
/                                           Landing page (marketing)
/auth/login                                 Login
/auth/signup                                Sign up
/onboarding/cin                             CIN entry + company lookup
/onboarding/profile                         AI conversation
/onboarding/calendar-preview                Calendar preview

/dashboard                                  Main dashboard
/calendar                                   Compliance calendar (all views)
/filings                                    All filings list
/filings/[filingId]                         Filing detail + prepared data
/filings/[filingId]/review                  Filing review + submit

/taxes/gst                                  GST computation
/taxes/gst/[period]/reconciliation          ITC reconciliation
/taxes/tds                                  TDS computation
/taxes/advance-tax                          Advance tax estimation
/taxes/pf-esi                               PF/ESI computation

/health                                     Health score dashboard
/health/report                              PDF report generation

/regulatory                                 Regulatory updates feed

/settings/profile                           User profile
/settings/company                           Company profile
/settings/team                              Team management
/settings/integrations                      API integrations
/settings/notifications                     Notification preferences
/settings/billing                           Subscription management
```

---

## Part 4: Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | **Next.js 15** (App Router), React, TypeScript, Tailwind CSS | App Router is the current standard. Server Components reduce client JS. TypeScript for type safety on financial data. |
| UI Components | **shadcn/ui** | Unstyled, accessible components built on Radix UI. Full control over styling. Used by most modern Next.js apps. |
| Backend | **Next.js API Routes** + standalone Bull worker process | API routes for request/response. Standalone worker for background jobs (cron, sync, scraping). |
| Database | **PostgreSQL** (via **Prisma** ORM) | Relational DB for financial/compliance data with strong ACID guarantees. Prisma for type-safe queries. |
| Cache/Queue | **Redis** (Bull queues + caching + sessions) | Bull for reliable background job processing. Redis for caching frequently accessed data. |
| AI | **Google Gemini API** (2.5 Flash default, 3 Flash for complex analysis) | Gemini 2.5 Flash: $0.15/$2.50 per M tokens for 80% of work. Function calling and structured output supported. Context caching for tax rules (90% savings). |
| Auth | **Auth.js (NextAuth v5)** — Email/password initially, Google OAuth later | JWT sessions for Edge middleware compatibility. PrismaAdapter for user storage. |
| File Storage | **S3-compatible** (AWS S3 or Cloudflare R2) | For PDF reports, exported filing data, uploaded documents. |
| Email | **Resend** or AWS SES | Transactional emails for deadline reminders, daily digests. |
| Logging | **Pino** (structured JSON logs) | Fast structured logging for production debugging. |
| PDF Generation | **@react-pdf/renderer** | React-based PDF generation for compliance health reports. |
| Local Dev | **Docker Compose** (PostgreSQL + Redis containers) | Consistent local environment. `docker compose up` starts both services. |

### Confirmed Architecture Decisions

1. **Next.js App Router** (not Pages Router) — Server Components by default, `"use client"` only when needed
2. **Server Actions** for form submissions and data mutations — used by 63%+ of Next.js developers as of 2025
3. **API Route Handlers** for webhooks, external API consumption, streaming responses, mobile app endpoints
4. **Prisma singleton pattern** to prevent connection pool exhaustion during dev hot reload
5. **Docker Compose** for local PostgreSQL + Redis — no cloud dependencies for development
6. **SSE (Server-Sent Events)** for real-time updates (AI chat streaming, filing status, sync progress) — all unidirectional server-to-client
7. **Mobile app planned for later** — API-first design ensures all endpoints are consumable by a future mobile client

---

## Part 5: System Architecture

### Folder Structure (Complete)

```
src/
  app/
    (marketing)/                        # Landing page route group
      page.tsx                          # Marketing landing page
      layout.tsx
    (auth)/                             # Auth route group (no sidebar)
      login/page.tsx
      signup/page.tsx
      layout.tsx
    (onboarding)/                       # Onboarding route group
      cin/page.tsx
      profile/page.tsx
      calendar-preview/page.tsx
      layout.tsx
    (app)/                              # Main app route group (with sidebar)
      dashboard/page.tsx
      calendar/page.tsx
      filings/
        page.tsx
        [filingId]/
          page.tsx
          review/page.tsx
      taxes/
        gst/page.tsx
        gst/[period]/reconciliation/page.tsx
        tds/page.tsx
        advance-tax/page.tsx
        pf-esi/page.tsx
      health/
        page.tsx
        report/page.tsx
      regulatory/page.tsx
      settings/
        profile/page.tsx
        company/page.tsx
        team/page.tsx
        integrations/page.tsx
        notifications/page.tsx
        billing/page.tsx
      layout.tsx                        # Dashboard layout with sidebar
    api/
      auth/[...nextauth]/route.ts
      webhooks/route.ts
      companies/route.ts
      filings/[id]/file/route.ts
      ...
    layout.tsx                          # Root layout
    globals.css

  components/
    ui/                                 # shadcn/ui primitives (Button, Card, Input, etc.)
    layout/                             # Header, Sidebar, Footer
    dashboard/                          # Dashboard-specific components
    calendar/                           # Calendar views, obligation chips
    filings/                            # Filing list, detail, review components
    taxes/                              # Tax computation display components
    health/                             # Health score gauge, breakdown, report
    onboarding/                         # CIN input, chat UI, profile form
    regulatory/                         # Regulatory feed components
    common/                             # Shared components (StatusBadge, ProgressRing, etc.)

  lib/
    db/
      prisma.ts                         # Prisma client singleton
    auth/
      auth-options.ts                   # Auth.js configuration
      auth.config.ts                    # Edge-compatible auth config
      permissions.ts                    # RBAC permission checks
    services/
      company/                          # Company CRUD, MCA API integration
      calendar/                         # Calendar generation, due date calculation
      filings/                          # Filing preparation, GSP integration
      taxes/                            # Tax computation orchestration
      integrations/
        zoho/                           # Zoho Books OAuth, sync, data mapping
      health/                           # Health score computation
      regulatory/                       # Scraping, AI analysis
      notifications/                    # Email, in-app notifications
    ai/
      gemini-client.ts                  # Gemini API wrapper with retry/error handling
      prompts/                          # All prompt templates
      structured-output.ts              # Zod schemas for AI output validation
      context-cache.ts                  # Gemini context caching for tax rules
    jobs/
      worker.ts                         # Bull worker entry point
      queues.ts                         # Queue definitions
      processors/                       # Job processors (deadline-check, sync, scrape, etc.)
    rules/
      gst-rates.ts                      # GST rate lookup by HSN/SAC
      tds-rates.ts                      # TDS rate lookup by section
      pf-esi-rates.ts                   # PF/ESI contribution rates
      professional-tax.ts              # State-wise PT slabs
      penalty-rules.ts                  # Penalty calculation engine
      obligation-conditions.ts          # Condition evaluator
    utils/
      date.ts                           # Date helpers, FY calculations
      currency.ts                       # Currency formatting, decimal precision
      cin-validator.ts                  # CIN format + checksum validation
      gstin-validator.ts                # GSTIN validation
      encryption.ts                     # AES-256-GCM for OAuth token encryption
    types/
      company.ts                        # Company, Director types
      compliance.ts                     # Obligation, CompanyObligation types
      filing.ts                         # FilingInstance, prepared data types
      tax.ts                            # Tax computation types

  hooks/
    useCompany.ts
    useCalendar.ts
    useFilings.ts
    useSSE.ts                           # Server-Sent Events hook

  config/
    feature-flags.ts                    # Feature flag definitions

prisma/
  schema.prisma                         # Database schema
  seed.ts                               # Main seed orchestrator
  seeds/
    obligations/                        # Obligation seed data by category
      mca-obligations.ts
      gst-obligations.ts
      tds-obligations.ts
      pf-esi-obligations.ts
      state-obligations.ts
    tax-rules/                          # Tax rate seed data
      gst-rates.ts
      tds-rates.ts
      pf-esi-rates.ts
      professional-tax.ts
    test-companies/                     # Dev/staging only
      sample-companies.ts

workers/
  index.ts                              # Standalone Bull worker process

docker-compose.yml                      # PostgreSQL + Redis containers
middleware.ts                           # Next.js auth middleware
```

### API Route Design

#### Authentication
```
POST   /api/auth/[...nextauth]          # Auth.js handlers (login, signup, callbacks)
```

#### Companies
```
POST   /api/companies                   # Create company (from CIN lookup or manual)
GET    /api/companies/:id               # Get company details
PUT    /api/companies/:id               # Update company profile
POST   /api/companies/:id/obligations   # Trigger obligation mapping
POST   /api/companies/:id/calendar      # Regenerate calendar
```

#### Calendar & Filings
```
GET    /api/calendar                     # Get calendar events (with filters)
GET    /api/filings                      # List all filings
GET    /api/filings/:id                  # Filing detail with prepared data
POST   /api/filings/:id/prepare         # Trigger return preparation
POST   /api/filings/:id/file            # Submit filing (GSP flow)
POST   /api/filings/:id/download        # Download filing data in portal format
```

#### Tax Computations
```
GET    /api/taxes/gst/:period           # GST computation for period
GET    /api/taxes/tds/:period           # TDS computation for period
GET    /api/taxes/advance-tax           # Advance tax estimation
GET    /api/taxes/pf-esi/:period        # PF/ESI computation for period
POST   /api/taxes/compute               # Trigger computation (after Zoho sync)
```

#### Integrations
```
GET    /api/integrations/zoho/connect   # Initiate Zoho OAuth
GET    /api/integrations/zoho/callback  # OAuth callback
POST   /api/integrations/zoho/sync      # Trigger manual sync
GET    /api/integrations/zoho/status    # Sync status
```

#### Health Score
```
GET    /api/health                       # Current health score
GET    /api/health/history               # Score history
GET    /api/health/report                # Generate PDF report
```

#### Notifications & Settings
```
GET    /api/notifications                # List notifications
PUT    /api/notifications/:id/read       # Mark as read
GET    /api/regulatory                   # Regulatory updates feed
PUT    /api/settings/notifications       # Update notification preferences
POST   /api/settings/team/invite         # Invite team member
```

#### Webhooks
```
POST   /api/webhooks/zoho               # Zoho webhook for data changes
POST   /api/webhooks/stripe             # Stripe subscription webhooks
```

### Prisma Schema (All Models)

**Core models:**

- **User**: id, email, name, passwordHash, role (founder/ca/team_member), companyId, createdAt
- **Session**: Auth.js session management
- **Account**: Auth.js OAuth account linking
- **Company**: id, cin, companyName, entityType, dateOfIncorporation, registeredState, registeredAddress, authorizedCapital, paidUpCapital, industrySector, gstNumber, panNumber, tanNumber, employeeCount, operatingStates (JSONB), annualTurnover, hasForeinvestment, dpiitRecognized, mcaStatus, gstRegistered, gstScheme, gstFilingFrequency, pfRegistered, esiRegistered, businessType, hasMsmeVendors, hasDeposits, createdAt, updatedAt
- **Director**: id, companyId (FK), din, name, designation, dateOfAppointment, dir3KycStatus, dir3KycDueDate, dinStatus
- **ComplianceObligation**: id, obligationCode (unique), obligationName, category, authority, frequency, periodType, dueDateRule (JSONB), applicabilityConditions (JSONB), penaltyRule (JSONB), penaltyDescription, filingPortal, requiresDsc, canFileViaApi, dataSourcesNeeded (JSONB), formNumber, legalReference, version, effectiveFrom, effectiveUntil
- **CompanyObligation**: id, companyId (FK), obligationId (FK), isActive, activatedDate, deactivatedDate, notes — UNIQUE(companyId, obligationId)
- **FilingInstance**: id, companyId (FK), obligationId (FK), period, dueDate, status (upcoming/due/overdue/prepared/filed), preparedData (JSONB), filedDate, acknowledgmentNumber, penaltyAccrued, filedBy, notes, createdAt, updatedAt
- **FinancialData**: id, companyId (FK), source, dataType, referenceNumber, date, amount, taxAmount, gstRate, hsnSacCode, counterpartyGstin, counterpartyName, placeOfSupply, isReverseCharge, rawData (JSONB), syncedAt
- **IntegrationToken**: id, companyId (FK), provider, accessToken (encrypted AES-256-GCM), refreshToken (encrypted), tokenExpiry, scopes, createdAt, updatedAt
- **RegulatoryUpdate**: id, sourceAuthority, notificationNumber, notificationDate, sourceUrl, rawText, aiSummary, affectedEntityTypes (JSONB), affectedObligationCodes (JSONB), actionRequired, effectiveDate, processedAt
- **ComplianceScore**: id, companyId (FK), score (0-100), breakdown (JSONB), issues (JSONB), recommendations (JSONB), computedAt
- **Notification**: id, userId (FK), companyId (FK), type, title, body, readAt, createdAt
- **AuditLog**: id, companyId (FK), userId (FK), action, resource, resourceId, details (JSONB), ipAddress, createdAt — append-only, 7-year retention
- **AIUsage**: id, companyId (FK), model, promptTokens, completionTokens, cost, purpose, createdAt

**Key design decisions:**
- Multi-tenant via `companyId` on every table + Row Level Security
- `companyId` always derived from session, never from client request
- Composite indexes on `(companyId, createdAt)` and `(companyId, status)`
- Financial data partitioned by year at scale
- `effectiveFrom` and `effectiveUntil` on obligation rules for versioning

### AI Integration Architecture

#### When AI Is Called

| Trigger | AI Model | Purpose |
|---------|----------|---------|
| Onboarding chat | Gemini 2.5 Flash | Ask profiling questions, interpret answers |
| Tax computation | Gemini 2.5 Flash | Compute GST/TDS from financial data |
| Complex analysis | Gemini 3 Flash | ITC reconciliation, edge cases |
| Pre-filing QC | Gemini 2.5 Flash | Flag errors in prepared returns |
| Regulatory interpretation | Gemini 3 Flash | Parse government notifications |
| Health score narrative | Gemini 2.5 Flash | Generate plain-English summary |

#### Prompt Structure

All AI calls follow this pattern:
1. **System prompt**: Tax rules context (cached via Gemini context caching API for 90% savings)
2. **User context**: Company profile, financial data relevant to the computation
3. **Task instruction**: Specific computation or analysis to perform
4. **Output schema**: Zod schema enforced via Gemini structured output mode

#### Dual Verification

Every tax computation goes through:
1. AI computes using Gemini with context + reasoning
2. Rules engine independently computes using hardcoded formulas
3. Comparison:
   - Match within 1%: Use AI result, badge "Verified"
   - Differ 1-5%: Flag for review, show both values
   - Differ >5%: Use rules engine result, log discrepancy
4. **Rules engine always wins** on deterministic values (tax rates, due dates, penalties)

#### AI Failure Handling

- AI unavailable: Falls back to rules engine only. User sees rules engine result with note "AI verification unavailable"
- AI returns malformed output: Validate against Zod schema. Retry once. If still malformed, fall back to rules engine.
- All AI outputs logged for audit trail

### Background Jobs (Bull Queues)

#### Cron-Scheduled Jobs

| Job | Schedule | What It Does |
|-----|----------|-------------|
| Deadline check | Daily 6 AM IST | Checks all companies, creates notifications for items due in 7/3/1/0 days |
| Daily email digest | Daily 9 AM IST | Sends summary of today's obligations + overdue items |
| Zoho sync | Every 6 hours | Pulls latest financial data from connected Zoho Books accounts |
| Regulatory scrape | Daily 7 AM IST | Scrapes MCA, CBIC, CBDT notification pages |
| Health score recompute | Weekly Monday 2 AM | Recomputes compliance scores for all companies |

#### Event-Driven Jobs

| Trigger | Job |
|---------|-----|
| Zoho sync complete | Trigger tax computation |
| Company profile updated | Regenerate obligation mapping + calendar |
| Tax computation complete | Recompute health score |
| Regulatory update detected | Update affected filing instance deadlines |
| Filing submitted | Notify user, recompute health score |

### Real-Time (SSE)

Server-Sent Events for:
- AI chat streaming (onboarding conversation)
- Filing status updates (submitted -> processing -> filed)
- Sync progress (Zoho data sync)
- Computation progress (tax computation)

All unidirectional server-to-client. No WebSocket complexity needed.

### Caching Strategy (Redis)

| Data | TTL | Invalidation |
|------|-----|-------------|
| Company profile | 1 hour | On profile update |
| Obligation mappings | 24 hours | On profile change or regulatory update |
| Calendar events | 1 hour | On filing status change or calendar regeneration |
| Tax computations | Until next sync | On Zoho sync completion |
| Health score | 24 hours | On filing status change |
| Tax rules context | Gemini cache API | On rule data update |

### Security

- **Encryption**: OAuth tokens encrypted at rest (AES-256-GCM). TLS 1.3 in transit.
- **RBAC**: Three roles:
  - Founder/Admin: Full access — view, edit, file, manage team, billing
  - CA/Advisor: View all data, prepare and file returns, cannot change settings or billing
  - Team Member: View only — cannot file or change anything
- **Audit logging**: Every significant action logged to AuditLog table. Append-only. 7-year retention per Indian regulatory requirements.
- **Data retention**: Financial data 8 years, audit logs 7 years, notifications 90 days.
- **Sensitive data**: GST credentials, OAuth tokens, OTP values never logged, never included in error reports.
- **Multi-tenant isolation**: `companyId` always derived from authenticated session. Row-level security enforced at query level.
- **Middleware auth**: Protected routes checked in Next.js middleware. But never rely solely on middleware — always verify at data access layer too.

### Error Handling and Resilience

**Graceful degradation hierarchy:**
```
Full: AI + Rules Engine + Live sync + Auto-filing
  -> (AI down): Rules Engine only + Live sync + Auto-filing
  -> (APIs down): Rules Engine + Manual entry + Prepared returns for manual filing
  -> (DB issues): Cached dashboard + notifications
```

**Specific failure modes:**
- Government APIs down: Retry with exponential backoff, fallback to manual entry/prepared data
- AI wrong: Rules engine catches it, user sees rules engine result
- Zoho token revoked: Detect 401, notify user to reconnect via in-app notification
- AI outputs malformed: Validate against Zod schemas. Retry once, then fallback to rules engine.
- GSP filing fails: Show error to user, retain prepared data, allow retry

---

## Part 6: Compliance Data Model

### Core Principle: Obligations as Data

Every compliance obligation is a row in a database table, not a function in code. The system can add a new obligation (e.g., a new MCA form) by inserting a row, not by writing and deploying code.

Three things are encoded as structured JSON per obligation:

| What | Purpose | Example |
|------|---------|---------|
| `due_date_rule` | Tells calendar generator when something is due | "11th of next month" |
| `applicability_conditions` | Tells obligation mapper which companies this applies to | "entity_type = private_limited AND gst_registered = true" |
| `penalty_rule` | Tells penalty calculator how to compute penalties | "Rs.50/day, max Rs.10,000" |

### Due Date Rule DSL

Every obligation has a `due_date_rule` JSON object that the calendar generator interprets. Five types:

#### Type 1: Fixed Day of Month (relative to period)

```json
{
  "type": "fixed_day_of_month",
  "day": 11,
  "relative_to": "next_month",
  "holiday_rule": "next_working_day"
}
```

`relative_to` values: `"same_month"` | `"next_month"` | `"month_after_quarter"`

#### Type 2: Fixed Date in Year

```json
{
  "type": "fixed_date",
  "month": 9,
  "day": 30,
  "holiday_rule": "next_working_day"
}
```

#### Type 3: Relative to Event

```json
{
  "type": "relative_to_event",
  "event": "agm_date",
  "offset_days": 30,
  "prerequisite": {
    "event": "agm_date",
    "must_happen_by": { "month": 9, "day": 30 }
  },
  "holiday_rule": "next_working_day"
}
```

#### Type 4: Specific Dates in Year

```json
{
  "type": "specific_dates",
  "dates": [
    { "month": 6, "day": 15, "cumulative_percentage": 15 },
    { "month": 9, "day": 15, "cumulative_percentage": 45 },
    { "month": 12, "day": 15, "cumulative_percentage": 75 },
    { "month": 3, "day": 15, "cumulative_percentage": 100 }
  ],
  "holiday_rule": "next_working_day"
}
```

#### Type 5: Event-Triggered

```json
{
  "type": "event_triggered",
  "trigger": "director_change",
  "deadline_days": 30,
  "one_time": false,
  "holiday_rule": "next_working_day"
}
```

### Complete Due Date Rules for All Obligations

#### Monthly Obligations

**GSTR-1** (Outward Supply Return): 11th of next month
```json
{
  "type": "fixed_day_of_month",
  "day": 11,
  "relative_to": "next_month",
  "holiday_rule": "next_working_day"
}
```

**GSTR-3B** (Summary Return): 20th of next month
```json
{
  "type": "fixed_day_of_month",
  "day": 20,
  "relative_to": "next_month",
  "holiday_rule": "next_working_day"
}
```

**TDS Deposit**: 7th of next month
```json
{
  "type": "fixed_day_of_month",
  "day": 7,
  "relative_to": "next_month",
  "holiday_rule": "next_working_day",
  "exceptions": {
    "march": { "day": 30, "month": 4 }
  }
}
```

**PF Payment**: 15th of next month
```json
{
  "type": "fixed_day_of_month",
  "day": 15,
  "relative_to": "next_month",
  "holiday_rule": "next_working_day"
}
```

**ESI Payment**: 15th of next month
```json
{
  "type": "fixed_day_of_month",
  "day": 15,
  "relative_to": "next_month",
  "holiday_rule": "next_working_day"
}
```

**Professional Tax (Maharashtra example)**: Last day of same month
```json
{
  "type": "fixed_day_of_month",
  "day": 30,
  "relative_to": "same_month",
  "holiday_rule": "next_working_day"
}
```

#### Quarterly Obligations

**TDS Returns (24Q, 26Q)**: 31st of month after quarter end (Q4 exception: May 31)
```json
{
  "type": "fixed_day_of_month",
  "day": 31,
  "relative_to": "month_after_quarter",
  "quarter_end_months": [6, 9, 12, 3],
  "exceptions": {
    "q4_due_month": 5,
    "q4_due_day": 31
  },
  "holiday_rule": "next_working_day"
}
```

**Advance Tax**: 15th of Jun/Sep/Dec/Mar
```json
{
  "type": "specific_dates",
  "dates": [
    { "month": 6, "day": 15, "cumulative_percentage": 15 },
    { "month": 9, "day": 15, "cumulative_percentage": 45 },
    { "month": 12, "day": 15, "cumulative_percentage": 75 },
    { "month": 3, "day": 15, "cumulative_percentage": 100 }
  ],
  "holiday_rule": "next_working_day"
}
```

**GSTR-1 QRMP**: 13th of month after quarter end
```json
{
  "type": "fixed_day_of_month",
  "day": 13,
  "relative_to": "month_after_quarter",
  "quarter_end_months": [6, 9, 12, 3],
  "holiday_rule": "next_working_day"
}
```

#### Annual Obligations

**AGM**: September 30
```json
{
  "type": "fixed_date",
  "month": 9,
  "day": 30,
  "holiday_rule": "none"
}
```

**AOC-4**: 30 days after AGM
```json
{
  "type": "relative_to_event",
  "event": "agm_date",
  "offset_days": 30,
  "fallback_date": { "month": 10, "day": 30 },
  "prerequisite": { "event": "agm_date", "must_happen_by": { "month": 9, "day": 30 } },
  "holiday_rule": "next_working_day"
}
```

**MGT-7**: 60 days after AGM
```json
{
  "type": "relative_to_event",
  "event": "agm_date",
  "offset_days": 60,
  "fallback_date": { "month": 11, "day": 29 },
  "prerequisite": { "event": "agm_date", "must_happen_by": { "month": 9, "day": 30 } },
  "holiday_rule": "next_working_day"
}
```

**ADT-1**: 15 days after AGM
```json
{
  "type": "relative_to_event",
  "event": "agm_date",
  "offset_days": 15,
  "fallback_date": { "month": 10, "day": 15 },
  "prerequisite": { "event": "agm_date", "must_happen_by": { "month": 9, "day": 30 } },
  "holiday_rule": "next_working_day"
}
```

**DIR-3 KYC**: September 30
```json
{ "type": "fixed_date", "month": 9, "day": 30, "holiday_rule": "next_working_day" }
```

**ITR (audit cases)**: October 31
```json
{ "type": "fixed_date", "month": 10, "day": 31, "holiday_rule": "next_working_day" }
```

**ITR (non-audit)**: July 31
```json
{ "type": "fixed_date", "month": 7, "day": 31, "holiday_rule": "next_working_day" }
```

**Tax Audit Report**: September 30
```json
{ "type": "fixed_date", "month": 9, "day": 30, "holiday_rule": "next_working_day" }
```

**GSTR-9**: December 31
```json
{ "type": "fixed_date", "month": 12, "day": 31, "holiday_rule": "next_working_day" }
```

**GSTR-9C**: December 31
```json
{ "type": "fixed_date", "month": 12, "day": 31, "holiday_rule": "next_working_day" }
```

**PF Annual Return**: April 25
```json
{ "type": "fixed_date", "month": 4, "day": 25, "holiday_rule": "next_working_day" }
```

**DPT-3** (Return of Deposits): June 30
```json
{ "type": "fixed_date", "month": 6, "day": 30, "holiday_rule": "next_working_day" }
```

**MSME-1** (Outstanding Payments to MSMEs): Half-yearly
```json
{
  "type": "specific_dates",
  "dates": [
    { "month": 4, "day": 30, "period_label": "Oct-Mar" },
    { "month": 10, "day": 31, "period_label": "Apr-Sep" }
  ],
  "holiday_rule": "next_working_day"
}
```

#### Event-Based Obligations

**INC-20A** (Commencement of business): 180 days from incorporation
```json
{ "type": "event_triggered", "trigger": "incorporation", "deadline_days": 180, "one_time": true, "holiday_rule": "next_working_day" }
```

**DIR-12** (Director change): 30 days from change
```json
{ "type": "event_triggered", "trigger": "director_change", "deadline_days": 30, "holiday_rule": "next_working_day" }
```

**PAS-3** (Share allotment): 15 days
```json
{ "type": "event_triggered", "trigger": "share_allotment", "deadline_days": 15, "holiday_rule": "next_working_day" }
```

**SH-7** (Capital increase): 30 days
```json
{ "type": "event_triggered", "trigger": "capital_increase", "deadline_days": 30, "holiday_rule": "next_working_day" }
```

**INC-22** (Address change): 30 days
```json
{ "type": "event_triggered", "trigger": "address_change", "deadline_days": 30, "holiday_rule": "next_working_day" }
```

**MGT-14** (Special resolution): 30 days
```json
{ "type": "event_triggered", "trigger": "special_resolution", "deadline_days": 30, "holiday_rule": "next_working_day" }
```

**CHG-1** (Charge creation): 30 days
```json
{ "type": "event_triggered", "trigger": "charge_creation", "deadline_days": 30, "holiday_rule": "next_working_day" }
```

**BEN-2** (Significant beneficial owner declaration): 30 days of change
```json
{ "type": "event_triggered", "trigger": "beneficial_owner_change", "deadline_days": 30, "holiday_rule": "next_working_day" }
```

**ADT-3** (Auditor resignation): 30 days (filed by auditor)
```json
{ "type": "event_triggered", "trigger": "auditor_resignation", "deadline_days": 30, "holiday_rule": "next_working_day" }
```

### Applicability Condition DSL

Each obligation has conditions that determine whether it applies to a given company. Conditions evaluate against the company profile.

#### Schema

```json
{
  "operator": "AND | OR",
  "conditions": [
    {
      "field": "company_profile_field_name",
      "op": "eq | neq | gt | gte | lt | lte | in | not_in | contains | exists",
      "value": "comparison_value"
    }
  ]
}
```

Supports nested groups (an `operator` + `conditions` object inside `conditions` for complex logic like "business type = business AND turnover > 1Cr, OR business type = profession AND turnover > 50L").

#### Examples for Every Obligation Category

**Always applicable (all active Pvt Ltd companies) — AGM, AOC-4, MGT-7, DIR-3 KYC, DPT-3:**
```json
{
  "operator": "AND",
  "conditions": [
    { "field": "entity_type", "op": "in", "value": ["private_limited", "public_limited"] },
    { "field": "mca_status", "op": "eq", "value": "active" }
  ]
}
```

**GST monthly obligations (GSTR-1, GSTR-3B) — GST registered, monthly filer:**
```json
{
  "operator": "AND",
  "conditions": [
    { "field": "gst_registered", "op": "eq", "value": true },
    { "field": "gst_filing_frequency", "op": "eq", "value": "monthly" }
  ]
}
```

**GSTR-1 QRMP — GST registered, quarterly filer, turnover <= 5Cr:**
```json
{
  "operator": "AND",
  "conditions": [
    { "field": "gst_registered", "op": "eq", "value": true },
    { "field": "annual_turnover", "op": "lte", "value": 50000000 },
    { "field": "gst_filing_frequency", "op": "eq", "value": "quarterly" }
  ]
}
```

**GSTR-9C — GST registered, turnover > 5Cr:**
```json
{
  "operator": "AND",
  "conditions": [
    { "field": "gst_registered", "op": "eq", "value": true },
    { "field": "annual_turnover", "op": "gt", "value": 50000000 }
  ]
}
```

**PF obligations — PF registered:**
```json
{
  "operator": "AND",
  "conditions": [
    { "field": "pf_registered", "op": "eq", "value": true }
  ]
}
```

**ESI obligations — ESI registered:**
```json
{
  "operator": "AND",
  "conditions": [
    { "field": "esi_registered", "op": "eq", "value": true }
  ]
}
```

**Tax Audit — business turnover > 1Cr OR profession turnover > 50L OR company (always):**
```json
{
  "operator": "OR",
  "conditions": [
    {
      "operator": "AND",
      "conditions": [
        { "field": "business_type", "op": "eq", "value": "business" },
        { "field": "annual_turnover", "op": "gt", "value": 10000000 }
      ]
    },
    {
      "operator": "AND",
      "conditions": [
        { "field": "business_type", "op": "eq", "value": "profession" },
        { "field": "annual_turnover", "op": "gt", "value": 5000000 }
      ]
    },
    {
      "operator": "AND",
      "conditions": [
        { "field": "entity_type", "op": "in", "value": ["private_limited", "public_limited"] }
      ]
    }
  ]
}
```

**Professional Tax — Maharashtra:**
```json
{
  "operator": "AND",
  "conditions": [
    { "field": "operating_states", "op": "contains", "value": "maharashtra" },
    { "field": "employee_count", "op": "gte", "value": 1 }
  ]
}
```

**E-invoicing — GST registered, turnover >= 5Cr:**
```json
{
  "operator": "AND",
  "conditions": [
    { "field": "gst_registered", "op": "eq", "value": true },
    { "field": "annual_turnover", "op": "gte", "value": 50000000 }
  ]
}
```

**MSME-1 — has MSME vendors:**
```json
{
  "operator": "AND",
  "conditions": [
    { "field": "entity_type", "op": "in", "value": ["private_limited", "public_limited"] },
    { "field": "has_msme_vendors", "op": "eq", "value": true }
  ]
}
```

**ITR (audit case) — requires audit:**
```json
{
  "operator": "AND",
  "conditions": [
    { "field": "requires_audit", "op": "eq", "value": true }
  ]
}
```

#### Condition Evaluator Logic

```javascript
function evaluateConditions(conditions, companyProfile) {
  const { operator, conditions: rules } = conditions;

  const results = rules.map(rule => {
    // Nested group (has its own operator)
    if (rule.operator) {
      return evaluateConditions(rule, companyProfile);
    }

    const fieldValue = companyProfile[rule.field];
    switch (rule.op) {
      case 'eq':       return fieldValue === rule.value;
      case 'neq':      return fieldValue !== rule.value;
      case 'gt':       return fieldValue > rule.value;
      case 'gte':      return fieldValue >= rule.value;
      case 'lt':       return fieldValue < rule.value;
      case 'lte':      return fieldValue <= rule.value;
      case 'in':       return rule.value.includes(fieldValue);
      case 'not_in':   return !rule.value.includes(fieldValue);
      case 'contains': return Array.isArray(fieldValue) && fieldValue.includes(rule.value);
      case 'exists':   return fieldValue !== null && fieldValue !== undefined;
      default:         return false;
    }
  });

  return operator === 'AND'
    ? results.every(Boolean)
    : results.some(Boolean);
}
```

#### Company Profile Fields for Condition Evaluation

| Field | Type | Source |
|-------|------|--------|
| `entity_type` | string | MCA API |
| `mca_status` | string | MCA API |
| `gst_registered` | boolean | User input / GSTN |
| `gst_scheme` | string | User input ("regular" / "composition" / "qrmp") |
| `gst_filing_frequency` | string | User input ("monthly" / "quarterly") |
| `annual_turnover` | number | User input / accounting |
| `employee_count` | integer | User input |
| `pf_registered` | boolean | User input |
| `esi_registered` | boolean | User input |
| `operating_states` | string[] | User input |
| `has_foreign_investment` | boolean | User input |
| `requires_audit` | boolean | Computed from turnover/entity type |
| `business_type` | string | User input ("business" / "profession") |
| `date_of_incorporation` | date | MCA API |
| `has_deposits` | boolean | User input |
| `has_msme_vendors` | boolean | User input / accounting |
| `dpiit_recognized` | boolean | User input |

### Penalty Rule Encoding

Penalty rules follow these patterns:

**Per-day penalty:**
```json
{ "type": "per_day", "amount_per_day": 50, "nil_return_amount_per_day": 20, "max_penalty": 10000 }
```

**Per-day + interest:**
```json
{ "type": "per_day_plus_interest", "amount_per_day": 50, "max_penalty": 10000, "interest_rate_annual": 18, "interest_on": "tax_liability" }
```

**Interest only:**
```json
{ "type": "interest", "interest_rate_monthly": 1.5, "interest_on": "tds_amount" }
```

**Interest + damages:**
```json
{ "type": "interest_plus_damages", "interest_rate_annual": 12, "damages_percentage_range": [5, 100], "damages_based_on": "delay_duration" }
```

**Fixed + daily:**
```json
{ "type": "fixed_plus_daily", "fixed_penalty": 100000, "daily_penalty": 5000, "penalty_on": "company_and_officers" }
```

**Fixed + daily capped:**
```json
{ "type": "fixed_plus_daily_capped", "fixed_penalty": 10000, "daily_penalty": 100, "max_total_penalty": 200000 }
```

**Per-day capped at TDS amount:**
```json
{ "type": "per_day_capped", "amount_per_day": 200, "max_penalty_rule": "tds_amount" }
```

**Fixed amount:**
```json
{ "type": "fixed", "amount": 5000, "additional_consequence": "DIN deactivated" }
```

**Percentage capped:**
```json
{ "type": "percentage_capped", "percentage": 0.5, "percentage_of": "turnover", "max_penalty": 150000 }
```

### Tax Rules as Data

#### GST Rates

```
0%  — Essential food, books, newspapers
5%  — Packaged food, footwear < Rs.1000, transport
12% — Processed food, mobile phones, fertilizers
18% — Most services (IT, consulting, restaurants), most manufactured goods
28% — Luxury items, automobiles, cement, tobacco
```

Store GST rates in database by HSN/SAC code. Rates change via GST Council notifications.

Key structural rules (in code, not data):
- CGST + SGST for intra-state supply (same state seller and buyer)
- IGST for inter-state supply (different state seller and buyer)
- Place of supply determines which applies
- Reverse charge mechanism: buyer pays GST for certain categories (legal services, import of services, etc.)

GST updates to track:
- **GSTR-1A** (new form): Amend GSTR-1 after filing but before GSTR-3B — introduced mid-2024
- **E-invoice threshold**: Rs.5 crore (from August 2023) [VERIFY-2026: check if further reduced]
- **IMS (Invoice Management System)**: Recipients can accept/reject invoices before GSTR-2B generation
- **Section 16(5)**: Retrospective ITC relief for FY 2017-18 to 2020-21
- **ISD mandatory** from April 2025 for cross-charge between distinct persons

#### TDS Rates (CORRECTED — Post Finance Act 2024)

| Section | Description | Rate | Notes |
|---------|-------------|------|-------|
| 192 | Salary | Per income tax slab | Employer deducts based on projected annual salary |
| 194A | Interest (non-bank) | 10% | Threshold: Rs.5,000/year |
| 194C | Contractors | 1% (individual/HUF), 2% (others) | Threshold: Rs.30,000 single / Rs.1,00,000 aggregate |
| 194H | Commission/Brokerage | **2%** | **Changed from 5% by Finance Act 2024** |
| 194I | Rent — Building | 10% | Threshold: Rs.2,40,000/year |
| 194I | Rent — Machinery | 2% | Threshold: Rs.2,40,000/year |
| 194J | Professional fees | 10% | Threshold: Rs.30,000/year |
| 194J | Technical fees | 2% | Threshold: Rs.30,000/year |
| 194O | E-commerce | **0.1%** | **Changed from 1% by Finance Act 2024** |
| 194DA | Life insurance payout | **2%** | **Changed from 5% by Finance Act 2024** |
| 194G | Lottery commission | **2%** | **Changed from 5% by Finance Act 2024** |
| 194BA | Online game winnings | 30% | No threshold. New section. |
| 194Q | Purchase of goods (buyer >10Cr turnover) | 0.1% | Threshold: >Rs.50 lakh aggregate |
| 194R | Benefits/perquisites (non-salary) | 10% | Threshold: >Rs.20,000/year |
| 194S | Virtual digital assets (crypto) | 1% | Threshold: Rs.10,000-50,000 |
| 206AB | Higher TDS for non-filers | 2x normal rate or 5% (whichever higher) | Applies if payee has not filed ITR for 2 prior years |

**Important**: The New Income Tax Bill 2025 was introduced in Parliament in February 2025 to replace the 1961 Act. If enacted (potentially effective April 1, 2026), all section numbers change. The rules engine MUST abstract section references using obligation codes, not hardcoded section numbers. [VERIFY-2026: check if enacted]

#### PF Rates

```
Employee contribution:  12% of (Basic + DA)
Employer contribution:  12% of (Basic + DA)
  Employer split:       3.67% to EPF + 8.33% to EPS (capped at Rs.15,000 basic for EPS)

Trigger: 20+ employees (mandatory registration)
```

**Surya Roshni judgment (2019)**: Special allowance, conveyance allowance, etc. paid universally to all employees count as "basic wages" for PF calculation. Companies cannot split basic salary into multiple allowances to reduce PF base.

**EDLI (Employees' Deposit Linked Insurance)**: Maximum benefit Rs.7,00,000 + Rs.2,50,000 bonus = up to Rs.9,50,000.

#### ESI Rates

```
Employee contribution:  0.75% of gross wages
Employer contribution:  3.25% of gross wages

Trigger: 10+ employees, wages up to Rs.21,000/month
Contribution period: Apr-Sep -> benefits Jan-Jun; Oct-Mar -> benefits Jul-Dec
Minimum 78 days contribution required for cash benefits
```

#### Professional Tax (ALL States)

| State | Rate Structure | Key Details |
|-------|---------------|-------------|
| **Maharashtra** | Up to Rs.2,500/year | Rs.200/month, Rs.300 in February. Slabs based on salary. |
| **Karnataka** | Rs.200/month | For salary > Rs.25,000/month |
| **Tamil Nadu** | Revised slabs 2023 | Up to Rs.1,250/month for highest slab |
| **Telangana** | Rs.200/month | For salary > Rs.20,000/month |
| **West Bengal** | Rs.110-200/month | Graduated slabs based on salary |
| **Gujarat** | Rs.80-200/month | Graduated slabs based on salary |
| **Madhya Pradesh** | Flat Rs.2,500/year | For salary above Rs.18,750/month |
| **Kerala** | Local body levied | Half-yearly payment to local municipality |
| **Assam** | Rs.150-208/month | Graduated slabs based on salary |
| **Delhi** | **NOT APPLICABLE** | No professional tax in Delhi |
| **Haryana** | **NOT APPLICABLE** | No professional tax |
| **Uttar Pradesh** | **NOT APPLICABLE** | No professional tax |
| **Rajasthan** | **NOT APPLICABLE** | No professional tax |
| **Punjab** | **NOT APPLICABLE** | No professional tax |
| **Himachal Pradesh** | **NOT APPLICABLE** | No professional tax |

#### Gratuity

Maximum gratuity: **Rs.25,00,000** (increased from Rs.20 lakh, effective March 29, 2024).

#### Capital Gains (Post Finance Act 2024)

- LTCG on all assets unified at **12.5%** (was 20% with indexation for unlisted shares)
- STCG on listed equity: **20%** (increased from 15%)
- Indexation benefit **removed** for assets acquired after July 23, 2024
- LTCG exemption on equity: **Rs.1.25 lakh** (up from Rs.1 lakh)

#### New Income Tax Regime (Finance Act 2025)

For individual employees (relevant to TDS computation on salary):
- No tax on income up to **Rs.12 lakh** (Rs.12.75 lakh for salaried with standard deduction)
- Slabs: 0-4L: nil, 4-8L: 5%, 8-12L: 10%, 12-16L: 15%, 16-20L: 20%, 20-24L: 25%, >24L: 30%
- Standard deduction: **Rs.75,000** under new regime

### Complete Obligation Seed Data Reference

The following is the full list of obligations stored in the `compliance_obligations` table. Each record includes `obligation_code`, `obligation_name`, `category`, `authority`, `frequency`, `period_type`, `due_date_rule` (JSON), `applicability_conditions` (JSON), `penalty_rule` (JSON), `penalty_description`, `filing_portal`, `requires_dsc`, `can_file_via_api`, `data_sources_needed`, `form_number`, `legal_reference`, `version`, `effective_from`.

#### Monthly Obligations (6)

| Code | Name | Category | Authority | Due Date | Portal | API Filing |
|------|------|----------|-----------|----------|--------|------------|
| GSTR1 | GSTR-1 Outward Supply Return | GST | CBIC | 11th next month | gst.gov.in | Yes |
| GSTR3B | GSTR-3B Summary Return | GST | CBIC | 20th next month | gst.gov.in | Yes |
| TDS_DEPOSIT | TDS Payment Deposit | TDS | CBDT | 7th next month | tin-nsdl.com | No |
| PF_PAYMENT | PF Contribution Deposit | PF | EPFO | 15th next month | EPFO portal | No |
| ESI_PAYMENT | ESI Contribution Deposit | ESI | ESIC | 15th next month | esic.gov.in | No |
| PTAX_[STATE] | Professional Tax (per state) | STATE_TAX | State | Varies by state | State portal | No |

#### Quarterly Obligations (4)

| Code | Name | Category | Authority | Due Date | Portal | API Filing |
|------|------|----------|-----------|----------|--------|------------|
| TDS_24Q | TDS Return - Salary | TDS | CBDT | 31st month after quarter | tdscpc.gov.in | No |
| TDS_26Q | TDS Return - Non-salary | TDS | CBDT | 31st month after quarter | tdscpc.gov.in | No |
| ADVANCE_TAX | Advance Tax Payment | INCOME_TAX | CBDT | 15th Jun/Sep/Dec/Mar | incometax.gov.in | No |
| GSTR1_QRMP | GSTR-1 Quarterly (QRMP) | GST | CBIC | 13th month after quarter | gst.gov.in | Yes |

#### Annual Obligations (12)

| Code | Name | Category | Authority | Due Date | Portal | API Filing |
|------|------|----------|-----------|----------|--------|------------|
| AGM | Annual General Meeting | MCA | MCA | Sep 30 | Internal | No |
| AOC4 | Financial Statements | MCA | MCA | 30 days after AGM | mca.gov.in | No |
| MGT7 | Annual Return | MCA | MCA | 60 days after AGM | mca.gov.in | No |
| ADT1 | Auditor Appointment | MCA | MCA | 15 days after AGM | mca.gov.in | No |
| DIR3_KYC | Director KYC | MCA | MCA | Sep 30 | mca.gov.in | No |
| ITR | Income Tax Return | INCOME_TAX | CBDT | Oct 31 (audit) / Jul 31 | incometax.gov.in | No |
| TAX_AUDIT | Tax Audit Report | INCOME_TAX | CBDT | Sep 30 | incometax.gov.in | No |
| GSTR9 | GST Annual Return | GST | CBIC | Dec 31 | gst.gov.in | No |
| GSTR9C | GST Reconciliation | GST | CBIC | Dec 31 | gst.gov.in | No |
| PF_ANNUAL | PF Annual Return | PF | EPFO | Apr 25 | EPFO portal | No |
| DPT3 | Return of Deposits | MCA | MCA | Jun 30 | mca.gov.in | No |
| AUDIT | Statutory Audit | MCA | MCA | Before AGM | Internal | No |

#### Half-Yearly Obligations (1)

| Code | Name | Category | Authority | Due Date | Portal | API Filing |
|------|------|----------|-----------|----------|--------|------------|
| MSME1 | MSME Outstanding Payment Report | MCA | MCA | Apr 30 / Oct 31 | mca.gov.in | No |

#### Event-Based Obligations (9)

| Code | Trigger | Deadline | Form |
|------|---------|----------|------|
| INC20A | Commencement of business | 180 days from incorporation | INC-20A |
| DIR12 | Director change | 30 days | DIR-12 |
| SH7 | Capital increase | 30 days | SH-7 |
| PAS3 | Share allotment | 15 days | PAS-3 |
| INC22 | Address change | 30 days | INC-22 |
| MGT14 | Special resolution | 30 days | MGT-14 |
| CHG1 | Charge creation | 30 days | CHG-1 |
| BEN2 | Beneficial owner declaration | 30 days of change | BEN-2 |
| ADT3 | Auditor resignation | 30 days (filed by auditor) | ADT-3 |

### Calendar Generation Algorithm

The calendar generator creates `FilingInstance` records for a full financial year:

```
Input: company_id, financial_year (e.g., "2025-26")

1. Get all active CompanyObligation records for this company
2. For each obligation:
   a. Read the due_date_rule JSON
   b. Based on period_type:
      - "monthly": Generate 12 instances (Apr through Mar)
      - "quarterly": Generate 4 instances (Q1-Q4)
      - "annual": Generate 1 instance
      - "half_yearly": Generate 2 instances
      - "event_based": Do not auto-generate — created on trigger
      - "one_time": Check if already generated, create if not
   c. For each instance, compute the actual due date:
      - Type "fixed_day_of_month": Calculate based on relative_to
      - Type "fixed_date": Use month/day directly
      - Type "relative_to_event": Use event date + offset_days (or fallback_date)
      - Type "specific_dates": Use each date entry
      - Type "event_triggered": Skip (created on trigger)
   d. Apply holiday_rule:
      - "next_working_day": If date falls on weekend or gazetted holiday, shift forward
      - "none": Keep as-is (e.g., AGM can be any day)
   e. Determine status:
      - If due_date < today and not filed: "overdue"
      - If due_date is within 7 days: "due"
      - If due_date is in the future: "upcoming"
   f. Create FilingInstance record with: companyId, obligationId, period, dueDate, status

3. For DIR-3 KYC: Generate one instance PER ACTIVE DIRECTOR
```

### Holiday and Weekend Handling

**Weekend rule**: Saturday and Sunday are non-working days. If a due date falls on Saturday, shift to Monday. If on Sunday, shift to Monday.

**Holiday data**: Maintain a `holidays` table or JSON file with:
- National gazetted holidays (Republic Day, Independence Day, Gandhi Jayanti, etc.)
- Bank holidays (used for PF/ESI/TDS payment deadlines)
- Updated annually before the start of each calendar year

**Government portal holidays**: Some portals extend deadlines when the portal itself is down (especially GSTN during peak filing). These are handled via regulatory updates, not calendar rules.

### Financial Year vs Calendar Year

| Concept | Rule |
|---------|------|
| Financial year | April 1 to March 31. FY 2025-26 = April 1, 2025 to March 31, 2026 |
| Assessment year | The FY after. AY 2026-27 corresponds to FY 2025-26 |
| GST return periods | Monthly: calendar months. Annual GSTR-9: follows FY |
| Income tax | Follows FY. ITR for FY 2025-26 due in AY 2026-27 |
| MCA filings | Follow FY. AGM for FY ending Mar 31 due by Sep 30 |
| Advance tax quarters | Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar |
| TDS quarters | Same as advance tax quarters |
| PF/ESI | Calendar months, but follow FY for annual returns |
| Professional tax | Varies by state — some monthly, some half-yearly |

Period types:
```json
{
  "period_type": "monthly",       // generates 12 instances per FY
  "period_type": "quarterly",     // generates 4 instances per FY
  "period_type": "annual",        // generates 1 instance per FY
  "period_type": "half_yearly",   // generates 2 instances per FY
  "period_type": "event_based",   // generates on trigger
  "period_type": "one_time"       // generates once
}
```

---

## Part 7: Compliance Knowledge Base (CORRECTED)

All data in this section incorporates corrections from research conducted March 2026, including Finance Act 2024 rate changes, additional obligations, and expanded state coverage.

### Regulatory Authorities

| Authority | What They Govern | Portal |
|-----------|-----------------|--------|
| Ministry of Corporate Affairs (MCA) | Company law — annual filings, director compliance, corporate governance | mca.gov.in |
| Central Board of Indirect Taxes & Customs (CBIC) | GST — registration, return filing, input tax credit, e-invoicing | cbic-gst.gov.in |
| Central Board of Direct Taxes (CBDT) | Income tax — return filing, advance tax, TDS | incometaxindia.gov.in |
| Employees' Provident Fund Organisation (EPFO) | PF contributions for employees | epfindia.gov.in |
| Employees' State Insurance Corporation (ESIC) | ESI medical/social security for employees | esic.gov.in |
| State Government Authorities | Professional Tax, Shops & Establishment Act (varies by state) | Varies |
| Reserve Bank of India (RBI) | FEMA compliance, foreign investment reporting | rbi.org.in |

### Monthly Obligations (with CORRECTED rates where applicable)

| Code | Name | Portal | Due Date | Description | Penalty |
|------|------|--------|----------|-------------|---------|
| GSTR1 | GST Outward Supply Return | GSTN | 11th of next month | All sales invoice details | Rs.50/day (Rs.20 nil). Max Rs.10,000 |
| GSTR3B | GST Summary Return | GSTN | 20th of next month | Summary return + tax payment | Rs.50/day + 18% interest on tax |
| PF_PAYMENT | PF Contribution Deposit | EPFO | 15th of next month | Employer 12% + Employee 12% of (Basic+DA) | 12% interest + damages up to 100% |
| ESI_PAYMENT | ESI Contribution Deposit | ESIC | 15th of next month | Employer 3.25% + Employee 0.75% of gross | 12% interest |
| TDS_DEPOSIT | TDS Deposit | NSDL/Bank | 7th of next month | Tax deducted at source deposit | 1.5%/month interest |
| PROF_TAX | Professional Tax | State Portal | Varies by state | Employee salary deduction (state-specific) | Rs.500-2,000 varies |

### Quarterly Obligations

| Code | Name | Portal | Due Date | Description | Penalty |
|------|------|--------|----------|-------------|---------|
| TDS_24Q | TDS Return - Salary | TRACES | 31st of month after quarter (Q4: May 31) | Employee-wise salary TDS details | Rs.200/day. Max: TDS amount |
| TDS_26Q | TDS Return - Non-salary | TRACES | 31st of month after quarter (Q4: May 31) | TDS on rent, fees, contractors | Rs.200/day. Max: TDS amount |
| ADVANCE_TAX | Advance Tax Payment | IT Portal | 15th Jun/Sep/Dec/Mar | Quarterly estimated tax if > Rs.10,000 | Interest u/s 234B (1%/month), 234C (1%/month) |
| GSTR1_QRMP | GST Quarterly Return | GSTN | 13th of month after quarter | For turnover <= Rs.5 crore (optional) | Same as monthly GSTR1 |

### Annual Obligations

| Code | Name | Portal | Due Date | Description | Penalty |
|------|------|--------|----------|-------------|---------|
| AGM | Annual General Meeting | Internal | Sep 30 (6 months from FY end) | Shareholders approve financials | Rs.1,00,000 + Rs.5,000/day |
| AUDIT | Statutory Audit | Internal | Before AGM | CA audits financial statements | Mandatory — MCA penalties if missing |
| AOC4 | Financial Statements | MCA V3 | 30 days after AGM | Balance sheet, P&L, auditor report | Rs.10,000 + Rs.100/day up to Rs.2,00,000 |
| MGT7 | Annual Return | MCA V3 | 60 days after AGM | Company details, shareholders, directors | Rs.10,000 + Rs.100/day. Director disqualification after 3 years |
| ADT1 | Auditor Appointment | MCA V3 | 15 days after AGM | Auditor appointment filing | Rs.300/day. Max Rs.12,00,000 |
| DIR3_KYC | Director KYC | MCA V3 | Sep 30 | Annual director identity verification | Rs.5,000. DIN deactivated |
| ITR | Income Tax Return | IT Portal | Oct 31 (audit) / Jul 31 (non-audit) | Annual income + tax computation (Form ITR-6) | Rs.5,000 late fee + 1%/month interest u/s 234A |
| TAX_AUDIT | Tax Audit Report | IT Portal | Sep 30 | If turnover > Rs.1 crore (Form 3CA/3CD) | 0.5% of turnover or Rs.1,50,000 |
| GSTR9 | GST Annual Return | GSTN | Dec 31 | Consolidated annual GST return | Rs.200/day. Max 0.5% of turnover |
| GSTR9C | GST Reconciliation | GSTN | Dec 31 | If turnover > Rs.5 crore | Part of GSTR9 penalty |
| PF_ANNUAL | PF Annual Return | EPFO | Apr 25 | Annual consolidated PF return | EPF Act penalties |
| DPT3 | Return of Deposits | MCA V3 | Jun 30 | Annual return of deposits/loans received | Rs.10,000 + Rs.100/day |

### Half-Yearly Obligations

| Code | Name | Portal | Due Date | Description | Penalty |
|------|------|--------|----------|-------------|---------|
| MSME1 | MSME Outstanding Payment Report | MCA V3 | Apr 30 / Oct 31 | Report outstanding payments to MSME vendors | MCA penalties + MSMED Act interest |

### Event-Based Obligations

| Code | Trigger | Timeline | Description | Form |
|------|---------|----------|-------------|------|
| INC20A | Commencement of business | 180 days from incorporation | Declaration after depositing subscription money | INC-20A |
| DIR12 | Director change | 30 days | Appointment or resignation of director | DIR-12 |
| SH7 | Capital increase | 30 days | Increase in authorized capital | SH-7 |
| PAS3 | Share allotment | 15 days | New shares issued (funding rounds) | PAS-3 |
| INC22 | Address change | 30 days | Change of registered office | INC-22 |
| MGT14 | Special resolution | 30 days | When shareholders pass special resolutions | MGT-14 |
| CHG1 | Charge creation | 30 days | Assets pledged as loan security | CHG-1 |
| GST_REG | Turnover > Rs.40L/20L | 30 days | Mandatory GST registration | GST REG-01 |
| PF_REG | 20+ employees | 1 month | Mandatory PF registration | EPFO registration |
| ESI_REG | 10+ employees | 1 month | Mandatory ESI registration | ESIC registration |
| BEN2 | Beneficial owner change | 30 days | Significant beneficial owner declaration | BEN-2 |
| ADT3 | Auditor resignation | 30 days | Filed by the auditor | ADT-3 |

### Threshold Triggers

| Threshold | Triggers |
|-----------|---------|
| Turnover > Rs.40 lakh (goods) / Rs.20 lakh (services) | Mandatory GST registration |
| Turnover > Rs.1 crore (Rs.10 crore with digital payment conditions) | Mandatory tax audit |
| Turnover > Rs.5 crore | GSTR-9C reconciliation mandatory; E-invoicing mandatory |
| Turnover > Rs.10 crore | [VERIFY-2026: E-invoicing threshold may have been reduced further] |
| Turnover > Rs.50 crore | CSR spending mandatory (2% net profit) |
| 10+ employees | ESI registration mandatory |
| 20+ employees | PF registration mandatory |
| Foreign investment received | FEMA compliance, FC-GPR with RBI |
| Foreign investment from border-sharing country | **Press Note 3 mandatory government approval** |
| Shares issued at premium | Valuation report required |
| Estimated tax liability > Rs.10,000 | Advance tax mandatory |

### CORRECTED TDS Rates (Post Finance Act 2024)

| Section | Description | Rate | Threshold | Notes |
|---------|-------------|------|-----------|-------|
| 192 | Salary | Per slab | Exempt limit | Employer deducts per projected annual salary |
| 194A | Interest (non-bank) | 10% | Rs.5,000/year | |
| 194C | Contractors — Individual/HUF | 1% | Rs.30,000 single / Rs.1L aggregate | |
| 194C | Contractors — Others | 2% | Rs.30,000 single / Rs.1L aggregate | |
| 194DA | Life insurance payout | **2%** | Rs.1,00,000 | **Reduced from 5% by Finance Act 2024** |
| 194G | Lottery commission | **2%** | Rs.15,000 | **Reduced from 5% by Finance Act 2024** |
| 194H | Commission/Brokerage | **2%** | Rs.15,000 | **Reduced from 5% by Finance Act 2024** |
| 194I | Rent — Building | 10% | Rs.2,40,000/year | |
| 194I | Rent — Machinery | 2% | Rs.2,40,000/year | |
| 194J | Professional fees | 10% | Rs.30,000/year | |
| 194J | Technical fees | 2% | Rs.30,000/year | |
| 194O | E-commerce | **0.1%** | No threshold | **Reduced from 1% by Finance Act 2024** |
| 194BA | Online game winnings | 30% | No threshold | New section |
| 194Q | Purchase of goods | 0.1% | >Rs.50L aggregate (buyer >10Cr turnover) | |
| 194R | Benefits/perquisites | 10% | >Rs.20,000/year | |
| 194S | Virtual digital assets | 1% | Rs.10,000-50,000 | |
| 206AB | Higher rate for non-filers | 2x rate or 5% | ITR not filed 2 prior years | |

### GST Rates

```
0%  — Essential food, books, newspapers
5%  — Packaged food, footwear < Rs.1000, transport
12% — Processed food, mobile phones, fertilizers
18% — Most services (IT, consulting, restaurants), most manufactured goods
28% — Luxury items, automobiles, cement, tobacco
```

### PF/ESI Rates

**PF:**
- Employee: 12% of (Basic + DA)
- Employer: 12% of (Basic + DA) — split: 3.67% EPF + 8.33% EPS (EPS capped at Rs.15,000 basic)
- Trigger: 20+ employees

**Surya Roshni judgment (2019)**: Special allowance, conveyance allowance, etc. paid universally count as "basic wages" for PF. Cannot split basic salary to reduce PF base.

**EDLI**: Max benefit Rs.7,00,000 + Rs.2,50,000 bonus = up to Rs.9,50,000.

**ESI:**
- Employee: 0.75% of gross wages
- Employer: 3.25% of gross wages
- Trigger: 10+ employees, wages up to Rs.21,000/month
- Contribution period: Apr-Sep -> benefits Jan-Jun; Oct-Mar -> benefits Jul-Dec
- Minimum 78 days for cash benefits

### Professional Tax (ALL States)

| State | Rate | Details |
|-------|------|---------|
| Maharashtra | Up to Rs.2,500/year | Rs.200/month, Rs.300 in February. Slab-based. |
| Karnataka | Rs.200/month | For salary > Rs.25,000/month |
| Tamil Nadu | Up to Rs.1,250/month | Revised slabs 2023 |
| Telangana | Rs.200/month | For salary > Rs.20,000/month |
| West Bengal | Rs.110-200/month | Graduated slabs |
| Gujarat | Rs.80-200/month | Graduated slabs |
| Madhya Pradesh | Rs.2,500/year flat | For salary above Rs.18,750/month |
| Kerala | Local body levied | Half-yearly payment |
| Assam | Rs.150-208/month | Graduated slabs |
| Delhi | NOT APPLICABLE | |
| Haryana | NOT APPLICABLE | |
| Uttar Pradesh | NOT APPLICABLE | |
| Rajasthan | NOT APPLICABLE | |
| Punjab | NOT APPLICABLE | |
| Himachal Pradesh | NOT APPLICABLE | |

### Additional Obligations Missing from Original Brief

| Form | Trigger | Timeline | Details |
|------|---------|----------|---------|
| DPT-3 | Return of deposits/loans | June 30 annually | All companies receiving deposits or loans must file |
| ADT-3 | Auditor resignation | 30 days (filed by auditor) | Auditor files this form when resigning |
| BEN-2 | Significant beneficial owner | 30 days of change | Declaration of beneficial ownership |
| MSME-1 | Outstanding MSME payments | Half-yearly (Apr 30, Oct 31) | Report outstanding payments to MSME vendors |

### FEMA Compliance

**Press Note 3 (2020) — Critical for onboarding:**
Any investment from entities in countries sharing a land border with India requires **mandatory government approval** before the investment can be made. Affected countries: China, Pakistan, Bangladesh, Nepal, Myanmar, Bhutan, Afghanistan.

During company profiling, if `has_foreign_investment = true`, the AI conversation must ask about the source country. If from a border-sharing country, surface a prominent flag: "Your company has received investment from a Press Note 3 country. Government approval is required under FEMA regulations."

**FC-GPR**: Foreign investment received must be reported to RBI via FC-GPR filing within 30 days.

### Angel Tax — ABOLISHED

**Section 56(2)(viib) was FULLY ABOLISHED** by Finance Act 2024, effective AY 2025-26. No angel tax compliance is needed for any company from April 1, 2024 onwards. The original brief mentioned "angel tax relaxation" for DPIIT startups — this is now irrelevant as angel tax no longer exists for anyone.

### New Income Tax Bill 2025

[VERIFY-2026: Check current status]

Introduced in Parliament February 2025 to replace the Income Tax Act 1961. If enacted (potentially effective April 1, 2026), ALL section numbers change. The AUTMN rules engine must abstract section references using obligation codes, not hardcoded section numbers. This is a critical architectural decision.

### Labour Codes Status

[VERIFY-2026: Check if implemented]

Four new Labour Codes were passed (2019-2020) but were **NOT YET IMPLEMENTED** as of mid-2025:
1. Code on Wages, 2019
2. Industrial Relations Code, 2020
3. Social Security Code, 2020
4. Occupational Safety Code, 2020

**Key impact when implemented:**
- "50% rule" — wages definition changes, meaning basic+DA must be >= 50% of total remuneration. This increases the PF/ESI/gratuity base significantly for companies that currently have a low basic component.
- Gig workers will be covered under the Social Security Code.
- Once implemented, the rules engine must be updated with new wage definitions and contribution bases.

### DPDPA 2023 (Digital Personal Data Protection Act)

Enacted August 2023, rules in draft as of January 2025. Penalties up to **Rs.250 crore** per instance. AUTMN itself handles financial data and must comply:
- Consent management for data processing
- Breach notification obligations
- Children's data protections
- Data principal rights (access, correction, erasure)

---

## Part 8: API Integrations

### MCA Company Data (Sandbox.co.in)

**Provider**: Sandbox.co.in (primary), Surepass.io and APIclub.in as alternatives.

**Method**: POST with CIN. Cost: Rs.1-5 per call.

**Primary endpoint:**
```
POST https://api.sandbox.co.in/mca/company/master-data/search
Body: { "id": "U12345AB1234ABC123456", "consent": "y" }
```

**Returns**: company_name, company_category, class_of_company, date_of_incorporation, registered_address, authorized_capital, paid_up_capital, company_status, active_compliance, directors list with DINs.

**Additional endpoints discovered:**

| Endpoint | Purpose | AUTMN Usage |
|----------|---------|-------------|
| `/mca/company/charges` | Charges registered against company | Charge tracking, CHG-1 monitoring |
| `/mca/company/directors` | Director details | Director compliance monitoring, DIR-3 KYC tracking |
| `/mca/company/filing-history` | Forms filed, dates, SRN numbers | Filing status verification, health score input |
| `/mca/din/search` | Director lookup by DIN | Director profile enrichment |

### GSTN / GSP Architecture

**Access model**: AUTMN operates as an ASP (Application Service Provider), accessing GSTN through a licensed GSP (GST Suvidha Provider). 62 GSPs currently empaneled.

**GSPs to approach**: MasterGST (Tera Software), WhiteBooks, GSTZen.

**Authentication flow**:
1. Taxpayer enables API access on GST portal
2. Taxpayer authenticates via OTP (sent to registered mobile)
3. Session token valid 6 hours to 30 days

**Sandbox**: developer.gst.gov.in — Test OTP: 575757

**Available API endpoints:**

| Endpoint | Purpose |
|----------|---------|
| GSTR-1 Save/Submit/File | File outward supply return |
| GSTR-3B Save/Submit/File | File summary return |
| GSTR-2A/2B Download | Download supplier-filed data for ITC reconciliation |
| E-invoice Generation | Generate IRN for e-invoicing |
| E-way Bill | Generate/update e-way bills |
| GSTIN Verification | Verify counterparty GSTIN |
| Ledger Queries | Check cash/credit/liability ledger balances |
| Return Status | Check filing status of returns |

### Zoho Books API

**Auth**: OAuth 2.0. Refresh tokens are permanent (no expiry).

**Base URL**: `https://www.zohoapis.com/books/v3/`

**Rate limit**: 100 requests/minute/organization.

**Key endpoints:**

| Endpoint | Data Extracted |
|----------|---------------|
| `/invoices` | Invoice number, date, amount, GST details (GSTIN, HSN/SAC, place of supply, tax amounts, is_reverse_charge), line items |
| `/bills` | Purchase bills with vendor GSTIN, HSN, tax details |
| `/expenses` | Expense records |
| `/creditnotes` | Credit notes with GST adjustment details |
| `/payments` | Payment records |
| `/contacts` | Customer/vendor master with GSTIN |
| `/taxes` | Tax rate configuration |

**GST-specific fields on invoices**: gst_no, gst_treatment, place_of_supply, is_reverse_charge, line items with hsn_or_sac, tax_percentage, tax_amount.

**Sync strategy**: Paginated fetch with upsert. Auto-sync every 6 hours via Bull cron job. Manual sync button in settings. Token auto-refresh using permanent refresh token. Detect 401 for revoked tokens and notify user.

### Google Gemini API

**Models:**
- Gemini 2.5 Flash: $0.15 / $2.50 per million tokens — used for 80% of operations
- Gemini 3 Flash: $0.50 / $3.00 per million tokens — used for complex analysis

**Capabilities used:**
- **Function calling**: Gemini can call AUTMN APIs mid-conversation (e.g., during onboarding, call the obligation mapper to count applicable obligations)
- **Structured output**: Force JSON responses for tax computations (validated against Zod schemas)
- **Context caching**: Cache tax rules as system prompt context. 90% savings on repeated content.
- **Streaming**: SSE-based streaming for chat interface responses

**Use cases:**
1. Onboarding conversation — ask profiling questions, interpret natural language answers
2. Tax computation — compute GST/TDS from financial data
3. ITC reconciliation — identify mismatches and generate vendor follow-up actions
4. Regulatory interpretation — parse government notifications into plain English
5. Pre-filing QC — flag errors in prepared returns (duplicate invoices, rate mismatches, missing HSN)
6. Health score narrative — generate plain-English compliance summary

### TallyPrime (Phase 2 — Planned)

TallyPrime integration planned for Phase 2 of product development. TallyPrime is widely used by Indian accountants. Integration approach TBD — likely XML/JSON export import or Tally's connector APIs.

---

## Part 9: Development Phases

Every phase is a vertical slice: database + backend + frontend. Each phase is independently demoable in under 5 minutes and testable in isolation. Phases build on each other but use stubs/mocks for dependencies not yet built.

### Phase 1: Project Skeleton

**Goal**: Next.js app runs, database connects, you can visit a page.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 1.1 | Initialize Next.js 15 (App Router, TypeScript, Tailwind) | `npm run dev` opens localhost |
| 1.2 | Set up shadcn/ui + design tokens (colors, fonts, spacing) | Button, Card, Input components render with AUTMN palette |
| 1.3 | docker-compose.yml (PostgreSQL + Redis) | `docker compose up` starts both services |
| 1.4 | Prisma setup + initial schema (User, Company tables only) | `npx prisma migrate dev` runs, tables created |
| 1.5 | App shell layout — sidebar + topbar (static, no auth yet) | Visit `/dashboard` and see the layout skeleton |

**Demo**: App runs, sidebar is visible, database is connected, design system is in place.

**Tests**: Prisma client connects, shadcn components render, layout is responsive.

---

### Phase 2: Authentication

**Goal**: Users can sign up, log in, and see a protected dashboard.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 2.1 | Auth.js (NextAuth v5) setup with Credentials provider | Auth config exports `auth`, `handlers`, `signIn`, `signOut` |
| 2.2 | Prisma schema for User + Session + Account | `npx prisma migrate dev` adds auth tables |
| 2.3 | Sign up page (`/auth/signup`) — email + password, bcrypt hash | Fill form, user created in DB |
| 2.4 | Login page (`/auth/login`) — email + password | Login, redirected to `/dashboard` |
| 2.5 | Middleware — protect `/dashboard/*` routes | Unauthenticated -> redirected to `/auth/login` |
| 2.6 | TopBar shows user email, logout button works | Click logout, session destroyed, back to login |

**Demo**: Sign up, log in, see empty dashboard, log out.

**Tests**: Auth flow (signup, login, logout, protected routes), password hashing, session management, middleware redirect.

---

### Phase 3: Company Profiling — CIN Lookup

**Goal**: User enters CIN, system fetches company data from MCA API and displays it.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 3.1 | Prisma schema for Company + Director models | Tables created with all fields |
| 3.2 | CIN validator utility (format regex + checksum) | Valid/invalid CINs correctly identified |
| 3.3 | MCA API client (Sandbox.co.in) — fetch company master data | API call returns company name, directors, capital, status |
| 3.4 | Onboarding page 1 (`/onboarding/cin`) — CIN input + fetch | Enter CIN, loading, company card displayed |
| 3.5 | Company confirmation UI — show fetched data, confirm button | Click confirm, company saved to DB, user linked |
| 3.6 | Manual entry fallback — form for when MCA API is down | Fill form manually, company created |

**Demo**: Enter a real CIN, see company details auto-fetched, confirm, saved.

**Tests**: CIN validation, MCA API response parsing, company creation, fallback form.

---

### Phase 4: Company Profiling — AI Conversation

**Goal**: AI asks the founder 6-8 questions to complete the compliance profile.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 4.1 | Gemini API client wrapper (with retry, error handling) | Client can send prompts and get responses |
| 4.2 | Onboarding prompt template (system prompt + question flow) | AI asks relevant questions based on company data |
| 4.3 | Chat UI component (`/onboarding/profile`) — streaming responses | Messages appear word-by-word |
| 4.4 | Profile update logic — each answer updates company record | After answering "14 employees", company.employee_count = 14 |
| 4.5 | Adaptive question flow — skip irrelevant questions | If turnover < 20L, skip GST questions |
| 4.6 | Onboarding completion — show obligation count summary | Final screen: "27 obligations found" |
| 4.7 | Fallback — structured form if AI is unavailable | Same data collected via dropdowns/inputs |

**Demo**: After CIN confirmation, chat with AI, answer questions, see "27 obligations found", profile complete.

**Tests**: Gemini client error handling, profile field updates, question skipping logic, fallback form parity.

---

### Phase 5: Obligation Mapping Engine

**Goal**: Given a company profile, determine exactly which obligations apply.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 5.1 | Prisma schema for ComplianceObligation + CompanyObligation | Tables created |
| 5.2 | Master obligations seed data — ALL obligations as JSON | `npx prisma db seed` populates 30+ obligations with due date rules + applicability conditions |
| 5.3 | Condition evaluator — evaluate applicability JSON against profile | `evaluate({entity_type: "pvt_ltd", employee_count: 14, gst_registered: true})` returns matching obligations |
| 5.4 | Obligation mapper service — map company to applicable obligations | Creates CompanyObligation junction records |
| 5.5 | Obligations list page — show all applicable obligations grouped | User sees: "GST: 6, MCA: 8, Tax: 7..." |

**Demo**: Complete onboarding, see all obligations grouped by MCA/GST/TDS/PF/State.

**Tests**: Every obligation condition tested with different company profiles. 20+ employees triggers PF. GST registered triggers GSTR-1. Boundary tests at every threshold.

---

### Phase 6: Compliance Calendar — Core

**Goal**: Generate a full financial year calendar from obligations and display it.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 6.1 | Prisma schema for FilingInstance | Table created |
| 6.2 | Due date calculator — interpret due_date_rule JSON to actual dates | `{type: "fixed_day_of_month", day: 11}` + March 2026 = April 11, 2026 |
| 6.3 | Indian holiday calendar data (national + bank holidays) | Holiday list for FY 2025-26 and 2026-27 |
| 6.4 | Weekend/holiday adjustment — shift to next working day | If Apr 11 is Sunday, shift to Apr 12 |
| 6.5 | Calendar generator service — generate all FilingInstances for FY | 27 obligations -> ~200 filing instances |
| 6.6 | Calendar list view (`/calendar`) — sorted by date, color-coded | Green (filed), Amber (upcoming), Red (overdue), Gray (future) |
| 6.7 | Obligation detail slide-over — click item to see details | Click "GSTR-1 Apr 2026", see full details + penalty |

**Demo**: Visit calendar, see every deadline for the year, click any item, see details + penalty.

**Tests**: Due date calculation for every type (monthly/quarterly/annual/event/AGM-relative). Holiday adjustment. Status determination. Full calendar generation matches expected output.

---

### Phase 7: Dashboard

**Goal**: The main daily view — urgency panel, health widget, alerts.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 7.1 | Upcoming deadlines query — next 5 items sorted by due date | API returns correct ordered list |
| 7.2 | Overdue items query — all past-due with accrued penalty | API returns overdue items with penalty amounts |
| 7.3 | Dashboard page (`/dashboard`) — urgency cards, overdue section, timeline | Full dashboard layout with real data |
| 7.4 | Penalty calculator — compute accrued penalty per penalty_rule JSON | DIR-3 KYC 168 days overdue -> Rs.5,000 penalty |
| 7.5 | Threshold alert engine — check profile against triggers | "Turnover approaching Rs.40L — GST registration required" |
| 7.6 | Empty state — no overdue, no upcoming | "You're all caught up" |

**Demo**: Log in, see dashboard with upcoming deadlines, overdue items with penalties, threshold warnings.

**Tests**: Upcoming/overdue queries correct. Penalty calculation matches manual. Threshold alerts trigger at correct values.

---

### Phase 8: Calendar — Advanced Views

**Goal**: Month grid view, quarter view, year view, filters, iCal export.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 8.1 | Month grid calendar component — day cells with obligation chips | Visual calendar with colored dots per day |
| 8.2 | Quarter view — 3-month overview | Condensed view of a quarter |
| 8.3 | Year view — 12-month heatmap style | Full year at a glance |
| 8.4 | Filters — by category (MCA/GST/TDS/PF), by status | Filter "GST only", only GST shown |
| 8.5 | iCal feed generation — subscribe in Google Calendar/Outlook | Download .ics file or subscribe via URL |

**Demo**: Switch between month/quarter/year views, filter by category, export to Google Calendar.

**Tests**: Calendar rendering. Filter logic. iCal format validity.

---

### Phase 9: Notification System

**Goal**: Email alerts for upcoming deadlines, overdue items, and regulatory changes.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 9.1 | Notification model in Prisma | Table created |
| 9.2 | In-app notification bell + dropdown panel | Bell shows count, click to see notifications |
| 9.3 | Deadline checker cron job (Bull queue) — runs daily | Creates notifications for items due in 7/3/1/0 days |
| 9.4 | Email service (Resend) — send deadline reminder emails | "TDS Deposit due in 3 days" email |
| 9.5 | Daily digest email — summary of today's obligations | 9 AM email with all items due today + overdue |
| 9.6 | Notification preferences page (`/settings/notifications`) | Toggle email notifications on/off |

**Demo**: Company with upcoming deadlines, receive email alerts at 7/3/1-day marks, see in-app notifications.

**Tests**: Cron creates correct notifications. Email sends. Preferences respected. No duplicates.

---

### Phase 10: Zoho Books Integration

**Goal**: Connect Zoho Books via OAuth, pull financial data automatically.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 10.1 | Prisma schema for IntegrationToken + FinancialData | Tables created |
| 10.2 | Zoho OAuth flow — connect button, redirect, callback, token storage | Click "Connect Zoho Books", OAuth flow, tokens saved |
| 10.3 | Token manager — auto-refresh expired access tokens | Auto-refresh using permanent refresh token |
| 10.4 | Zoho API client — fetch invoices, bills, credit notes, payments | API calls return financial data with GST details |
| 10.5 | Data mapper — Zoho invoice schema to internal FinancialData schema | Extract GSTIN, HSN/SAC, place_of_supply, tax amounts |
| 10.6 | Sync service — paginated fetch + upsert + status tracking | Sync pulls all invoices, stores in DB |
| 10.7 | Integrations page — connect status, last sync, manual sync | "Connected to Zoho Books, Last sync: 2h ago, [Sync Now]" |
| 10.8 | Auto-sync cron job — every 6 hours | Financial data stays current |

**Demo**: Connect Zoho Books, OAuth flow, data syncs, see invoice count and last sync time, click Sync Now.

**Tests**: OAuth flow. Token refresh. Data mapping (all GST fields). Idempotent sync. Rate limiting.

---

### Phase 11: Rules Engine (Tax Computation Safety Net)

**Goal**: Hardcoded tax computation engine that verifies all AI outputs. Safety-critical.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 11.1 | GST rate lookup — by HSN/SAC code | `getGSTRate("998311")` returns 18% |
| 11.2 | Place of supply logic — CGST+SGST vs IGST | `determineGSTType("27", "29")` returns "IGST" |
| 11.3 | GST computation — output tax from invoices | Invoices -> CGST/SGST/IGST by rate slab |
| 11.4 | ITC computation — input tax from purchase bills | Bills -> eligible ITC |
| 11.5 | Net GST liability — output tax minus ITC | Net payable with CGST/SGST/IGST split |
| 11.6 | TDS rate lookup — by section | `getTDSRate("194J", "company")` returns 10% |
| 11.7 | TDS computation — identify TDS-applicable payments + compute | Payments -> TDS by section |
| 11.8 | PF/ESI computation — from employee salary data | Salaries -> employer + employee contributions |
| 11.9 | Professional tax computation — state-wise | State + salary -> PT amount |
| 11.10 | Advance tax estimation — quarterly projected liability | YTD data -> quarterly advance tax |

**Demo**: Feed sample invoice data, rules engine outputs GST liability, matches manual calculation to the rupee.

**Tests**: THIS IS THE MOST TESTED MODULE. Golden file tests for every tax type. Every TDS section. Every GST rate. Every PF/ESI scenario. Every PT state. Boundary tests at every threshold. Property tests (CGST+SGST and IGST mutually exclusive). Decimal precision tests (`toBeCloseTo` with 2 decimal places).

**Note**: Phase 11 has NO DEPENDENCIES. It can start anytime and run in parallel with other phases.

---

### Phase 12: AI Tax Computation + Dual Verification

**Goal**: Gemini computes taxes from financial data, rules engine verifies, discrepancies flagged.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 12.1 | GST computation prompt — structured JSON output | AI returns: output tax, ITC, net payable |
| 12.2 | TDS computation prompt — identify payments + compute | AI returns: deductions by section |
| 12.3 | Dual verification logic — compare AI vs rules engine | Match: "Verified". 1-5% diff: "Needs Review". >5%: rules engine wins |
| 12.4 | Tax overview pages (`/taxes/gst`, `/taxes/tds`) | Founder sees GST breakdown with "Verified" badge |
| 12.5 | "How was this computed?" explainer UI | Expandable section showing calculation steps |
| 12.6 | Computation trigger on Zoho sync completion | Zoho syncs -> taxes auto-computed -> notification |

**Demo**: Zoho data syncs, AI computes GST, rules engine verifies, founder sees "GST payable: Rs.71,800 Verified" with breakdown.

**Tests**: Mock AI + verify dual verification. AI unavailable -> rules engine only. Discrepancy handling at all levels.

---

### Phase 13: Return Preparation (GSTR-1 / GSTR-3B / TDS)

**Goal**: Prepare return data in exact government-required format.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 13.1 | GSTR-1 data formatter — group invoices into B2B/B2CS/B2CL/CDNR/HSN | JSON matches GSTN specification |
| 13.2 | GSTR-3B data formatter — summary from computation | JSON matches GSTN specification |
| 13.3 | TDS return data formatter — 24Q/26Q format | CSV matches TRACES RPU format |
| 13.4 | Filings page (`/filings`) — list all returns with status | Table: obligation, period, due date, status, action |
| 13.5 | Filing detail page (`/filings/[id]`) — show prepared data | Invoice-level detail, summary totals, searchable |
| 13.6 | Pre-filing QC — AI review for common errors | Flag: duplicate invoices, rate mismatches, missing HSN |
| 13.7 | Download prepared data — export in portal format | TDS: CSV for TRACES. MCA: data package |

**Demo**: Visit filings, see "GSTR-1 March 2026 — Prepared", click, review data, download for manual filing.

**Tests**: GSTR-1 validates against GSTN schema. GSTR-3B totals match computation. TDS matches RPU format. QC catches errors.

---

### Phase 14: GST Filing via GSP

**Goal**: File GSTR-1 and GSTR-3B through GSTN API via GSP partner.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 14.1 | GSP partner integration — API client | Client authenticates and makes API calls |
| 14.2 | OTP request flow — trigger OTP to taxpayer mobile | API sends OTP request, GSTN sends OTP |
| 14.3 | OTP verification — validate OTP, get auth token | Enter OTP, get session token (6h-30d) |
| 14.4 | GSTR-1 submission — upload prepared data | Data submitted to GSTN via GSP |
| 14.5 | GSTR-1 filing — submit/file and get ARN | Return filed, acknowledgment number received |
| 14.6 | Filing status tracking — poll for acknowledgment | Status: "submitted" -> "filed" |
| 14.7 | Filing review + confirmation UI | Review -> confirm -> OTP -> file -> success |
| 14.8 | GSTR-3B filing — same flow | Complete GSTR-3B workflow |

**Demo**: Click "File GSTR-1", review, confirm, enter OTP, filed, see ARN. (GSTN sandbox: test OTP 575757)

**Tests**: Full flow in sandbox. Error handling (invalid OTP, GSTN down, data rejected). No double filing. Audit logging.

---

### Phase 15: ITC Reconciliation

**Goal**: Compare purchase register against GSTR-2B to find ITC mismatches.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 15.1 | GSTR-2B download via GSP API | Fetch GSTR-2B data for a period |
| 15.2 | Matching engine — purchase invoices vs GSTR-2B | Categorize: matched, in-books-not-2B, in-2B-not-books, amount-mismatch |
| 15.3 | ITC reconciliation AI — generate action items | "Contact vendor X — invoice #123 not in your GSTR-2B" |
| 15.4 | Reconciliation page | Table of matches, mismatches, actions |
| 15.5 | ITC at risk calculation | "Rs.42,000 ITC at risk from 7 unmatched invoices" |

**Demo**: ITC reconciliation with matched/unmatched invoices, risk amount, actionable vendor follow-ups.

**Tests**: Matching logic. Edge cases (partial matches, amount differences, GSTIN typos).

---

### Phase 16: Compliance Health Score

**Goal**: Score 0-100 based on filing status, overdue items, and compliance gaps.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 16.1 | Score algorithm — weighted scoring | Filing statuses -> score 0-100 |
| 16.2 | Category breakdown | MCA: 22/25, GST: 20/25, TDS: 18/20, PF: 12/15, Corp: 10/15 |
| 16.3 | Issues list | "DIR-3 KYC overdue (-5 pts)", "GSTR-9 unfiled (-8 pts)" |
| 16.4 | Health score page (`/health`) | Gauge, breakdown, issues, trend |
| 16.5 | Score history + trend chart | Last 12 months |
| 16.6 | AI narrative | "Your company has a score of 78/100. Two issues need attention..." |
| 16.7 | Investor-ready PDF report | Download compliance report as PDF |

**Demo**: Visit health, see 78/100, breakdown, issues with "Fix This" links, download PDF report.

**Tests**: Score calculation. Weights sum to 100. Issues link to overdue items. PDF generates.

---

### Phase 17: Regulatory Intelligence

**Goal**: Monitor government notifications and alert affected companies.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 17.1 | Government site scrapers — MCA, CBIC, CBDT | Extract notification number, date, text, URL |
| 17.2 | Regulatory update storage | No duplicates, full text stored |
| 17.3 | AI analysis — interpret notification | Summary, affected obligations, entity types, action |
| 17.4 | Calendar auto-update — deadline changed | GSTR-1 deadline extended -> all calendars updated |
| 17.5 | Regulatory feed page (`/regulatory`) | Notifications with plain-English summaries |
| 17.6 | Personalized alerts | "This change affects your company because..." |
| 17.7 | Daily scraping cron job | Runs 7 AM IST |

**Demo**: View regulatory updates, see MCA/GST/Tax notifications in plain English, affected items highlighted, calendar auto-updated.

**Tests**: Scraper extracts correctly. AI analysis valid. Calendar updates. No false alerts.

---

### Phase 18: Settings + Team + Billing

**Goal**: Settings, team management, and subscription management.

| Task | What You Build | Testable Output |
|------|---------------|-----------------|
| 18.1 | User profile page (`/settings/profile`) | Edit name, change password |
| 18.2 | Company profile page (`/settings/company`) | Edit details, re-run obligation mapping |
| 18.3 | Team management (`/settings/team`) | Invite CA, team members |
| 18.4 | Role-based access (Founder/CA/Team Member) | CA: view + file. Team member: view only |
| 18.5 | Billing page (`/settings/billing`) — Stripe | Subscribe, manage payment |

**Demo**: Invite CA, CA logs in, sees same company, can review filings but can't change settings.

**Tests**: RBAC on every API route. Invite flow. Role-based UI differences.

---

### Phase Summary

| Phase | What It Delivers | Depends On |
|-------|-----------------|------------|
| 1 | App runs, design system, DB connected | Nothing |
| 2 | Auth — signup, login, protected routes | Phase 1 |
| 3 | CIN lookup -> company profile from MCA API | Phase 2 |
| 4 | AI onboarding conversation | Phase 3 |
| 5 | Obligation mapping — which obligations apply | Phase 4 |
| 6 | Compliance calendar — all deadlines for the year | Phase 5 |
| 7 | Dashboard — urgency panel, overdue, threshold alerts | Phase 6 |
| 8 | Calendar advanced views — month grid, filters, iCal | Phase 6 |
| 9 | Notifications — email alerts for deadlines | Phase 6 |
| 10 | Zoho Books integration — pull financial data | Phase 2 |
| 11 | Rules engine — hardcoded tax computation | Nothing |
| 12 | AI tax computation + dual verification | Phase 10, 11 |
| 13 | Return preparation — GSTR-1/3B/TDS data format | Phase 12 |
| 14 | GST filing via GSP API | Phase 13 |
| 15 | ITC reconciliation — purchase vs GSTR-2B | Phase 10, 14 |
| 16 | Compliance health score + PDF report | Phase 6, 12 |
| 17 | Regulatory intelligence — scrape + analyze + alert | Phase 6, 9 |
| 18 | Settings, team management, billing | Phase 2 |

### Critical Path (MVP — Free Tier)

```
Phase 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 9
```

This gives: Sign up -> enter CIN -> AI profiling -> see all obligations -> compliance calendar -> dashboard -> email alerts. This is already more valuable than anything else in the Indian market.

### Parallel Tracks (After Phase 7)

```
Track A (Calendar + Alerts):     Phase 8 -> Phase 9
Track B (Tax Engine):            Phase 10 -> Phase 11 -> Phase 12 -> Phase 13 -> Phase 14 -> Phase 15
Track C (Score + Intelligence):  Phase 16 -> Phase 17

Phase 18 can happen anytime after Phase 2.
Phase 11 (Rules Engine) can start anytime — it has NO dependencies.
```

### Phase Dependency Diagram

```
                                    Phase 1 (Skeleton)
                                         |
                                    Phase 2 (Auth)
                                    /    |    \
                              Phase 3  Phase 10  Phase 18
                                |      (Zoho)   (Settings)
                              Phase 4
                                |
                              Phase 5
                                |
                              Phase 6 ---------> Phase 11 (Rules Engine)
                             /  |  \                    |
                       Phase 7  8   9            Phase 12 (AI + Dual Verify)
                                                       |
                                                 Phase 13 (Return Prep)
                                                       |
                                                 Phase 14 (GST Filing)
                                                       |
                                                 Phase 15 (ITC Recon)

                       Phase 6 + Phase 12 -----> Phase 16 (Health Score)
                       Phase 6 + Phase 9 ------> Phase 17 (Regulatory Intel)
```

### Testing Strategy Per Phase

| Phase | Unit Tests (Priority) | Integration Tests | E2E Tests |
|-------|----------------------|-------------------|-----------|
| 1 (Skeleton) | Component renders | DB connection | Page loads |
| 2 (Auth) | Password hashing, validation | Auth flow with DB | Login/logout flow |
| 3 (CIN Lookup) | CIN validation, data parsing | MCA API integration | Enter CIN -> see profile |
| 4 (AI Chat) | Prompt templates, response parsing | Gemini API (mocked) | Chat flow |
| 5 (Obligation Mapping) | Condition evaluator with all profiles | Obligation query + conditions | Company -> obligations list |
| 6 (Calendar) | Date calculations, due dates | Calendar data assembly | View calendar, navigate |
| 7 (Dashboard) | Penalty calculation | Dashboard queries | Full dashboard with data |
| 8 (Calendar Views) | View rendering | Filter logic | Switch views, filter |
| 9 (Notifications) | Notification creation logic | Cron job + email | Receive notifications |
| 10 (Zoho) | Data normalization | OAuth + API sync | Connect -> see data |
| 11 (Rules Engine) | **EXHAUSTIVE** — every rate, every scenario | All computation pipelines | Compute -> verify |
| 12 (AI + Dual) | Dual verification logic | AI + rules comparison | Compute -> see verified result |
| 13 (Return Prep) | Format validation | Data assembly | Prepare -> review -> download |
| 14 (GST Filing) | OTP flow | GSP sandbox API | Full filing flow |
| 15 (ITC Recon) | Matching algorithm | Match with test data | See reconciliation |
| 16 (Health Score) | Score algorithm | Score with real data | View score + PDF |
| 17 (Regulatory) | Scraper extraction | AI analysis | View updates |
| 18 (Settings) | RBAC checks | Invite flow | Role-based access |

**Testing priorities:**
- Phase 1-5: Unit > Integration > E2E (60/30/10 effort split)
- Phase 6+: Unit > E2E > Integration (E2E becomes more valuable for regressions)
- Phase 11 (Rules Engine): Highest test density in the entire project. Golden file tests, property-based tests, boundary tests, decimal precision tests.
- AI tests: Mock LLM in CI (Tier 1). Real LLM evaluation nightly (Tier 2). Human-verified ground truth quarterly (Tier 3).

---

## Part 10: What Can and Cannot Be Auto-Filed

### Can File via API

- GSTR-1 (through GSP partner) — requires taxpayer OTP
- GSTR-3B (through GSP partner) — requires taxpayer OTP
- GSTR-2B download for ITC reconciliation (through GSP)
- E-invoice generation (through GSP)

### Can Prepare but Not Auto-File

- TDS returns 24Q/26Q — no TRACES API. Export data in RPU format for manual upload on tdscpc.gov.in.
- MCA filings (MGT-7, AOC-4, ADT-1, DPT-3, etc.) — no MCA API. Requires DSC (Digital Signature Certificate) hardware token. Prepare data package for CA to file.
- Income Tax Return (ITR-6) — no IT portal API. Requires DSC. Prepare computation and data for CA.
- PF/ESI returns — no EPFO/ESIC API. Prepare data for manual filing on unified portal.
- Professional Tax — no state portal APIs. Prepare computation for manual payment.

### Cannot Do

- Auto-file on MCA V3 portal (requires DSC hardware token + portal interaction)
- Auto-file on TRACES (no API exists)
- Auto-pay taxes on government portals (payment requires bank integration + government portal)
- Auto-file ITR (requires DSC + verification on IT portal)

### Why the DSC Barrier Matters

DSC (Digital Signature Certificate) is a hardware or cloud-based token required for MCA and some tax filings. It is the primary barrier to full MCA automation. Until MCA provides an API or accepts alternative authentication, these filings require manual portal interaction. AUTMN maximizes value by preparing all data so the actual filing takes minutes instead of hours.

---

## Important Domain Context

- India's financial year: April 1 to March 31
- GST introduced: July 1, 2017
- MCA migrated to V3 portal: July 2025 — all forms now web-based
- DPIIT-recognized startups get: tax holiday (3 years), self-certification for some labour/environment laws. Angel tax is now fully abolished for all companies (Finance Act 2024).
- GST rates and rules change frequently through GST Council meetings — system must validate against latest rules, not training data
- State-level compliance varies significantly by state (Professional Tax, Shops & Establishment)
- The GST ecosystem has ASP-GSP structure: apps (ASPs) access GSTN through licensed intermediaries (GSPs). 62 GSPs currently empaneled.
- When computing GST, distinguish between: CGST+SGST (intra-state supply) vs IGST (inter-state supply). Place of supply determines which applies.
- Reverse charge mechanism: buyer pays GST instead of seller for certain categories (legal services, import of services, etc.)
- ITC (Input Tax Credit) reconciliation is critical: compare your purchase register against GSTR-2B. Mismatches mean lost ITC = lost money.
- Companies Act 2013 governs all Private Limited Company compliance in India.
- The New Income Tax Bill 2025 may change all section numbers — abstract references in code. [VERIFY-2026]
- Four Labour Codes passed but not yet implemented — monitor status. [VERIFY-2026]
- DPDPA 2023 is enacted but rules are in draft — AUTMN must comply as a data processor. [VERIFY-2026]

---

*Document version: 1.0 | Compiled: March 2026 | Items marked [VERIFY-2026] need status verification before development begins.*
