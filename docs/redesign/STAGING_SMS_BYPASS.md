# Staging SMS Bypass — Kickoff Prompt

> **Audience: AI coding assistants (Claude Code).** Directive reference — implement exactly as described; every guardrail is load-bearing. Humans can read this; the companion is Hossein's decision note in CLAUDE.md.
>
> **Paste into Claude Code at the start of the session.** Assumes `CLAUDE.md` auto-loads. Standalone from P56 — can run any time. **Do not merge into P56** — this is a security-sensitive change that deserves its own PR and its own review.

---

## Context

Hossein needs to test the customer status page (`/status`) in staging **without** a live Twilio account. Today, the flow at `POST /api/status/request-code` calls `sendSms()` which throws `"Twilio credentials not configured"` when `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` are unset. The route swallows the throw in a `try/catch`, so the user always sees the anti-enumeration OK response — but never receives a code, so they can't progress past the verify step.

The ask: a **server-gated** way to run the full status flow end-to-end without a real SMS provider. Fully transparent to the production build.

**Explicit anti-goals:**

- No client-side feature flag. The bypass must not be triggerable from any browser-controllable input.
- No weakening of the anti-enumeration guarantee. Phone-miss still looks identical to phone-hit from outside the server process.
- No leaking of the code in logs that end up in a shared tail (console is fine; shipped log aggregators are not).
- No relaxation of rate limits, phone hash, RLS, or `store_status_code` RPC. The only thing bypassed is the outbound Twilio call.
- No byte-level change to the production build's observable behaviour when the bypass env var is unset.

---

## Architectural rule reinforcement

CLAUDE.md rule #8 — "Customer status page is hostile-internet hardened" — stays intact. This bypass is a **dev-and-staging test harness**. It does **not** apply to production under any circumstance. The implementation must make this impossible to misconfigure.

CLAUDE.md rule #5 — "Secrets are server-only, never `NEXT_PUBLIC_*`" — applies. The bypass flag is a server env var. The bypassed code value returned to the client is only returned when the flag is on AND `NODE_ENV !== "production"` AND the reg+phone match a real record.

---

## What to build (in order — do not skip steps)

### Step 1 — Env var schema

File: `src/lib/env.ts`.

Add to the `serverEnvSchema`:

```ts
// Dev/staging only — returns the SMS code in the API response instead of
// sending via Twilio. See docs/redesign/STAGING_SMS_BYPASS.md. A runtime
// assertion in `serverEnv()` rejects this being `true` when NODE_ENV is
// "production".
STATUS_DEV_BYPASS_SMS: z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true"),
```

Extend the cached env-parsing function with a post-parse guard:

```ts
if (cached.STATUS_DEV_BYPASS_SMS && cached.NODE_ENV === "production") {
  throw new Error(
    "STATUS_DEV_BYPASS_SMS=true is forbidden in production. " +
      "Either unset the variable or deploy with NODE_ENV !== 'production'.",
  );
}
```

This throws at first call on boot — the Next.js app will fail to start rather than silently run a bypassed production. `server-only` import already prevents the flag being pulled into a client bundle.

Add the variable to `.env.example` with a leading comment explaining what it does and that it is forbidden in production.

### Step 2 — Route handler branch

File: `src/app/api/status/request-code/route.ts`.

Minimal diff — insert one branch between the `store_status_code` RPC and the `sendSms` call:

```ts
const bypass = env.STATUS_DEV_BYPASS_SMS && env.NODE_ENV !== "production";

if (phoneMatches && vehicle) {
  await supabase.rpc("store_status_code", {
    p_garage_id: vehicle.garage_id,
    p_vehicle_id: vehicle.id,
    p_phone_hash: phoneHash,
    p_reg_hash: regHash,
    p_code_hash: codeHash,
    p_expires_at: expiresAt.toISOString(),
    p_ip: ip,
  });

  if (bypass) {
    // Dev/staging: return the code instead of SMS-ing it. Also log once
    // so it's visible in server stdout during local testing. Do NOT log
    // in prod (the guard in serverEnv() already prevents us from getting
    // here when NODE_ENV === "production").
    console.warn(
      `[status] Dev-bypass code for ${reg}: ${code}  (expires ${expiresAt.toISOString()})`,
    );
    return padded(
      startMs,
      NextResponse.json({ ...OK_RESPONSE, devCode: code }),
    );
  }

  try {
    await sendSms(customerPhone, `Your vehicle status code: ${code}\nExpires in 10 minutes.`);
  } catch (err) {
    console.error("[status] SMS send failed:", err);
  }
}

return padded(startMs, NextResponse.json(OK_RESPONSE));
```

