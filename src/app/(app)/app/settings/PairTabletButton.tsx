"use client";

import { useState, useTransition } from "react";
import { Tablet } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PairTabletButton() {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  function handlePair() {
    setStatus("idle");
    startTransition(async () => {
      try {
        const res = await fetch("/api/kiosk/pair", { method: "POST" });
        const data = await res.json();
        if (res.ok) {
          setStatus("success");
          setMessage("Tablet paired successfully. Open /kiosk on the reception tablet.");
        } else {
          setStatus("error");
          setMessage(data.error ?? "Failed to pair tablet");
        }
      } catch {
        setStatus("error");
        setMessage("Network error — try again");
      }
    });
  }

  return (
    <div>
      <Button onClick={handlePair} disabled={isPending} className="gap-2">
        <Tablet className="h-4 w-4" />
        {isPending ? "Pairing…" : "Pair This Device as Kiosk"}
      </Button>
      {status === "success" && (
        <p className="mt-2 text-sm text-green-600">{message}</p>
      )}
      {status === "error" && (
        <p className="mt-2 text-sm text-destructive">{message}</p>
      )}
    </div>
  );
}
