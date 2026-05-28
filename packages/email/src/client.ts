/**
 * Resend wrapper — keeps the SDK import lazy so callers without RESEND_API_KEY
 * (smoke tests, dry-run worker) don't crash on import. The actual send
 * happens at call time.
 */

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text fallback. Improves deliverability into Gmail. */
  text?: string;
  /** Override the default sender; defaults to FROM_EMAIL env or noreply@autmn.app. */
  from?: string;
  /** Optional Reply-To header. */
  replyTo?: string;
}

export interface SendEmailResult {
  /** Resend message id. */
  id: string;
}

export class EmailSendError extends Error {
  // `cause` is on Error since ES2022 — declare it as a proper override.
  override cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'EmailSendError';
    if (cause !== undefined) this.cause = cause;
  }
}

const DEFAULT_FROM = 'Autmn <noreply@autmn.app>';

/**
 * Send a transactional email via Resend.
 *
 * Throws EmailSendError if RESEND_API_KEY is unset or Resend returns an error.
 * Callers in production paths should catch and log to Sentry so a missing
 * API key never blocks the user-facing flow that triggered the email.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) {
    throw new EmailSendError('RESEND_API_KEY is not configured');
  }
  const from = params.from ?? process.env['FROM_EMAIL'] ?? DEFAULT_FROM;

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);

  try {
    const result = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    });
    // resend SDK returns { data: { id }, error: null } on success.
    if (result.error) {
      throw new EmailSendError(`Resend returned error: ${result.error.message}`, result.error);
    }
    const id = (result.data as { id?: string } | null)?.id;
    if (!id) {
      throw new EmailSendError('Resend response missing message id');
    }
    return { id };
  } catch (err) {
    if (err instanceof EmailSendError) throw err;
    throw new EmailSendError(
      `Failed to send email: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
