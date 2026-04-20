"use client";

import { useEffect, useState } from "react";
import {
  Car,
  Shield,
  Phone,
  MapPin,
  Mail,
  Globe,
  FileText,
  Calendar,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GarageLogo } from "@/components/ui/garage-logo";
import { RegPlate } from "@/components/ui/reg-plate";
import { StatusBadge } from "@/components/ui/status-badge";
import { Stack } from "@/components/ui/stack";
import { EmptyState } from "@/components/ui/empty-state";
import { FormCard } from "@/components/ui/form-card";
import { FormActions } from "@/components/ui/form-actions";
import { PatternBackground } from "@/components/ui/pattern-background";
import { MilestoneAchievementIllustration } from "@/components/illustrations";
import type { JobStatus } from "@/lib/validation/job-schemas";

type Step = "lookup" | "verify" | "status";

interface TimelineEvent {
  eventId: string;
  kind: string;
  at: string;
  line: string;
  detail: string | null;
}

type JobInvoice =
  | {
      invoiceNumber: string;
      status: "quoted" | "invoiced" | "paid";
      totalPence: number;
      quotedAt: string | null;
      invoicedAt: string | null;
      /** Migration 045 — bumps on any post-quote edit. */
      revision: number;
      updatedAt: string | null;
      /** Migration 046 — PAID badge + date when non-null. */
      paidAt: string | null;
      paymentMethod: "cash" | "card" | "bank_transfer" | "other" | null;
      pdfPath: string;
    }
  | {
      /** V5.3 — "Pricing in preparation" state. Fires when the garage
       *  has added line items but hasn't promoted the invoice to a
       *  quote or invoice yet. Shown as a placeholder so the customer
       *  knows pricing is coming without seeing an unfinalised amount. */
      invoiceNumber: string | null;
      status: "pending";
      totalPence: null;
      quotedAt: null;
      invoicedAt: null;
      revision: 1;
      updatedAt: null;
      paidAt: null;
      paymentMethod: null;
      pdfPath: null;
    };

interface JobStateEntry {
  id: string;
  jobNumber: string;
  status: string;
  statusLabel: string;
  estimatedReady: string | null;
  createdAt: string;
  completedAt: string | null;
  description: string | null;
  timeline: TimelineEvent[];
  invoice: JobInvoice | null;
}

interface StateResponse {
  vehicle: { registration: string; make: string | null; model: string | null };
  garage: {
    name: string;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    postcode: string | null;
    email: string | null;
    website: string | null;
    logoUrl: string | null;
  } | null;
  jobs: JobStateEntry[];
  mot: {
    expiryDate: string | null;
    testResult: string | null;
    testedAt: string | null;
  } | null;
}

interface StatusClientProps {
  /** V5.7 — public-surface brand from getPublicGarageBrand(). `null`
   *  falls back to the Oplaris wordmark (fresh install). */
  brand: { name: string; logoUrl: string | null } | null;
}

function fmtGbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function fmtDate(iso: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", opts ?? {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function StatusClient({ brand }: StatusClientProps) {
  const [step, setStep] = useState<Step>("lookup");
  const [reg, setReg] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  /** STAGING_SMS_BYPASS — populated when the server returns a dev
   *  code inline (staging only). Always null on the prod build. */
  const [devCode, setDevCode] = useState<string | null>(null);
  const [state, setState] = useState<StateResponse | null>(null);

  // P50.7 — Poll while on the status panel. Status page is anonymous
  // (no Supabase JWT) so we can't use postgres_changes — RLS on the
  // underlying tables denies anon reads. The /api/status/state endpoint
  // is HMAC-gated (rule #8) so only the verified customer can read
  // their own vehicle's state.
  useEffect(() => {
    if (step !== "status") return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const r = await fetch("/api/status/state", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as StateResponse;
        if (!cancelled) setState(data);
      } catch {
        // Network blip — try again on the next tick.
      }
    };
    const iv = setInterval(tick, 4_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [step]);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/status/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration: reg, phone }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        devCode?: unknown;
        error?: string;
      };
      if (res.status === 429) {
        setError("Too many requests. Please wait and try again.");
      } else {
        const raw = data.devCode;
        setDevCode(
          typeof raw === "string" && /^\d{6}$/.test(raw) ? raw : null,
        );
        setStep("verify");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/status/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration: reg, phone, code }),
      });
      if (!res.ok) {
        setError("Invalid or expired code. Please try again.");
        return;
      }
      const stateRes = await fetch("/api/status/state");
      if (!stateRes.ok) {
        setError("Could not load status.");
        return;
      }
      setState((await stateRes.json()) as StateResponse);
      setStep("status");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function resetLookup() {
    setStep("lookup");
    setState(null);
    setCode("");
    setReg("");
    setPhone("");
    setDevCode(null);
    setError("");
  }

  return (
    // V4.2 / V5.3 — car-part pattern sits behind the ENTIRE status
    // page at 3% per the UX-audit cap; it fills the visual void
    // without competing with the status copy above it.
    <PatternBackground className="min-h-screen" opacity={0.03}>
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-start gap-6 p-6">
        {/* Branded header — logo + name + subtitle, always visible. */}
        <header className="mt-4 flex flex-col items-center gap-2 text-center">
          <GarageLogo
            name={brand?.name ?? "Oplaris Workshop"}
            logoUrl={brand?.logoUrl ?? null}
            size="lg"
          />
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-muted-foreground">
              Vehicle Status
            </h1>
          </div>
        </header>

        {step === "lookup" ? (
          <FormCard
            title="Check on your vehicle"
            description="Sign in with your reg + phone to see your live job status, invoices, and MOT."
            className="w-full"
          >
            <form onSubmit={handleRequestCode}>
              <FormCard.Fields>
                <div>
                  <Label htmlFor="reg" required>Registration</Label>
                  <Input
                    id="reg"
                    placeholder="AB12 CDE"
                    value={reg}
                    onChange={(e) => setReg(e.target.value)}
                    required
                    className="mt-1 font-mono uppercase"
                    autoComplete="off"
                    autoCapitalize="characters"
                  />
                </div>
                <div>
                  <Label htmlFor="phone" required>Phone number on file</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="07911 123456"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="mt-1"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </div>
                {/* Honeypot */}
                <div className="hidden" aria-hidden="true">
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </div>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </FormCard.Fields>
              <FormActions fullWidth>
                <Button type="submit" disabled={loading}>
                  {loading ? "Sending code…" : "Send verification code"}
                </Button>
              </FormActions>
            </form>
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              <Shield className="mt-1 h-4 w-4 shrink-0" />
              <span>
                We&apos;ll send a one-time code to the phone number on your
                account. Your session is stored only for the duration of
                your visit.
              </span>
            </div>
          </FormCard>
        ) : null}

        {step === "verify" ? (
          <FormCard
            title="Enter your code"
            description="If a matching vehicle exists, a 6-digit code has been sent. It expires in 10 minutes."
            className="w-full"
          >
            {devCode ? (
              <div
                role="status"
                className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
              >
                <div className="font-semibold">⚠ Dev bypass active</div>
                <div className="mt-1">
                  Staging only — no SMS was sent. Your code is{" "}
                  <span className="font-mono text-lg font-bold">
                    {devCode}
                  </span>
                </div>
              </div>
            ) : null}
            <form onSubmit={handleVerifyCode}>
              <FormCard.Fields>
                <div>
                  <Label htmlFor="code" required>6-digit code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    required
                    className="mt-1 text-center font-mono text-2xl tracking-[0.5em]"
                    autoComplete="one-time-code"
                  />
                </div>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </FormCard.Fields>
              <FormActions fullWidth>
                <Button
                  type="submit"
                  disabled={loading || code.length !== 6}
                >
                  {loading ? "Verifying…" : "Verify"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={resetLookup}
                >
                  Back to lookup
                </Button>
              </FormActions>
            </form>
          </FormCard>
        ) : null}

        {step === "status" && state ? (
          <div className="w-full">
            <Stack gap="md">
              {/* Vehicle identity band — reg plate at the top so the
               *  customer confirms they're looking at the right car. */}
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <RegPlate reg={state.vehicle.registration} size="lg" />
                    <div className="text-sm text-muted-foreground">
                      {[state.vehicle.make, state.vehicle.model]
                        .filter(Boolean)
                        .join(" ") || "Your vehicle"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetLookup}
                  >
                    Check another
                  </Button>
                </CardContent>
              </Card>

              {/* Active jobs — one card per job. */}
              {state.jobs.length === 0 ? (
                <EmptyState
                  illustration={MilestoneAchievementIllustration}
                  title="Nothing in progress"
                  description="This vehicle has no active jobs. If you think that's wrong, call the garage below."
                  className="bg-card"
                />
              ) : (
                state.jobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))
              )}

              {/* MOT band — only renders when the DVSA cache has data. */}
              {state.mot?.expiryDate ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Calendar className="h-4 w-4 text-primary" />
                      MOT
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="text-muted-foreground">Expires</span>
                      <strong>{fmtDate(state.mot.expiryDate)}</strong>
                    </div>
                    {state.mot.testResult ? (
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                        <span className="text-muted-foreground">Last test</span>
                        <span>
                          <span className="font-medium capitalize">
                            {state.mot.testResult.toLowerCase()}
                          </span>
                          {state.mot.testedAt
                            ? ` · ${fmtDate(state.mot.testedAt)}`
                            : null}
                        </span>
                      </div>
                    ) : null}
                    <a
                      href={`https://www.gov.uk/check-mot-history?registration=${encodeURIComponent(state.vehicle.registration)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      View on GOV.UK <ExternalLink className="h-3 w-3" />
                    </a>
                  </CardContent>
                </Card>
              ) : null}

              {/* Garage contact card — always at the bottom so the
               *  "call the shop" action is the thumb-zone CTA. */}
              {state.garage ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      {state.garage.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {state.garage.phone ? (
                      <a
                        href={`tel:${state.garage.phone}`}
                        className="flex items-center gap-2 text-primary hover:underline"
                      >
                        <Phone className="h-4 w-4" />
                        {state.garage.phone}
                      </a>
                    ) : null}
                    {state.garage.email ? (
                      <a
                        href={`mailto:${state.garage.email}`}
                        className="flex items-center gap-2 text-primary hover:underline"
                      >
                        <Mail className="h-4 w-4" />
                        {state.garage.email}
                      </a>
                    ) : null}
                    {state.garage.addressLine1 ? (
                      <div className="flex items-start gap-2">
                        <MapPin className="mt-1 h-4 w-4 text-muted-foreground" />
                        <span>
                          {state.garage.addressLine1}
                          {state.garage.addressLine2
                            ? `, ${state.garage.addressLine2}`
                            : ""}
                          {state.garage.postcode
                            ? `, ${state.garage.postcode}`
                            : ""}
                        </span>
                      </div>
                    ) : null}
                    {state.garage.website ? (
                      <a
                        href={
                          state.garage.website.startsWith("http")
                            ? state.garage.website
                            : `https://${state.garage.website}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-primary hover:underline"
                      >
                        <Globe className="h-4 w-4" />
                        {state.garage.website}
                      </a>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}
            </Stack>
          </div>
        ) : null}
      </main>
    </PatternBackground>
  );
}

