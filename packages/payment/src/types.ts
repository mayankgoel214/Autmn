export type PaymentLinkStatus =
  | 'created'
  | 'paid'
  | 'partially_paid'
  | 'expired'
  | 'cancelled';

/**
 * Restricts which payment methods the Razorpay hosted page offers.
 * Phase 12a — defaults to UPI-only because that's the only method we accept.
 * Pass overrides if you ever need to test cards on staging.
 */
export interface PaymentMethodsConfig {
  upi?: boolean;
  card?: boolean;
  wallet?: boolean;
  netbanking?: boolean;
  emi?: boolean;
  paylater?: boolean;
}

export interface CreatePaymentLinkParams {
  /** Internal order ID used as the Razorpay reference_id for deduplication */
  orderId: string;
  /** Customer phone in E.164 format without '+', e.g. "919876543210" */
  customerPhone: string;
  customerName?: string;
  /** Amount in paise. Rs 99 = 9900 paise. */
  amount: number;
  description?: string;
  /** How long until the link expires. Defaults to 30 minutes. */
  expiresInMinutes?: number;
  /**
   * Phase 12a — payment methods the hosted page exposes. Defaults to UPI-only
   * (`{ upi: true }` plus everything else `false`). Razorpay's hosted page,
   * when restricted to UPI only, surfaces the UPI app icons (GPay / PhonePe
   * / Paytm / Amazon Pay UPI / WhatsApp Pay / BHIM) at the top + a UPI ID
   * input below, and on mobile fires the platform UPI intent natively.
   */
  paymentMethods?: PaymentMethodsConfig;
}

export interface PaymentLinkResponse {
  /** Razorpay Payment Link ID, e.g. "plink_AbCdEf123456" */
  id: string;
  /** Short URL to share with the customer */
  short_url: string;
  /** Amount in paise */
  amount: number;
  status: PaymentLinkStatus;
}

// ---------------------------------------------------------------------------
// Razorpay webhook types
// ---------------------------------------------------------------------------

interface RazorpayWebhookPaymentLinkEntity {
  id: string;
  /** Paise */
  amount: number;
  amount_paid: number;
  currency: string;
  status: PaymentLinkStatus;
  /** Maps to our internal order ID */
  reference_id: string;
  short_url: string;
  expire_by: number;
  created_at: number;
  updated_at: number;
  customer: {
    contact: string;
    name?: string;
    email?: string;
  };
  payments: RazorpayWebhookPaymentItem[] | null;
}

interface RazorpayWebhookPaymentItem {
  razorpay_payment_id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  created_at: number;
}

/** Webhook payload shape for the payment_link.paid event */
export interface RazorpayWebhookEvent {
  entity: 'event';
  account_id: string;
  event: 'payment_link.paid';
  contains: string[];
  payload: {
    payment_link: {
      entity: RazorpayWebhookPaymentLinkEntity;
    };
    payment?: {
      entity: {
        id: string;
        amount: number;
        currency: string;
        status: string;
        method: string;
        order_id?: string;
        description?: string;
        created_at: number;
      };
    };
  };
  created_at: number;
}
