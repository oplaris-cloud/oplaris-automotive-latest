"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2, CheckCircle2 } from "lucide-react";

import { createVehicle } from "../vehicles/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RegPlateInput } from "@/components/ui/reg-plate";
import { FormCard } from "@/components/ui/form-card";
import { FormActions } from "@/components/ui/form-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface DvlaResult {
  registration: string;
  make: string | null;
  model: string | null;
  colour: string | null;
  year: number | string | null;
  fuelType: string | null;
  motStatus: string | null;
  motExpiry: string | null;
  mileage: number | null;
}

export function AddVehicleForm({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Reg + DVLA lookup state
  const [reg, setReg] = useState("");
  const [looking, setLooking] = useState(false);
  const [looked, setLooked] = useState(false);
  const [dvlaData, setDvlaData] = useState<DvlaResult | null>(null);

  // Form field refs for auto-fill
  const makeRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);
  const colourRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const mileageRef = useRef<HTMLInputElement>(null);

  const lookupReg = useCallback(async () => {
    const trimmed = reg.replace(/\s+/g, "").toUpperCase();
    if (trimmed.length < 2) return;

    setLooking(true);
    setError(null);
    setDvlaData(null);
    setLooked(false);

    try {
      const res = await fetch("/api/dvla/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration: trimmed }),
      });

      if (res.status === 404) {
        setError("Vehicle not found in DVLA records. You can still add it manually.");
        setLooked(true);
        return;
      }
      if (res.status === 503) {
        setError("DVLA lookup not configured. Fill in the details manually.");
        setLooked(true);
        return;
      }
      if (!res.ok) {
        setError("DVLA lookup failed. You can still fill in the details manually.");
        setLooked(true);
        return;
      }

      const data: DvlaResult = await res.json();
      setDvlaData(data);
      setLooked(true);

      // Auto-fill the form fields
      if (data.make && makeRef.current) makeRef.current.value = data.make;
      if (data.model && modelRef.current) modelRef.current.value = data.model;
      if (data.colour && colourRef.current) colourRef.current.value = data.colour;
      if (data.year && yearRef.current) yearRef.current.value = String(data.year);
      if (data.mileage && mileageRef.current) mileageRef.current.value = String(data.mileage);
    } catch {
      setError("Connection error. Fill in the details manually.");
      setLooked(true);
    } finally {
      setLooking(false);
    }
  }, [reg]);

  // P36.3 — wrapped in Dialog (was inline conditional render).

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const yearStr = form.get("year") as string;
      const mileageStr = form.get("mileage") as string;

      const result = await createVehicle({
        customerId,
        registration: reg || ((form.get("registration") as string) ?? ""),
        make: (form.get("make") as string) || "",
        model: (form.get("model") as string) || "",
        year: yearStr ? Number(yearStr) : undefined,
        colour: (form.get("colour") as string) || "",
        vin: (form.get("vin") as string) || "",
        mileage: mileageStr ? Number(mileageStr) : undefined,
      });

      if (!result.ok) {
        setError(result.error ?? "Something went wrong");
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }

      setOpen(false);
      setReg("");
      setDvlaData(null);
      setLooked(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setReg("");
          setDvlaData(null);
          setLooked(false);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="gap-1.5" />
        }
      >
        <Plus className="h-4 w-4" /> Add Vehicle
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Vehicle</DialogTitle>
        </DialogHeader>
        <FormCard variant="plain">
        <form onSubmit={handleSubmit}>
          <FormCard.Fields>
          {/* Gov.uk style reg plate input with lookup */}
      <div>
        <Label htmlFor="registration" className="text-base font-semibold" required>
          Registration Number
        </Label>
        <div className="mt-2 flex items-stretch gap-2">
          <div className="flex-1">
            <RegPlateInput
              id="registration"
              name="registration"
              required
              placeholder="Enter reg"
              value={reg}
              onChange={(e) => {
                setReg(e.target.value.toUpperCase());
                setLooked(false);
                setDvlaData(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !looked) {
                  e.preventDefault();
                  lookupReg();
                }
              }}
              variant="rear"
            />
          </div>
          <Button
            type="button"
            onClick={lookupReg}
            disabled={looking || reg.replace(/\s+/g, "").length < 2}
            className="h-auto px-4"
          >
            {looking ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Search className="h-5 w-5" />
            )}
            <span className="ml-2 hidden sm:inline">
              {looking ? "Looking up…" : "Look up"}
            </span>
          </Button>
        </div>
        {fieldErrors.registration && (
          <p className="mt-1 text-sm text-destructive">{fieldErrors.registration}</p>
        )}
      </div>

      {/* DVLA result badge */}
      {dvlaData && (
        <div className="flex items-start gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">
          <CheckCircle2 className="mt-1 h-4 w-4 flex-shrink-0" />
          <div>
            <strong>{dvlaData.make}</strong>
            {dvlaData.model && ` ${dvlaData.model}`}
            {dvlaData.colour && ` — ${dvlaData.colour}`}
            {dvlaData.year && ` (${dvlaData.year})`}
            {dvlaData.fuelType && ` — ${dvlaData.fuelType}`}
            {dvlaData.mileage && ` — ${dvlaData.mileage.toLocaleString()} mi`}
            {dvlaData.motStatus && (
              <span className="ml-2">
                MOT: <span className={dvlaData.motStatus === "PASSED" ? "font-semibold text-success" : "font-semibold text-destructive"}>{dvlaData.motStatus}</span>
                {dvlaData.motExpiry && ` (expires ${dvlaData.motExpiry})`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Vehicle details — auto-filled by DVLA or entered manually */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="make" optional>Make</Label>
          <Input ref={makeRef} id="make" name="make" placeholder="Ford" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="model" optional>Model</Label>
          <Input ref={modelRef} id="model" name="model" placeholder="Focus" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="year" optional>Year</Label>
          <Input ref={yearRef} id="year" name="year" type="number" placeholder="2021" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="colour" optional>Colour</Label>
          <Input ref={colourRef} id="colour" name="colour" placeholder="Silver" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="mileage" optional>Mileage</Label>
          <Input ref={mileageRef} id="mileage" name="mileage" type="number" placeholder="45000" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="vin" optional>VIN</Label>
          <Input id="vin" name="vin" placeholder="Optional" className="mt-1" />
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          </FormCard.Fields>
          <FormActions>
            <Button type="button" variant="outline" onClick={() => { setOpen(false); setReg(""); setDvlaData(null); setLooked(false); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding…" : "Add Vehicle"}
            </Button>
          </FormActions>
        </form>
        </FormCard>
      </DialogContent>
    </Dialog>
  );
}
