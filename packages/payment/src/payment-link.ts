import { z } from 'zod';
import { getRazorpayClient } from './client.js';
import type { CreatePaymentLinkParams } from './types.js';

const DEFAULT_EXPIRES_IN_MINUTES = 30;
const DEFAULT_DESCRIPTION = 'Autmn - Professional Product Photo';

const CreatePaymentLinkSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  customerPhone: z
    .string()
    .regex(/^\d{10,15}$/, 'customerPhone must be digits only, e.g. "919876543210"'),
  customerName: z.string().optional(),
  amount: z
    .number()
    .int('amount must be an integer (paise)')
    .min(100, 'amount must be at least 100 paise (Rs 1)'),
  description: z.string().optional(),
  expiresInMinutes: z.number().int().positive().optional(),
  paymentMethods: z
    .object({
      upi: z.boolean().optional(),
      card: z.boolean().optional(),
      wallet: z.boolean().optional(),
      netbanking: z.boolean().optional(),
      emi: z.boolean().optional(),
      paylater: z.boolean().optional(),
    })
    .optional(),
});

/** Phase 12a — UPI-only default. Any override merges over these falses. */
const UPI_ONLY_METHODS = {
  upi: true,
  card: false,
  wallet: false,
  netbanking: false,
  emi: false,
  paylater: false,
} as const;

export interface CreatedPaymentLink {
  id: string;
  shortUrl: string;
  /** Amount in paise */
  amount: number;
  /** Unix timestamp (seconds) when the link expires */
  expiresAt: number;
}

/**
 * Build the Razorpay payment-link payload — extracted so smoke tests can
 * assert UPI-only restrictions without hitting the live SDK. Returns the
 * exact object passed to `client.paymentLink.create()`. Side-effect-free.
 */
export function buildPaymentLinkPayload(
  params: CreatePaymentLinkParams,
): { payload: Record<string, unknown>; expireBy: number } {
  const parsed = CreatePaymentLinkSchema.safeParse(params);
  if (!parsed.success) {
    throw new Error(`Invalid payment link params: ${parsed.error.message}`);
  }

  const {
    orderId, customerPhone, customerName, amount, description,
    expiresInMinutes, paymentMethods,
  } = parsed.data;

  const expiryMinutes = expiresInMinutes ?? DEFAULT_EXPIRES_IN_MINUTES;
  const expireBy = Math.floor(Date.now() / 1000) + expiryMinutes * 60;
  const callbackUrl = process.env.RAZORPAY_CALLBACK_URL;

  // Phase 12a — UPI-only default; explicit override (test/staging) merges on top.
  const methods = { ...UPI_ONLY_METHODS, ...(paymentMethods ?? {}) };

  const payload: Record<string, unknown> = {
    amount,
    currency: 'INR',
    accept_partial: false,
    reference_id: orderId,
    description: description ?? DEFAULT_DESCRIPTION,
    customer: {
      contact: `+${customerPhone}`,
      ...(customerName ? { name: customerName } : {}),
    },
    notify: { sms: false, email: false },
    reminder_enable: false,
    // upi_link fires the UPI Intent Flow from the short_url itself
    // (deep-links into the user's default UPI app on mobile).
    upi_link: methods.upi === true,
    expire_by: expireBy,
    options: { checkout: { method: methods } },
  };
  if (callbackUrl) {
    payload['callback_url'] = callbackUrl;
    payload['callback_method'] = 'get';
  }
  return { payload, expireBy };
}

/**
 * Creates a Razorpay Payment Link.
 *
 * - Sets reference_id to orderId for idempotent deduplication.
 * - Enables upi_link for UPI-first experience (best conversion in India).
 * - Skips SMS/email notifications — Autmn delivers the link via WhatsApp.
 * - Amount is NEVER taken from the client; always pass from verified server state.
 */
export async function createPaymentLink(
  params: CreatePaymentLinkParams
): Promise<CreatedPaymentLink> {
  const { payload, expireBy } = buildPaymentLinkPayload(params);

  const client = getRazorpayClient();
  // Razorpay SDK types don't expose paymentLinks natively in all versions,
  // so we cast to any and rely on the underlying HTTP call.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const razorpay = client as any;

  let response: Record<string, unknown>;

  try {
    response = (await razorpay.paymentLink.create(payload)) as Record<
      string,
      unknown
    >;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown Razorpay error';
    throw new Error(`Failed to create Razorpay Payment Link: ${message}`);
  }

  if (!response['id'] || !response['short_url']) {
    throw new Error(
      `Razorpay Payment Link creation returned unexpected response: ${JSON.stringify(response)}`
    );
  }

  return {
    id: response['id'] as string,
    shortUrl: response['short_url'] as string,
    amount: response['amount'] as number,
    expiresAt: expireBy,
  };
}