/** V5.3 — Per-job card. Renders job identity, current status badge,
 *  activity timeline, and the invoice/quote block when present. */
function JobCard({ job }: { job: JobStateEntry }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base">Job {job.jobNumber}</CardTitle>
        <StatusBadge status={job.status as JobStatus} />
      </CardHeader>
      <CardContent className="space-y-4">
        {job.description ? (
          <p className="text-sm text-muted-foreground">{job.description}</p>
        ) : null}

        {/* Hide the ETA once the car is actually ready or the job is
         *  closed — an "estimated ready" in the past makes the status
         *  feel stale. `ready_for_collection` and `completed` both
         *  mean the customer doesn't need an estimate any more. */}
        {job.estimatedReady &&
        job.status !== "ready_for_collection" &&
        job.status !== "completed" ? (
          <div className="rounded-lg bg-primary/5 p-3 text-center text-sm">
            <div className="text-muted-foreground">Estimated ready</div>
            <div className="mt-1 font-semibold">
              {new Date(job.estimatedReady).toLocaleDateString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        ) : null}

        {job.invoice ? <InvoiceRow invoice={job.invoice} /> : null}

        {job.timeline.length > 0 ? (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Activity
            </div>
            <ol className="space-y-2">
              {job.timeline.map((e) => (
                <li
                  key={`${e.kind}-${e.eventId}`}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    e.kind === "work_running"
                      ? "border-success/40 bg-success/10"
                      : "border-border bg-background"
                  }`}
                >
                  <div className="font-medium">{e.line}</div>
                  {e.detail ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {e.detail}
                    </div>
                  ) : null}
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(e.at).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" · "}
                    {new Date(e.at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InvoiceRow({ invoice }: { invoice: JobInvoice }) {
  if (invoice.status === "pending") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-sm">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <div>
          <div className="font-medium">Pricing in preparation</div>
          <div className="text-xs text-muted-foreground">
            Your quote will appear here once the garage finalises it.
          </div>
        </div>
      </div>
    );
  }

  const isPaid = invoice.status === "paid";
  const isInvoiced = invoice.status === "invoiced";
  const label = isPaid ? "Paid" : isInvoiced ? "Invoice" : "Quote";
  const isRevised = invoice.revision > 1;
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${
        isPaid
          ? "border-success/40 bg-success/10"
          : "border-accent/40 bg-accent/10"
      }`}
    >
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          {isPaid ? (
            <span className="rounded-full bg-success px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-success-foreground">
              Paid
            </span>
          ) : isRevised ? (
            <span className="rounded-full bg-warning px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-warning-foreground">
              Updated
            </span>
          ) : null}
        </div>
        <div className="mt-1 font-semibold">
          {fmtGbp(invoice.totalPence)}
        </div>
        <div className="text-xs text-muted-foreground">
          Ref {invoice.invoiceNumber}
          {isPaid && invoice.paidAt
            ? ` · paid ${fmtDate(invoice.paidAt)}`
            : invoice.quotedAt || invoice.invoicedAt
              ? ` · ${fmtDate(invoice.invoicedAt ?? invoice.quotedAt)}`
              : null}
          {isRevised && !isPaid ? ` · rev ${invoice.revision}` : null}
        </div>
      </div>
      <Button asChild size="sm" variant="outline">
        <a href={invoice.pdfPath} target="_blank" rel="noopener noreferrer">
          <FileText className="h-4 w-4" />
          Download PDF
        </a>
      </Button>
    </div>
  );
}
