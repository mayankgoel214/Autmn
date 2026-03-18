import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // @ts-expect-error — Stripe SDK type expects latest version
  apiVersion: '2025-02-24.acacia',
})

/**
 * AUTMN Pricing Plans
 *
 * Free: Calendar + alerts (no payment needed)
 * Starter: ₹2,000/month — GST computation, Zoho integration
 * Growth: ₹6,000/month — Filing, TDS, health score, regulatory
 */
export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    priceId: null, // No Stripe price — it's free
    features: [
      'Company profiling from CIN',
      'Full compliance calendar',
      'Deadline email alerts',
      'Basic health score',
    ],
  },
  starter: {
    name: 'Starter',
    price: 2000,
    priceId: process.env.STRIPE_STARTER_PRICE_ID || null,
    features: [
      'Everything in Free',
      'Zoho Books integration',
      'GST computation + GSTR prep',
      'TDS rate lookup',
      'ITC reconciliation',
    ],
  },
  growth: {
    name: 'Growth',
    price: 6000,
    priceId: process.env.STRIPE_GROWTH_PRICE_ID || null,
    features: [
      'Everything in Starter',
      'GST auto-filing via API',
      'TDS computation',
      'Advance tax estimates',
      'Investor-ready PDF reports',
      'Regulatory intelligence',
      'Team management (CA portal)',
    ],
  },
} as const

export type PlanKey = keyof typeof PLANS

/**
 * Create a Stripe Checkout session for a subscription.
 */
export async function createCheckoutSession(
  customerEmail: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string,
  metadata?: Record<string, string>
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: customerEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  })

  return session.url!
}

/**
 * Create a Stripe Customer Portal session (for managing subscription).
 */
export async function createPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })

  return session.url
}

/**
 * Get subscription status for a customer.
 */
export async function getSubscriptionStatus(customerId: string): Promise<{
  active: boolean
  plan: string | null
  currentPeriodEnd: Date | null
}> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  })

  if (subscriptions.data.length === 0) {
    return { active: false, plan: null, currentPeriodEnd: null }
  }

  const sub = subscriptions.data[0]
  return {
    active: true,
    plan: (sub.metadata?.plan as string) || null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    currentPeriodEnd: new Date(((sub as any).current_period_end || 0) * 1000),
  }
}
