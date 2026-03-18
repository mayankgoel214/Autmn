import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { getZohoAuthURL } from '@/lib/services/integrations/zoho/zoho-client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const authURL = getZohoAuthURL()
    return NextResponse.redirect(authURL)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate Zoho auth URL'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
