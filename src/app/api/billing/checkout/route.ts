import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { createCheckoutSession, PLANS, type PlanKey } from '@/lib/billing/stripe'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { plan } = body as { plan: PlanKey }

  if (!plan || !PLANS[plan]) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const planConfig = PLANS[plan]
  if (!planConfig.priceId) {
    return NextResponse.json({ error: 'This plan does not require payment' }, { status: 400 })
  }

  try {
    const url = await createCheckoutSession(
      session.user.email,
      planConfig.priceId,
      `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
      `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
      { plan, userId: session.user.id || '' }
    )

    return NextResponse.json({ url })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
