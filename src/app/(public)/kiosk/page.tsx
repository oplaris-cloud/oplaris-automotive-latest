"use client";

import { useState, useEffect, useCallback } from "react";
import { Wrench, Zap, Car, CheckCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RegPlateInput } from "@/components/ui/reg-plate";

type Service = "mot" | "electrical" | "maintenance";
type Step = "service" | "details" | "confirm" | "done";

const SERVICES: { value: Service; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "mot", label: "MOT Test", icon: <Car className="h-10 w-10" />, description: "Annual MOT test" },
  { value: "electrical", label: "Electrical", icon: <Zap className="h-10 w-10" />, description: "Electrical diagnostics & repair" },
  { value: "maintenance", label: "Service & Repair", icon: <Wrench className="h-10 w-10" />, description: "General servicing & repairs" },
];

const IDLE_TIMEOUT = 60_000; // 60s → reset form

export default function KioskPage() {
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<Service | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [reg, setReg] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setStep("service");
    setService(null);
    setName("");
    setPhone("");
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

  // Idle timer
  useEffect(() => {
    if (step === "done") {
      const t = setTimeout(reset, 5000);
      return () => clearTimeout(t);
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      {step === "service" && (
        <div className="w-full max-w-2xl text-center">
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
              <Input id="kiosk-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 text-lg" placeholder="07911 123456" autoComplete="tel" />
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
              <Button className="flex-1 text-lg py-6" disabled={!name || !phone || !reg} onClick={() => setStep("confirm")}>Continue</Button>
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
        <div className="text-center">
          <CheckCircle className="mx-auto h-20 w-20 text-success" />
          <h2 className="mt-4 text-3xl font-bold">Booking Received</h2>
          <p className="mt-2 text-lg text-muted-foreground">
            A member of staff will be with you shortly.
          </p>
        </div>
      )}
    </main>
  );
}
