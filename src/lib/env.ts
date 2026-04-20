import "server-only";
import { z } from "zod";

/**
 * Server-only environment access.
 *
 * Anything imported from this file MUST NOT be referenced by client components.
 * The `server-only` import is the static guard: importing this file from a
 * client component fails the build.
 *
 * Why parse with zod?
 *  - Catches missing/typo'd variables at boot, not at the first request.
 *  - Forces a single declared shape — no `process.env.WHATEVER` drive-bys.
 *  - Strips empty strings to undefined so optional fields behave correctly.
 */

const nonEmpty = z
  .string()
  .min(1)
  .transform((s) => s.trim());
const optionalNonEmpty = nonEmpty.optional();

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  SUPABASE_JWT_SECRET: nonEmpty,

  // Twilio
  TWILIO_ACCOUNT_SID: optionalNonEmpty,
  TWILIO_AUTH_TOKEN: optionalNonEmpty,
  TWILIO_FROM_NUMBER: optionalNonEmpty,
  TWILIO_WEBHOOK_BASE_URL: optionalNonEmpty,

  // DVSA Trade API — OAuth2 + API key
  DVSA_CLIENT_ID: optionalNonEmpty,
  DVSA_CLIENT_SECRET: optionalNonEmpty,
  DVSA_TENANT_ID: optionalNonEmpty,
  DVSA_SCOPE: optionalNonEmpty,
  DVSA_API_KEY: optionalNonEmpty,              // x-api-key header
  DVSA_BASE_URL: optionalNonEmpty,             // Trade API (vehicle info + MOT)
  DVSA_HISTORY_BASE_URL: optionalNonEmpty,     // MOT history (if separate)

  // Crypto
  APPROVAL_HMAC_SECRET: nonEmpty,
  STATUS_PHONE_PEPPER: nonEmpty,
  KIOSK_PAIRING_SECRET: nonEmpty,
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: optionalNonEmpty,

  // hCaptcha
  NEXT_PUBLIC_HCAPTCHA_SITE_KEY: optionalNonEmpty,
  HCAPTCHA_SECRET: optionalNonEmpty,

  // App
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_STATUS_URL: z.string().url(),

  /** Dev/staging only — returns the SMS code inline in the
   *  /api/status/request-code response instead of dispatching via
   *  Twilio. See docs/redesign/STAGING_SMS_BYPASS.md. A runtime
   *  assertion in `serverEnv()` below FORBIDS this being `true`
   *  when NODE_ENV === 'production'. */
  STATUS_DEV_BYPASS_SMS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Lazily parses + caches the validated environment. Safe to call from any
 * server module. Throws an aggregated error at first call if anything is
 * missing or malformed.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid server environment. Missing or malformed variables:\n${issues}\n\n` +
        `See .env.example for the complete list.`,
    );
  }
  // STATUS_DEV_BYPASS_SMS prod-guard — fail the boot loudly rather
  // than silently run a bypassed production. CI also guards at
  // deploy time (see docs/redesign/STAGING_SMS_BYPASS.md Step 7),
  // but this is the last-resort runtime defence.
  if (parsed.data.STATUS_DEV_BYPASS_SMS && parsed.data.NODE_ENV === "production") {
    throw new Error(
      "STATUS_DEV_BYPASS_SMS=true is forbidden in production. " +
        "Either unset the variable or deploy with NODE_ENV !== 'production'.",
    );
  }

  cached = parsed.data;
  return cached;
}
