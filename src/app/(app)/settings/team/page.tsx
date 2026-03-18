'use client'

import { useState, useEffect } from 'react'

interface Member {
  id: string
  name: string | null
  email: string
  role: string
  createdAt: string
}

const ROLE_LABELS: Record<string, string> = {
  FOUNDER: 'Founder',
  ADMIN: 'Admin',
  CA_ADVISOR: 'CA / Advisor',
  TEAM_MEMBER: 'Team Member',
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [noCompany, setNoCompany] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('TEAM_MEMBER')
  const [inviting, setInviting] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetch('/api/team')
      .then(r => r.json())
      .then(d => {
        if (d.error === 'No company') {
          setNoCompany(true)
        } else {
          setMembers(d.members || [])
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function handleInvite() {
    if (!inviteEmail) return
    setInviting(true)
    setMessage(null)
    const res = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, name: inviteName, role: inviteRole }),
    })
    const data = await res.json()
    if (data.success) {
      setMessage({ text: data.message || 'Team member invited successfully', type: 'success' })
      setInviteEmail('')
      setInviteName('')
      setShowInvite(false)
      // Refresh members
      const r = await fetch('/api/team')
      const d = await r.json()
      setMembers(d.members || [])
    } else {
      setMessage({ text: data.error || 'Failed to invite', type: 'error' })
    }
    setInviting(false)
  }

  if (loading) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Team</h1>
        <div className="mt-8 space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-16 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (noCompany) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Team</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Invite your CA, accountant, or team members to collaborate on compliance.
        </p>
        <div className="mt-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-light)]">
            <svg className="h-6 w-6 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-[var(--color-text)]">Set up your company first</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            You need to complete your company profile before inviting team members.
          </p>
          <a
            href="/onboarding/cin"
            className="mt-6 inline-flex items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Set up company
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">Team</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Manage who has access to your compliance dashboard
          </p>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          Invite Member
        </button>
      </div>

      {message && (
        <div className={`mt-4 rounded-lg p-3 text-sm ${
          message.type === 'success'
            ? 'bg-[var(--color-success-light)] text-[var(--color-success)]'
            : 'bg-[var(--color-error-light)] text-[var(--color-error)]'
        }`}>
          {message.text}
        </div>
      )}

      {/* Invite Form */}
      {showInvite && (
        <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-white p-6">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Invite a team member</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Name</label>
              <input
                type="text"
                placeholder="Their full name"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Email</label>
              <input
                type="email"
                placeholder="their@email.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              >
                <option value="TEAM_MEMBER">Team Member — can view dashboard and calendar</option>
                <option value="CA_ADVISOR">CA / Advisor — can view, prepare, and file returns</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleInvite}
                disabled={!inviteEmail || inviting}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
              >
                {inviting ? 'Sending...' : 'Send Invite'}
              </button>
              <button
                onClick={() => { setShowInvite(false); setMessage(null) }}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Permissions Info */}
      <div className="mt-6 rounded-lg border border-[var(--color-border)] bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Role Permissions</p>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          <div className="px-6 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Founder / Admin</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Full access — manage company, team, integrations, billing, filings</p>
            </div>
            <span className="rounded-full bg-[var(--color-primary-light)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-primary)]">Full</span>
          </div>
          <div className="px-6 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">CA / Advisor</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Can view dashboard, prepare returns, approve and file — cannot manage team or billing</p>
            </div>
            <span className="rounded-full bg-[var(--color-warning-light)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-warning)]">File</span>
          </div>
          <div className="px-6 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Team Member</p>
              <p className="text-xs text-[var(--color-text-secondary)]">View-only access to dashboard, calendar, and filings — cannot file or change settings</p>
            </div>
            <span className="rounded-full bg-[var(--color-bg-secondary)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">View</span>
          </div>
        </div>
      </div>

      {/* Members List */}
      <div className="mt-6">
        <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-3">
          Members ({members.length})
        </p>
        <div className="rounded-lg border border-[var(--color-border)] bg-white overflow-hidden">
          {members.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">You&apos;re the only member. Invite your CA or team to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {members.map(member => (
                <div key={member.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-bg-secondary)] text-sm font-medium text-[var(--color-text)]">
                      {(member.name || member.email)[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{member.name || 'Invited'}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">{member.email}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    member.role === 'FOUNDER' ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' :
                    member.role === 'CA_ADVISOR' ? 'bg-[var(--color-warning-light)] text-[var(--color-warning)]' :
                    'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]'
                  }`}>
                    {ROLE_LABELS[member.role] || member.role}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
