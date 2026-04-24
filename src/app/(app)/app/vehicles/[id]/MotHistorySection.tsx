"use client";

import { useState, useTransition } from "react";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isMotExpired, isMotExpiringSoon } from "@/lib/mot/expiry";
import type { MotHistoryEntry } from "../actions";

interface MotHistorySectionProps {
  vehicleId: string;
  registration: string;
  motHistory: MotHistoryEntry[];
  now: Date;
}

export function MotHistorySection({
  vehicleId,
  registration,
  motHistory: initialHistory,
  now,
}: MotHistorySectionProps) {
  const [motHistory, setMotHistory] = useState(initialHistory);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expandedTest, setExpandedTest] = useState<number | null>(null);

  const handleRefresh = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/dvsa/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vehicleId, registration }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Failed" }));
          setError(data.error ?? "MOT lookup failed");
          return;
        }

        const data = await res.json();
        const payload = data.data as Record<string, unknown>;
        const tests = (payload?.motTests ??
          payload?.motTestReports ??
          []) as MotHistoryEntry[];
        setMotHistory(Array.isArray(tests) ? tests : []);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Shield className="h-5 w-5" /> MOT History
        </h2>
        <button
          onClick={handleRefresh}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`}
          />
          {isPending ? "Fetching..." : "Refresh from DVSA"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Migration 047 Step 6 — MOT summary card.
       *  Surfaces the latest test (regardless of where it was done)
       *  + expiry date + GOV.UK link. Lives ABOVE the history list so
       *  the most asked-about facts are at the top of the screen. */}
      {motHistory.length > 0 ? (() => {
        const latest = motHistory[0];
        if (!latest) return null;
        const passed = latest.testResult?.toUpperCase() === "PASSED";
        const expiry = latest.expiryDate
          ? new Date(latest.expiryDate)
          : null;
        const expired = expiry ? isMotExpired(expiry, now) : false;
        const expiringSoon = expiry ? isMotExpiringSoon(expiry, now) : false;
        return (
          <Card
            className={`mt-3 ${
              expired
                ? "border-destructive/40 bg-destructive/5"
                : expiringSoon
                  ? "border-warning/40 bg-warning/5"
                  : ""
            }`}
          >
            <CardContent className="p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    MOT expires
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                    <Calendar className="h-4 w-4" />
                    {expiry
                      ? expiry.toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </div>
                  {expired ? (
                    <div className="mt-1 text-xs font-semibold text-destructive">
                      EXPIRED
                    </div>
                  ) : expiringSoon ? (
                    <div className="mt-1 text-xs font-semibold text-foreground">
                      Due within 30 days
                    </div>
                  ) : null}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Last test
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm">
                    {passed ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="font-medium capitalize">
                      {latest.testResult?.toLowerCase() ?? "unknown"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {latest.completedDate
                      ? new Date(latest.completedDate).toLocaleDateString(
                          "en-GB",
                          { day: "numeric", month: "short", year: "numeric" },
                        )
                      : ""}
                    {latest.odometerValue
                      ? ` · ${parseInt(latest.odometerValue).toLocaleString()} ${latest.odometerUnit ?? "mi"}`
                      : ""}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Defects
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {(latest.defects ?? []).length}
                  </div>
                  <a
                    href={`https://www.check-mot.service.gov.uk/results?registration=${encodeURIComponent(registration)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    GOV.UK MOT history <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })() : null}

      {motHistory.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No MOT history available.{" "}
          <button
            onClick={handleRefresh}
            disabled={isPending}
            className="text-primary underline hover:no-underline"
          >
            Fetch from DVSA
          </button>
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {motHistory.map((test, i) => {
            const passed = test.testResult?.toUpperCase() === "PASSED";
            const expanded = expandedTest === i;
            const defects = test.defects ?? [];

            return (
              <Card key={i}>
                <CardContent className="p-0">
                  <button
                    onClick={() =>
                      setExpandedTest(expanded ? null : i)
                    }
                    className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      {passed ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                      ) : (
                        <XCircle className="h-5 w-5 shrink-0 text-destructive" />
                      )}
                      <div>
                        <div className="text-sm font-medium">
                          {test.completedDate
                            ? new Date(test.completedDate).toLocaleDateString(
                                "en-GB",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                },
                              )
                            : "Unknown date"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {test.odometerValue &&
                            `${parseInt(test.odometerValue).toLocaleString()} ${test.odometerUnit ?? "mi"}`}
                          {test.expiryDate &&
                            ` · Expires ${new Date(test.expiryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={passed ? "default" : "destructive"}
                        className="capitalize"
                      >
                        {test.testResult?.toLowerCase() ?? "unknown"}
                      </Badge>
                      {defects.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {defects.length} {defects.length === 1 ? "item" : "items"}
                          {expanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </span>
                      )}
                    </div>
                  </button>

                  {expanded && defects.length > 0 && (
                    <div className="border-t px-4 py-3">
                      <div className="space-y-2">
                        {defects.map((d, di) => (
                          <div
                            key={di}
                            className="flex items-start gap-2 text-sm"
                          >
                            {d.dangerous ? (
                              <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-destructive" />
                            ) : d.type?.toLowerCase().includes("major") ? (
                              <XCircle className="mt-1 h-4 w-4 shrink-0 text-warning" />
                            ) : (
                              <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <span>
                              {d.text}
                              {d.type && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  ({d.type})
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
