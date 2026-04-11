import { z } from "zod";

/**
 * Public environment access — safe for client and server components.
 *
 * Only `NEXT_PUBLIC_*` variables can live here. Anything secret belongs in
 * `env.ts`, which is `server-only`.
 *
 * Why a separate file? Importing `env.ts` from a client component would
 * trip the `server-only` guard. This file gives client code a typed view of
 * the public surface without leaking the rest.
 */

const nonEmpty = z
  .string()
  .min(1)
  .transform((s) => s.trim());

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_STATUS_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
  NEXT_PUBLIC_HCAPTCHA_SITE_KEY: nonEmpty.optional(),
});

// `process.env` is statically replaced by Next.js for `NEXT_PUBLIC_*` keys at
// build time, so this works in both client and server bundles.
const rawPublicEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_STATUS_URL: process.env.NEXT_PUBLIC_STATUS_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_HCAPTCHA_SITE_KEY: process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY,
};

export const publicEnv = publicEnvSchema.parse(rawPublicEnv);
export type PublicEnv = typeof publicEnv;
