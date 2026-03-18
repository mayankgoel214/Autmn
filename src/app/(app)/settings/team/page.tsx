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
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('TEAM_MEMBER')
  const [inviting, setInviting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/team').then(r => r.json()).then(d => {
      setMembers(d.members || [])
      setLoading(false)
    })
  }, [])

  async function handleInvite() {
    setInviting(true)
    setMessage(null)
    const res = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, name: inviteName, role: inviteRole }),
    })
    const data = await res.json()
    if (data.success) {
      setMessage(data.message)
      setInviteEmail('')
      setInviteName('')
      setShowInvite(false)
      // Refresh members
      const r = await fetch('/api/team')
      const d = await r.json()
      setMembers(d.members || [])
    } else {
      setMessage(data.error || 'Failed to invite')
    }
    setInviting(false)
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Team</h1>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          Invite Member
        </button>
      </div>

      {message && (
        <div className="mt-4 rounded-lg bg-[var(--color-primary-light)] p-3 text-sm text-[var(--color-primary)]">
          {message}
        </div>
      )}

      {/* Invite Form */}
      {showInvite && (
        <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-white p-6">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Invite a team member</h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Name"
              value={inviteName}
              onChange={e => setInviteName(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <input
              type="email"
              placeholder="Email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            >
              <option value="TEAM_MEMBER">Team Member (view only)</option>
              <option value="CA_ADVISOR">CA / Advisor (view + file)</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleInvite}
                disabled={!inviteEmail || inviting}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
              >
                {inviting ? 'Inviting...' : 'Send Invite'}
              </button>
              <button
                onClick={() => setShowInvite(false)}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Members List */}
      <div className="mt-6 rounded-lg border border-[var(--color-border)] bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-[var(--color-text-secondary)]">Loading...</div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {members.map(member => (
              <div key={member.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">{member.name || member.email}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">{member.email}</p>
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
  )
}
