import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { streamText } from '@/lib/ai/gemini-client'
import { ONBOARDING_SYSTEM_PROMPT, buildOnboardingContext } from '@/lib/ai/prompts/onboarding'
import { updateCompanyProfile } from '@/lib/services/company/profile-updater'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await request.json()
  const { messages, companyId, profileUpdate } = body as {
    messages: Array<{ role: 'user' | 'model'; text: string }>
    companyId: string
    profileUpdate?: { field: string; value: string }
  }

  if (!companyId) {
    return new Response('Company ID required', { status: 400 })
  }

  // Apply profile update if provided (from previous answer)
  if (profileUpdate) {
    await updateCompanyProfile(companyId, profileUpdate.field, profileUpdate.value)
  }

  // Get company data for context
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { directors: true },
  })

  if (!company) {
    return new Response('Company not found', { status: 404 })
  }

  // Build the system prompt with company context
  const companyContext = buildOnboardingContext({
    companyName: company.companyName,
    entityType: company.entityType,
    registeredState: company.registeredState,
    dateOfIncorporation: company.dateOfIncorporation?.toISOString().split('T')[0] || null,
    authorizedCapital: company.authorizedCapital?.toString() || '0',
    paidUpCapital: company.paidUpCapital?.toString() || '0',
    directors: company.directors.map(d => ({
      name: d.name,
      designation: d.designation,
    })),
  })

  const systemPrompt = ONBOARDING_SYSTEM_PROMPT + '\n\n' + companyContext

  // Gemini requires at least one user message — if empty (first call), add a kickoff message
  const chatMessages = messages.length > 0
    ? messages
    : [{ role: 'user' as const, text: 'Start the onboarding conversation. Greet me and ask the first question.' }]

  // Stream the AI response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamText(chatMessages, systemPrompt)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`))
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
        controller.close()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'AI error'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