Critical rules:

1. **`devCode` is only attached when `phoneMatches && vehicle` is true.** When the reg or phone doesn't match, the response shape stays identical to today's `OK_RESPONSE` — anti-enumeration (rule #8) is preserved byte-for-byte.
2. **`devCode` never appears when `NODE_ENV === "production"`** (the `bypass` local short-circuits, and the env guard would have thrown at boot anyway).
3. **`sendSms` is not called in bypass mode.** Twilio credentials can be unset in staging.
4. **The `store_status_code` RPC still runs.** The code still hashes, expires in 10 minutes, is single-use. Nothing about the verify step changes.

### Step 3 — Audit log entry

File: `src/app/api/status/request-code/route.ts`.

Add an `audit_log` insert inside the bypass branch. CLAUDE.md rule #11 requires auditing reads of customer PII; a dev-bypass constitutes a staging trace we want to see:

```ts
await supabase.from("audit_log").insert({
  garage_id: vehicle.garage_id,
  actor_staff_id: null,
  kind: "status_dev_sms_bypass",
  entity_type: "vehicle",
  entity_id: vehicle.id,
  payload: { reg, ip, expires_at: expiresAt.toISOString() },
});
```

Note: `payload.code` must NOT be logged — the audit row records that a bypass happened, not the code itself.

### Step 4 — Client-side dev banner

File: `src/app/(public)/status/page.tsx`.

Change the `handleRequestCode` handler so that when the response includes `devCode`, the client renders a yellow banner above the code input:

```tsx
const [devCode, setDevCode] = useState<string | null>(null);

async function handleRequestCode(e: React.FormEvent) {
  e.preventDefault();
  setLoading(true);
  try {
    const r = await fetch("/api/status/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registration: reg, phone }),
    });
    const data = (await r.json()) as { ok?: boolean; devCode?: string; error?: string };
    if (!r.ok) {
      setError(data.error ?? "Request failed");
      return;
    }
    setDevCode(data.devCode ?? null);
    setStep("verify");
  } finally {
    setLoading(false);
  }
}
```

In the verify step, render the banner conditionally:

```tsx
{devCode ? (
  <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
    <div className="font-semibold">⚠ Dev bypass active</div>
    <div className="mt-1">
      Staging only — no SMS was sent. Your code is{" "}
      <span className="font-mono text-lg font-bold">{devCode}</span>
    </div>
  </div>
) : null}
```

Use existing `--warning` token (V1 theming). Don't add bespoke colours.

### Step 5 — Prevent client-side bypass injection

The client handler accepts `devCode` from the server response. A compromised router or an attacker MitM-ing staging-over-HTTP could inject a fake `devCode` to fool a tester into entering an arbitrary code. Mitigation:

- Staging MUST be served over HTTPS (TLS). Document in the deploy runbook.
- The `devCode` field type must be narrowed at the parse site — treat anything that isn't a 6-digit numeric string as `null`:

```ts
const raw = data.devCode;
setDevCode(typeof raw === "string" && /^\d{6}$/.test(raw) ? raw : null);
```

### Step 6 — Tests

New file: `tests/unit/status-dev-bypass.test.ts` (Vitest). Cover:

1. **Prod guard** — mock `serverEnv()` with `STATUS_DEV_BYPASS_SMS=true` + `NODE_ENV=production`; the `serverEnv()` call throws the specified error. Assert exact message.
2. **Bypass branch** — mock env with `STATUS_DEV_BYPASS_SMS=true` + `NODE_ENV=development`, stub `createSupabaseAdminClient` to return a matching vehicle + phone. Assert:
   - `sendSms` not called.
   - Response JSON contains `devCode` matching `/^\d{6}$/`.
   - `store_status_code` RPC was called.
   - `audit_log` insert with `kind='status_dev_sms_bypass'`.
3. **No-match anti-enumeration** — bypass on, vehicle lookup returns null. Response is the canonical `OK_RESPONSE` **without** `devCode`. Byte-identical to today's behaviour.
4. **Bypass off** — `STATUS_DEV_BYPASS_SMS=false` (default). Same test as #2 but assert `sendSms` IS called and response has no `devCode`.
5. **Rate limits still fire** — 4 requests within the hour trip the phone rate limit regardless of bypass.

Playwright spec: update the existing `tests/e2e/status-flow.spec.ts` (or create if missing). Add a scenario:

- Start staging with `STATUS_DEV_BYPASS_SMS=true`.
- Submit reg + phone.
- Expect the dev-bypass banner to render with a 6-digit code visible.
- Type the code into the verify input → land on status page.
- Assert the yellow banner does NOT appear when `STATUS_DEV_BYPASS_SMS` is unset.

### Step 7 — CI protection

Add a pre-deploy CI guard in `.github/workflows/deploy.yml` (or the Dokploy equivalent, once Phase 4 creates it). Before pushing to the production registry, fail the job if the build's effective env resolves `STATUS_DEV_BYPASS_SMS=true`:

```yaml
- name: Block dev SMS bypass in prod
  if: github.ref == 'refs/heads/main'
  run: |
    if [ "$STATUS_DEV_BYPASS_SMS" = "true" ]; then
      echo "ERROR: STATUS_DEV_BYPASS_SMS must be false (or unset) for production deploys"
      exit 1
    fi
```

The runtime `serverEnv()` guard is the primary defence; this CI check is belt-and-braces.

### Step 8 — Documentation

Update:

1. `CLAUDE.md > Architecture rules > Rule #8` — add a note:
   > **Dev-only exception:** `STATUS_DEV_BYPASS_SMS=true` with `NODE_ENV!="production"` returns the code inline for staging testing. Runtime-guarded; CI-guarded; see `docs/redesign/STAGING_SMS_BYPASS.md`.
2. `.env.example` — document the variable, default `false`, forbidden in production.
3. `docs/redesign/MASTER_PLAN.md` — log the shipping PR under the relevant phase.

---

## Do-not-do list

- ❌ Don't skip the runtime `NODE_ENV === "production"` guard. It is the only defence if the CI check is bypassed.
- ❌ Don't send the `devCode` field when the reg/phone doesn't match. That would break anti-enumeration.
- ❌ Don't log the code into any persistent log sink (structured logging services, Sentry, Vercel log drains). `console.warn` to stdout only.
- ❌ Don't expose the flag via a `NEXT_PUBLIC_*` variable.
- ❌ Don't extend the flag to other SMS paths (approval links, booking confirmations). If staging needs those too, copy this pattern as a dedicated flag per path — one blast radius per flag.
- ❌ Don't store the code in plaintext anywhere (`audit_log.payload` must not contain `code`).
- ❌ Don't weaken the phone hash, pepper, rate limits, or RPC invocation.

---

## Done when

1. `STATUS_DEV_BYPASS_SMS` parsed by zod; runtime assertion prevents it in prod.
2. Bypass branch in `request-code` route returns `devCode` only on phone-match.
3. `audit_log` row written on bypass (no code value).
4. Status page banner renders in staging with the code.
5. Five unit tests green + one Playwright scenario.
6. CI guard in place.
7. CLAUDE.md + .env.example + MASTER_PLAN updated.
8. Manual smoke: run `STATUS_DEV_BYPASS_SMS=true NODE_ENV=development pnpm dev`, submit reg+phone of a seeded customer, see banner, enter code, land on status. Run `NODE_ENV=production STATUS_DEV_BYPASS_SMS=true pnpm start` → process fails to boot with the expected error. Run `STATUS_DEV_BYPASS_SMS=false pnpm dev` with Twilio unset → SMS send throws, caught, no banner, full anti-enumeration preserved.

Report back with: files changed, test output, boot-guard screenshot (the error message), dev-banner screenshot on the status page, audit_log row sample.
