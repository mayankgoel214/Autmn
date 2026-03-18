import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY

if (!apiKey) {
  console.warn('GEMINI_API_KEY not set — AI features will not work')
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

export function getGeminiModel(model: string = 'gemini-2.5-flash') {
  if (!genAI) {
    throw new Error('Gemini API key not configured')
  }
  return genAI.getGenerativeModel({ model })
}

export async function generateText(prompt: string, systemPrompt?: string): Promise<string> {
  const model = getGeminiModel()

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: systemPrompt ? { role: 'system', parts: [{ text: systemPrompt }] } : undefined,
  })

  return result.response.text()
}

export async function* streamText(
  messages: Array<{ role: 'user' | 'model'; text: string }>,
  systemPrompt?: string
): AsyncGenerator<string> {
  const model = getGeminiModel()

  const contents = messages.map(m => ({
    role: m.role,
    parts: [{ text: m.text }],
  }))

  const result = await model.generateContentStream({
    contents,
    systemInstruction: systemPrompt ? { role: 'system', parts: [{ text: systemPrompt }] } : undefined,
  })

  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) yield text
  }
}
