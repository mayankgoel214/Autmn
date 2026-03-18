import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { lookupCompanyByCIN } from '@/lib/services/company/company.service'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { cin } = body

  if (!cin || typeof cin !== 'string') {
    return NextResponse.json({ success: false, error: 'CIN is required' }, { status: 400 })
  }

  const result = await lookupCompanyByCIN(cin)

  // Serialize BigInt values to strings for JSON
  return NextResponse.json(result)
}
