"use client";

import { useEffect, useState } from "react";
import { Car, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Step = "lookup" | "verify" | "status";

export default function StatusPage() {
  const [step, setStep] = useState<Step>("lookup");
  const [reg, setReg] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusData, setStatusData] = useState<{
    status: string;
    label: string;
    estimatedReady: string | null;
    jobNumber: string;
    timeline?: Array<{
      eventId: string;
      kind: string;
      at: string;
      line: string;
      detail: string | null;
    }>;
  } | null>(null);

  // P50.7 — keep the customer's view live without a manual refresh.
  // The status page is anonymous (no Supabase JWT) so we can't use the
  // postgres_changes WS — RLS on the underlying tables denies anon reads.
  // Instead we poll the signed-session-scoped /api/status/state endpoint
  // every 4 s while the status panel is open. The endpoint is HMAC-gated
  // (rule #8) so only the verified customer can read their own job, and
  // the response carries no UUIDs the client could use to escalate.
  useEffect(() => {
    if (step !== "status") return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const r = await fetch("/api/status/state", { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled) setStatusData(data);
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
      const data = await res.json();
      if (res.status === 429) {
        setError("Too many requests. Please wait and try again.");
      } else {
        // Always advance to verify step (anti-enumeration)
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
      // Fetch status
      const stateRes = await fetch("/api/status/state");
      if (!stateRes.ok) {
        setError("Could not load status.");
        return;
      }
      setStatusData(await stateRes.json());
      setStep("status");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6">
      <div className="mb-6 flex items-center gap-2">
        <Car className="h-8 w-8 text-primary" />
        <h1 className="text-2xl font-bold">Vehicle Status</h1>
      </div>

      {step === "lookup" && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-lg">Check on your vehicle</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRequestCode} className="space-y-4">
              <div>
                <Label htmlFor="reg">Registration</Label>
                <Input
                  id="reg"
                  placeholder="AB12 CDE"
                  value={reg}
                  onChange={(e) => setReg(e.target.value)}
                  required
                  className="mt-1 font-mono uppercase"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone number on file</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="07911 123456"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="mt-1"
                  autoComplete="tel"
                />
              </div>
              {/* Honeypot */}
              <div className="hidden" aria-hidden="true">
                <input name="website" tabIndex={-1} autoComplete="off" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending code..." : "Send verification code"}
              </Button>
            </form>
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              <Shield className="mt-1 h-4 w-4 shrink-0" />
              <span>
                We&apos;ll send a one-time code to the phone number on your
                account. Your data is only stored for the duration of your
                visit.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "verify" && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-lg">Enter your code</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              If a matching vehicle exists, a 6-digit code has been sent to
              the phone number on file. It expires in 10 minutes.
            </p>
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div>
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  className="mt-1 text-center font-mono text-2xl tracking-[0.5em]"
                  autoComplete="one-time-code"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
                {loading ? "Verifying..." : "Verify"}
              </Button>
            </form>
            <button
              type="button"
              onClick={() => { setStep("lookup"); setError(""); setCode(""); }}
              className="mt-3 w-full text-center text-sm text-muted-foreground hover:underline"
            >
              Back to lookup
            </button>
          </CardContent>
        </Card>
      )}

      {step === "status" && statusData && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-lg">
              {statusData.status === "no_active_job"
                ? "No active job"
                : `Job ${statusData.jobNumber}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.status === "no_active_job" ? (
              <p className="text-muted-foreground">
                No active job found for this vehicle. If you believe this is
                an error, please call the garage.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-primary/5 p-4 text-center">
                  <div className="text-sm text-muted-foreground">Current status</div>
                  <div className="mt-1 text-xl font-bold">{statusData.label}</div>
                </div>
                {statusData.estimatedReady && (
                  <div className="text-center text-sm text-muted-foreground">
                    Estimated ready:{" "}
                    <strong>
                      {new Date(statusData.estimatedReady).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </strong>
                  </div>
                )}

                {/* P54 — Curated activity feed for the customer. Updates on
                    the 4 s poll that's already driving status. */}
                {statusData.timeline && statusData.timeline.length > 0 ? (
                  <div>
                    <div className="mb-2 text-sm font-semibold text-muted-foreground">
                      Activity
                    </div>
                    <ol className="space-y-2">
                      {statusData.timeline.map((e) => (
                        <li
                          key={e.eventId}
                          className={`rounded-lg border px-3 py-2 text-sm ${
                            e.kind === "work_running"
                              ? "border-emerald-300 bg-emerald-50"
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
              </div>
            )}
            <button
              type="button"
              onClick={() => { setStep("lookup"); setStatusData(null); setCode(""); setReg(""); setPhone(""); }}
              className="mt-6 w-full text-center text-sm text-muted-foreground hover:underline"
            >
              Check another vehicle
            </button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
