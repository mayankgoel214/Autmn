import { z } from 'zod';

const isDev = process.env.NODE_ENV !== 'production';

const optionalInDev = (schema: z.ZodString) =>
  isDev ? schema.or(z.string().default('placeholder')) : schema;

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // WhatsApp Cloud API — required in production, placeholder allowed in dev
  WHATSAPP_ACCESS_TOKEN: optionalInDev(z.string().min(1)),
  WHATSAPP_PHONE_NUMBER_ID: optionalInDev(z.string().min(1)),
  WHATSAPP_VERIFY_TOKEN: optionalInDev(z.string().min(1)),
  WHATSAPP_APP_SECRET: optionalInDev(z.string().min(1)),

  // Razorpay — required in production, placeholder allowed in dev
  RAZORPAY_KEY_ID: optionalInDev(z.string().min(1)),
  RAZORPAY_KEY_SECRET: optionalInDev(z.string().min(1)),
  RAZORPAY_WEBHOOK_SECRET: optionalInDev(z.string().min(1)),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1),

  // AI (validated in worker, optional here)
  FAL_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),

  // Admin — required in production, optional in dev
  ADMIN_SECRET: optionalInDev(z.string().min(1)),

  // Refund magic-link signing secret + the founder email refund requests go to.
  // Boot-validated so a missing/short value fails fast at startup instead of at
  // refund-send time (which would read like an outage, not a config error).
  REFUND_DECISION_SECRET: optionalInDev(z.string().min(32)),
  ADMIN_EMAIL: optionalInDev(z.string().email()),

  // Sentry — always optional
  SENTRY_DSN: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

// Secrets that are allowed to default to 'placeholder' in dev (via
// optionalInDev) but MUST be real in production. A literal 'placeholder'
// here means HMAC verification / admin auth / payments are effectively
// disabled — fail fast rather than serve insecure traffic.
// See ADR-0001 invariant #3.
const PROD_REQUIRED_SECRETS = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'ADMIN_SECRET',
  'REFUND_DECISION_SECRET',
  'ADMIN_EMAIL',
] as const satisfies readonly (keyof Config)[];

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error('Invalid environment variables:');
      for (const issue of result.error.issues) {
        console.error(`  ${issue.path.join('.')}: ${issue.message}`);
      }
      process.exit(1);
    }
    _config = result.data;

    if (_config.NODE_ENV === 'production') {
      const stillPlaceholder = PROD_REQUIRED_SECRETS.filter(
        (key) => _config![key] === 'placeholder',
      );
      if (stillPlaceholder.length > 0) {
        console.error(
          `FATAL: these secrets are still 'placeholder' in production: ${stillPlaceholder.join(', ')}. ` +
            'Set real values before deploying.',
        );
        process.exit(1);
      }
    }
  }
  return _config;
}
