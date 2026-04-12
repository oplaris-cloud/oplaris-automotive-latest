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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MotHistoryEntry } from "../actions";

interface MotHistorySectionProps {
  vehicleId: string;
  registration: string;
  motHistory: MotHistoryEntry[];
}

export function MotHistorySection({
  vehicleId,
  registration,
  motHistory: initialHistory,
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
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
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
                      <div className="space-y-1.5">
                        {defects.map((d, di) => (
                          <div
                            key={di}
                            className="flex items-start gap-2 text-sm"
                          >
                            {d.dangerous ? (
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                            ) : d.type?.toLowerCase().includes("major") ? (
                              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                            ) : (
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
