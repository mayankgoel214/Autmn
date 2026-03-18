'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Message {
  role: 'user' | 'model'
  text: string
}

// Maps question number to the profile field it updates
const QUESTION_FIELD_MAP: Record<number, string> = {
  1: 'employee_count',
  2: 'annual_turnover',
  3: 'gst_number',
  4: 'operating_states',
  5: 'foreign_investment',
  6: 'dpiit',
  7: 'industry_sector',
  8: 'pf_registered',
}

export default function OnboardingProfilePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const companyId = searchParams.get('companyId')
  const companyName = searchParams.get('companyName')

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [questionCount, setQuestionCount] = useState(0)
  const [complete, setComplete] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Start conversation on mount (only once)
  const startedRef = useRef(false)
  useEffect(() => {
    if (companyId && !startedRef.current) {
      startedRef.current = true
      sendToAI([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  async function sendToAI(
    currentMessages: Message[],
    profileUpdate?: { field: string; value: string }
  ) {
    setStreaming(true)

    try {
      const response = await fetch('/api/onboarding/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: currentMessages,
          companyId,
          profileUpdate,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let aiText = ''

      // Add empty AI message to fill in
      setMessages(prev => [...prev, { role: 'model', text: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.text) {
                aiText += data.text
                setMessages(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: 'model', text: aiText }
                  return updated
                })
              }
              if (data.done) {
                setQuestionCount(prev => prev + 1)
                // Check if onboarding is complete
                if (aiText.toLowerCase().includes('profile is complete') ||
                    aiText.toLowerCase().includes('identified') ||
                    questionCount >= 7) {
                  setComplete(true)
                }
              }
              if (data.error) {
                aiText += '\n\n(AI temporarily unavailable. Please refresh and try again.)'
                setMessages(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: 'model', text: aiText }
                  return updated
                })
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'model', text: 'Sorry, I encountered an error. Please refresh and try again.' },
      ])
    } finally {
      setStreaming(false)
    }
  }

  async function handleSend() {
    if (!input.trim() || streaming) return

    const userMessage: Message = { role: 'user', text: input.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // Determine which field this answer updates
    const field = QUESTION_FIELD_MAP[questionCount] || undefined
    const profileUpdate = field ? { field, value: input.trim() } : undefined

    await sendToAI(newMessages, profileUpdate)
    setLoading(false)
  }

  async function handleComplete() {
    // Mark onboarding as complete
    await fetch('/api/onboarding/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [],
        companyId,
        profileUpdate: { field: 'onboarding_complete', value: 'true' },
      }),
    })
    router.push('/dashboard')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!companyId) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <p className="text-[var(--color-text-secondary)]">
          No company selected.{' '}
          <a href="/onboarding/cin" className="text-[var(--color-primary)] hover:underline">
            Go back to CIN lookup
          </a>
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 7rem)' }}>
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">
          Setting up your compliance profile
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {companyName || 'Your company'} — answering a few questions to identify your obligations
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-bg-secondary)] text-[var(--color-text)] border border-[var(--color-border)]'
              }`}
            >
              {msg.role === 'model' && (
                <p className="text-xs font-medium text-[var(--color-primary)] mb-1">AUTMN</p>
              )}
              {msg.text || (streaming && i === messages.length - 1 ? '...' : '')}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input or Complete button */}
      {complete ? (
        <div className="border-t border-[var(--color-border)] pt-4">
          <button
            onClick={handleComplete}
            className="w-full rounded-lg bg-[var(--color-primary)] px-4 py-3 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      ) : (
        <div className="border-t border-[var(--color-border)] pt-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={streaming || loading}
              placeholder="Type your answer..."
              className="flex-1 rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || streaming || loading}
              className="rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
