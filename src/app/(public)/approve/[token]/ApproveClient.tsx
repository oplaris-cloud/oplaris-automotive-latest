"use client";

import { useState, useTransition } from "react";
import { Check, CheckCircle2, X, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GarageLogo } from "@/components/ui/garage-logo";
import { PatternBackground } from "@/components/ui/pattern-background";
import { RegPlate } from "@/components/ui/reg-plate";

interface ApproveClientProps {
  token: string;
  garageName: string;
  logoUrl: string | null;
  jobNumber: string | null;
  vehicleRegistration: string | null;
  vehicleMakeModel: string | null;
  description: string;
  amountPence: number;
  expiresAt: string;
}

type DecisionState =
  | { kind: "idle" }
  | { kind: "submitting"; decision: "approved" | "declined" }
  | { kind: "done"; decision: "approved" | "declined" }
  | { kind: "error"; message: string };

/**
 * P2.1 — customer approval action surface.
 *
 * Renders the request summary + Approve/Decline buttons. The submit
 * path POSTs to the existing /api/approvals/<token> route — that
 * endpoint stays the single write path so its anti-replay guard
 * (single-use UPDATE WHERE status='pending') keeps holding.
 */
export function ApproveClient({
  token,
  garageName,
  logoUrl,
  jobNumber,
  vehicleRegistration,
  vehicleMakeModel,
  description,
  amountPence,
  expiresAt,
}: ApproveClientProps) {
  const [state, setState] = useState<DecisionState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  const amount = `£${(amountPence / 100).toFixed(2)}`;
  const expiryLabel = new Date(expiresAt).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  function submit(decision: "approved" | "declined") {
    setState({ kind: "submitting", decision });
    startTransition(async () => {
      try {
        const res = await fetch(`/api/approvals/${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setState({
            kind: "error",
            message:
              body.error ??
              "We couldn't record your response. Please try again.",
          });
          return;
        }
        setState({ kind: "done", decision });
      } catch {
        setState({
          kind: "error",
          message:
            "We couldn't reach the garage's system. Please check your connection and try again.",
        });
      }
    });
  }

  if (state.kind === "done") {
    return (
      <DonePanel
        garageName={garageName}
        logoUrl={logoUrl}
        decision={state.decision}
      />
    );
  }

  return (
    <PatternBackground className="min-h-screen" opacity={0.03}>
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-start gap-6 p-6">
        <header className="mt-4 flex flex-col items-center gap-2 text-center">
          <GarageLogo name={garageName} logoUrl={logoUrl} size="lg" />
          <h1 className="font-heading text-xl font-semibold">
            Approval requested
          </h1>
          <p className="text-sm text-muted-foreground">
            {garageName} needs your go-ahead before this work goes on
            your bill.
          </p>
        </header>

        <Card className="w-full space-y-4 p-5">
          {(jobNumber || vehicleRegistration) && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
              {vehicleRegistration && (
                <RegPlate reg={vehicleRegistration} variant="rear" />
              )}
              {jobNumber && (
                <span className="font-mono text-sm text-muted-foreground">
                  Job {jobNumber}
                </span>
              )}
            </div>
          )}
          {vehicleMakeModel && (
            <div className="text-sm text-muted-foreground">
              {vehicleMakeModel}
            </div>
          )}
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Work proposed
            </div>
            <p className="whitespace-pre-line text-base leading-snug">
              {description}
            </p>
          </div>
          <div className="flex items-baseline justify-between border-t pt-3">
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="font-heading text-2xl font-semibold">
              {amount}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Link valid until {expiryLabel}.
          </div>
        </Card>

        {state.kind === "error" && (
          <div
            role="alert"
            className="w-full rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {state.message}
          </div>
        )}

        <div className="grid w-full grid-cols-2 gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={() => submit("declined")}
            disabled={isPending}
          >
            <X className="h-4 w-4" />
            Decline
          </Button>
          <Button
            size="lg"
            onClick={() => submit("approved")}
            disabled={isPending}
          >
            <Check className="h-4 w-4" />
            Approve
          </Button>
        </div>

        <p className="px-4 text-center text-xs text-muted-foreground">
          By tapping Approve you agree to the work above. You can call
          the garage if you'd like to discuss before deciding.
        </p>
      </main>
    </PatternBackground>
  );
}

function DonePanel({
  garageName,
  logoUrl,
  decision,
}: {
  garageName: string;
  logoUrl: string | null;
  decision: "approved" | "declined";
}) {
  const isApproved = decision === "approved";
  return (
    <PatternBackground className="min-h-screen" opacity={0.03}>
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
        <GarageLogo name={garageName} logoUrl={logoUrl} size="lg" />
        <div
          className={
            isApproved
              ? "rounded-full border border-success/40 bg-success/10 p-4"
              : "rounded-full border border-border bg-background p-4"
          }
        >
          {isApproved ? (
            <CheckCircle2
              className="h-10 w-10 text-success"
              aria-hidden="true"
            />
          ) : (
            <XCircle
              className="h-10 w-10 text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-semibold">
            {isApproved ? "Thanks — you've approved the work" : "Decision recorded"}
          </h1>
          <p className="text-muted-foreground">
            {isApproved
              ? `${garageName} can now proceed. We'll send another update when the work is finished.`
              : `${garageName} has been told you'd like to discuss before proceeding. Please give them a call when you're ready.`}
          </p>
        </div>
      </main>
    </PatternBackground>
  );
}
