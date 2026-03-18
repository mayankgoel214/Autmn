import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { prisma } from '@/lib/db/prisma'
import { exchangeCodeForTokens, getOrganizations } from '@/lib/services/integrations/zoho/zoho-client'

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    console.error('Zoho OAuth denied:', error)
    return NextResponse.redirect(new URL(`/settings?error=zoho_denied`, request.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL(`/settings?error=no_code`, request.url))
  }

  try {
    // Exchange code for tokens
    console.log('Exchanging Zoho code for tokens...')
    const tokens = await exchangeCodeForTokens(code)
    console.log('Got tokens. Access token length:', tokens.accessToken?.length, 'Refresh token:', !!tokens.refreshToken)

    // Get organization ID — try both .com and .in API URLs
    console.log('Fetching Zoho organizations...')
    let orgs = await getOrganizations(tokens.accessToken)
    console.log('Organizations found:', orgs.length, JSON.stringify(orgs))

    // If no orgs found, the user might not have Zoho Books set up — skip org requirement and store tokens anyway
    const org = orgs[0]

    // Get user's company
    const user = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!user?.companyId) {
      return NextResponse.redirect(new URL(`/settings?error=no_company`, request.url))
    }

    // Store tokens even if no org — user might set up Zoho Books later
    await prisma.integrationToken.upsert({
      where: {
        companyId_provider: { companyId: user.companyId, provider: 'zoho_books' },
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        metadata: org
          ? { organizationId: org.organizationId, organizationName: org.name }
          : { status: 'connected_no_org' },
      },
      create: {
        companyId: user.companyId,
        provider: 'zoho_books',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        metadata: org
          ? { organizationId: org.organizationId, organizationName: org.name }
          : { status: 'connected_no_org' },
      },
    })

    console.log('Zoho tokens stored successfully')
    return NextResponse.redirect(new URL(`/settings?success=zoho_connected`, request.url))
  } catch (err) {
    console.error('Zoho callback error:', err)
    return NextResponse.redirect(new URL(`/settings?error=zoho_failed`, request.url))
  }
}
