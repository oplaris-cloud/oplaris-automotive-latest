"use client";

import { useState } from "react";
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
  } | null>(null);

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
              <Shield className="mt-0.5 h-4 w-4 shrink-0" />
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
