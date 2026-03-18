'use client'

import { useState, useEffect } from 'react'

interface Client {
  id: string
  companyId: string
  companyName: string
  cin: string | null
  entityType: string
  employeeCount: number
  gstRegistered: boolean
  gstNumber: string | null
  mcaStatus: string | null
  overdueCount: number
  upcomingCount: number
  totalObligations: number
  nextDeadline: { name: string; dueDate: string; status: string } | null
  notes: string | null
  addedAt: string
}

export default function CAPortalPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addCIN, setAddCIN] = useState('')
  const [addNotes, setAddNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetchClients()
  }, [])

  async function fetchClients() {
    const res = await fetch('/api/ca')
    const data = await res.json()
    setClients(data.clients || [])
    setLoading(false)
  }

  async function handleAddClient() {
    if (!addCIN) return
    setAdding(true)
    setMessage(null)
    const res = await fetch('/api/ca', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cin: addCIN, notes: addNotes }),
    })
    const data = await res.json()
    if (data.success) {
      setMessage({ text: `${data.companyName} added to your client list`, type: 'success' })
      setAddCIN('')
      setAddNotes('')
      setShowAdd(false)
      fetchClients()
    } else {
      setMessage({ text: data.error || 'Failed to add client', type: 'error' })
    }
    setAdding(false)
  }

  const totalOverdue = clients.reduce((sum, c) => sum + c.overdueCount, 0)
  const totalUpcoming = clients.reduce((sum, c) => sum + c.upcomingCount, 0)

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">CA Portal</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Manage compliance for all your client companies
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          Add Client
        </button>
      </div>

      {message && (
        <div className={`mt-4 rounded-lg p-3 text-sm ${
          message.type === 'success' ? 'bg-[var(--color-success-light)] text-[var(--color-success)]' : 'bg-[var(--color-error-light)] text-[var(--color-error)]'
        }`}>
          {message.text}
        </div>
      )}

      {/* Add Client Form */}
      {showAdd && (
        <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-white p-6">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">Add a client company</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Company CIN</label>
              <input
                type="text"
                placeholder="U72200KA2020PTC045678"
                value={addCIN}
                onChange={e => setAddCIN(e.target.value.toUpperCase())}
                maxLength={21}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-mono focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Notes (optional)</label>
              <input
                type="text"
                placeholder="e.g., Monthly GST + annual MCA"
                value={addNotes}
                onChange={e => setAddNotes(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAddClient}
                disabled={!addCIN || addCIN.length !== 21 || adding}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
              >
                {adding ? 'Adding...' : 'Add Company'}
              </button>
              <button
                onClick={() => { setShowAdd(false); setMessage(null) }}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="mt-6 grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-text)]">{clients.length}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">Total Clients</p>
        </div>
        <div className="rounded-lg border border-[var(--color-error)] border-opacity-20 bg-[var(--color-error-light)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-error)]">{totalOverdue}</p>
          <p className="text-xs text-[var(--color-error)]">Overdue Across All</p>
        </div>
        <div className="rounded-lg border border-[var(--color-warning)] border-opacity-20 bg-[var(--color-warning-light)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-warning)]">{totalUpcoming}</p>
          <p className="text-xs text-[var(--color-warning)]">Due This Week</p>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-center">
          <p className="text-2xl font-bold text-[var(--color-text)]">{clients.reduce((s, c) => s + c.totalObligations, 0)}</p>
          <p className="text-xs text-[var(--color-text-secondary)]">Total Obligations</p>
        </div>
      </div>

      {/* Client List */}
      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] animate-pulse" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-light)]">
              <svg className="h-6 w-6 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-[var(--color-text)]">No clients yet</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Add your first client company by entering their CIN. AUTMN will automatically map their compliance obligations.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-4 inline-flex items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors"
            >
              Add Your First Client
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map(client => (
              <div key={client.id} className="rounded-lg border border-[var(--color-border)] bg-white p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    {/* Status indicator */}
                    <div className={`mt-1 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${
                      client.overdueCount > 0 ? 'bg-[var(--color-error)]' :
                      client.upcomingCount > 0 ? 'bg-[var(--color-warning)]' :
                      'bg-[var(--color-success)]'
                    }`}>
                      {client.overdueCount > 0 ? client.overdueCount : '✓'}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--color-text)]">{client.companyName}</h3>
                      <p className="text-xs font-mono text-[var(--color-text-secondary)]">{client.cin}</p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
                        <span>{client.entityType.replace(/_/g, ' ')}</span>
                        <span>{client.employeeCount} employees</span>
                        {client.gstRegistered && <span className="text-[var(--color-success)]">GST: {client.gstNumber || 'Registered'}</span>}
                        <span className={client.mcaStatus === 'Active' ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}>{client.mcaStatus}</span>
                      </div>
                      {client.notes && (
                        <p className="mt-1 text-xs text-[var(--color-text-muted)] italic">{client.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-3">
                      {client.overdueCount > 0 && (
                        <span className="rounded-full bg-[var(--color-error-light)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-error)]">
                          {client.overdueCount} overdue
                        </span>
                      )}
                      <span className="rounded-full bg-[var(--color-bg-secondary)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
                        {client.totalObligations} obligations
                      </span>
                    </div>
                    {client.nextDeadline && (
                      <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                        Next: {client.nextDeadline.name} — {client.nextDeadline.dueDate}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
