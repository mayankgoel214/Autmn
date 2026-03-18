import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'

export default async function SettingsPage() {
  const session = await auth()
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { company: true },
      })
    : null

  // Check if Zoho is connected
  let zohoConnected = false
  let zohoOrgName: string | null = null

  if (user?.companyId) {
    const token = await prisma.integrationToken.findUnique({
      where: { companyId_provider: { companyId: user.companyId, provider: 'zoho_books' } },
    }).catch(() => null)

    if (token) {
      zohoConnected = true
      zohoOrgName = (token.metadata as Record<string, string>)?.organizationName || 'Connected'
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Settings</h1>

      {/* Profile Section */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-4">Account</h2>
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">Name</p>
                <p className="text-sm text-[var(--color-text-secondary)]">{session?.user?.name || 'Not set'}</p>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">Email</p>
                <p className="text-sm text-[var(--color-text-secondary)]">{session?.user?.email}</p>
              </div>
            </div>
            {user?.company && (
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">Company</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">{user.company.companyName}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Integrations Section */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-4">Integrations</h2>
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-bg-secondary)]">
                <span className="text-lg font-bold text-[var(--color-text)]">Z</span>
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">Zoho Books</p>
                {zohoConnected ? (
                  <p className="text-xs text-[var(--color-success)]">{zohoOrgName}</p>
                ) : (
                  <p className="text-xs text-[var(--color-text-secondary)]">Connect to pull invoices and compute taxes automatically</p>
                )}
              </div>
            </div>
            {zohoConnected ? (
              <span className="inline-flex items-center rounded-full bg-[var(--color-success-light)] px-3 py-1 text-xs font-medium text-[var(--color-success)]">
                Connected
              </span>
            ) : (
              <a
                href="/api/integrations/zoho/connect"
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors"
              >
                Connect
              </a>
            )}
          </div>
        </div>

        {/* Tally — Coming Soon */}
        <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-white p-6 opacity-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-bg-secondary)]">
                <span className="text-lg font-bold text-[var(--color-text)]">T</span>
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">TallyPrime</p>
                <p className="text-xs text-[var(--color-text-secondary)]">Coming soon</p>
              </div>
            </div>
            <span className="text-xs text-[var(--color-text-muted)]">Planned</span>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-4">More</h2>
        <div className="space-y-3">
          <a href="/settings/billing" className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-white px-6 py-4 hover:bg-[var(--color-bg-secondary)] transition-colors">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Billing & Subscription</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Manage your plan and payment method</p>
            </div>
            <svg className="h-4 w-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </a>
          <a href="/settings/team" className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-white px-6 py-4 hover:bg-[var(--color-bg-secondary)] transition-colors">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Team Management</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Invite your CA or team members</p>
            </div>
            <svg className="h-4 w-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  )
}
