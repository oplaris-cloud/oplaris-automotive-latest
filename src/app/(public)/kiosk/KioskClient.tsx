"use client";

import { useState, useEffect, useCallback } from "react";
import { Wrench, Zap, Car, CheckCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RegPlateInput } from "@/components/ui/reg-plate";
import { GarageLogo } from "@/components/ui/garage-logo";
import { PatternBackground } from "@/components/ui/pattern-background";
import { PhoneInput } from "@/components/ui/phone-input";

type Service = "mot" | "electrical" | "maintenance";
type Step = "service" | "details" | "confirm" | "done";

const SERVICES: { value: Service; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "mot", label: "MOT Test", icon: <Car className="h-10 w-10" />, description: "Annual MOT test" },
  { value: "electrical", label: "Electrical", icon: <Zap className="h-10 w-10" />, description: "Electrical diagnostics & repair" },
  { value: "maintenance", label: "Service & Repair", icon: <Wrench className="h-10 w-10" />, description: "General servicing & repairs" },
];

const IDLE_TIMEOUT = 60_000; // 60s → reset form

interface KioskClientProps {
  /** V5.7 — public-surface brand. Pass `null` for the wordmark fallback. */
  brand: { name: string; logoUrl: string | null } | null;
}

export function KioskClient({ brand }: KioskClientProps) {
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<Service | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneValid, setPhoneValid] = useState(false);
  const [email, setEmail] = useState("");
  const [reg, setReg] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState("");
  // P1.1 — visible countdown on the done screen. Counts 3 → 2 → 1 then
  // hard-reloads to /kiosk so the next customer gets a clean session
  // (state, brand, idle timers all reset). Independent of whether the
  // SMS dispatch succeeded — the row is already in `bookings`.
  const [countdown, setCountdown] = useState(3);

  const reset = useCallback(() => {
    setStep("service");
    setService(null);
    setName("");
    setPhone("");
    setPhoneValid(false);
    setEmail("");
    setReg("");
    setMake("");
    setModel("");
    setNotes("");
    setError("");
    setLoading(false);
    setLookingUp(false);
  }, []);

  const lookupReg = useCallback(async (regValue: string) => {
    const trimmed = regValue.replace(/\s+/g, "").toUpperCase();
    if (trimmed.length < 3) return;
    setLookingUp(true);
    try {
      // P43 — kiosk-paired lookup; manager `/api/dvla/lookup` is gated by
      // requireManager which the kiosk session can't satisfy.
      const res = await fetch("/api/kiosk/reg-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration: trimmed }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.make) setMake(data.make);
        if (data.model) setModel(data.model);
      }
      // 4xx/5xx (rate limit, not configured, DVSA down) — silently fall
      // back to manual entry. Kiosk must keep working.
    } catch {
      // Silently fail — customer can continue without lookup
    } finally {
      setLookingUp(false);
    }
  }, []);

  // Idle timer + done-step countdown (P1.1)
  useEffect(() => {
    if (step === "done") {
      // Reset the visible counter every time we land on done — handles
      // back-to-back bookings without remounting the component.
      setCountdown(3);
      const tick = setInterval(() => {
        setCountdown((c) => (c > 0 ? c - 1 : 0));
      }, 1000);
      const redirect = setTimeout(() => {
        // Hard reload — wipes all React state, re-fetches brand, and
        // restarts the idle timer cleanly for the next customer.
        window.location.href = "/kiosk";
      }, 3000);
      return () => {
        clearInterval(tick);
        clearTimeout(redirect);
      };
    }
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(reset, IDLE_TIMEOUT);
    };
    resetTimer();
    window.addEventListener("pointerdown", resetTimer);
    window.addEventListener("keydown", resetTimer);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", resetTimer);
      window.removeEventListener("keydown", resetTimer);
    };
  }, [step, reset]);

  async function handleSubmit() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/kiosk/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          customerName: name,
          customerPhone: phone,
          customerEmail: email || undefined,
          registration: reg,
          make: make || undefined,
          model: model || undefined,
          notes,
        }),
      });
      if (res.status === 401) {
        setError("This tablet is not paired. Please ask a manager.");
        return;
      }
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }
      setStep("done");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PatternBackground className="min-h-screen" opacity={0.04}>
    <main className="flex min-h-screen flex-col items-center justify-center bg-background/80 p-8">
      {step === "service" && (
        <div className="w-full max-w-2xl text-center">
          {/* V5.7 — branded welcome resolved server-side via
           *  getPublicGarageBrand(); falls back to "Oplaris Workshop"
           *  before any garage row exists (fresh install). */}
          <div className="mb-4 flex justify-center">
            <GarageLogo
              name={brand?.name ?? "Oplaris Workshop"}
              logoUrl={brand?.logoUrl ?? null}
              size="lg"
            />
          </div>
          <h1 className="text-4xl font-bold">Welcome</h1>
          <p className="mt-2 text-xl text-muted-foreground">
            What do you need today?
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {SERVICES.map((s) => (
              <button
                key={s.value}
                onClick={() => { setService(s.value); setStep("details"); }}
                className="flex flex-col items-center gap-3 rounded-2xl border-2 p-8 text-center transition-all hover:border-primary hover:shadow-lg active:scale-[0.98]"
                style={{ minHeight: 180 }}
              >
                {s.icon}
                <span className="text-xl font-bold">{s.label}</span>
                <span className="text-sm text-muted-foreground">{s.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "details" && (
        <Card className="w-full max-w-md">
          <CardContent className="space-y-5 p-6">
            <h2 className="text-2xl font-bold">Your Details</h2>
            <div>
              <Label htmlFor="name" className="text-base">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 text-lg" placeholder="John Smith" autoComplete="name" />
            </div>
            <div>
              <Label htmlFor="kiosk-phone" className="text-base">Phone</Label>
              <div className="mt-1">
                <PhoneInput
                  id="kiosk-phone"
                  value={phone}
                  onChange={setPhone}
                  onValidChange={setPhoneValid}
                  required
                  inputClassName="text-lg"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="kiosk-email" className="text-base">Email (optional)</Label>
              <Input id="kiosk-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 text-lg" placeholder="john@example.com" autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="kiosk-reg" className="text-base">Registration</Label>
              <div className="mt-1">
                <RegPlateInput
                  id="kiosk-reg"
                  value={reg}
                  onChange={(e) => setReg(e.target.value)}
                  onBlur={() => lookupReg(reg)}
                  placeholder="AB12 CDE"
                  variant="rear"
                />
              </div>
              {lookingUp && <p className="mt-1 text-xs text-muted-foreground">Looking up vehicle...</p>}
              {make && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {make} {model}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="kiosk-notes" className="text-base">Notes (optional)</Label>
              <Input id="kiosk-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" placeholder="Any extra details" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 text-lg py-6" onClick={() => setStep("service")}>Back</Button>
              <Button className="flex-1 text-lg py-6" disabled={!name || !phoneValid || !reg} onClick={() => setStep("confirm")}>Continue</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "confirm" && (
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 p-6">
            <h2 className="text-2xl font-bold">Confirm Booking</h2>
            <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
              <div><strong>Service:</strong> {SERVICES.find((s) => s.value === service)?.label}</div>
              <div><strong>Name:</strong> {name}</div>
              <div><strong>Phone:</strong> {phone}</div>
              {email && <div><strong>Email:</strong> {email}</div>}
              <div><strong>Registration:</strong> <span className="inline-block rounded border-2 border-black bg-[#FFD307] px-2 py-1 font-mono text-sm font-black uppercase tracking-wider">{reg}</span>{make && <span className="ml-2">{make} {model}</span>}</div>
              {notes && <div><strong>Notes:</strong> {notes}</div>}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 text-lg py-6" onClick={() => setStep("details")}>Back</Button>
              <Button className="flex-1 text-lg py-6" disabled={loading} onClick={handleSubmit}>
                {loading ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <PatternBackground
          className="rounded-2xl border bg-card/80 p-12"
          opacity={0.03}
        >
          <div className="text-center">
            <CheckCircle className="mx-auto h-20 w-20 text-success" />
            <h2 className="mt-4 text-3xl font-bold">Booking Received</h2>
            <p className="mt-2 text-lg text-muted-foreground">
              A member of staff will be with you shortly.
            </p>
            {/* P1.1 — visible countdown to reset. Large number so it's
             *  legible across the reception even if the customer has
             *  walked away. aria-live keeps screen readers in sync. */}
            <div
              className="mt-8 flex flex-col items-center gap-2"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="text-7xl font-bold tabular-nums text-primary">
                {countdown}
              </span>
              <span className="text-sm text-muted-foreground">
                Resetting for the next customer…
              </span>
            </div>
          </div>
        </PatternBackground>
      )}
    </main>
    </PatternBackground>
  );
}
