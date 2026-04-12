"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ReportPeriod } from "../settings/reports/actions";

export function PeriodToggle({ current }: { current: ReportPeriod }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function set(p: ReportPeriod) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", p);
    router.push(`/app/reports?${params.toString()}`);
  }

  return (
    <div className="inline-flex rounded-lg border bg-muted p-1">
      <button
        onClick={() => set("week")}
        className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
          current === "week"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        This Week
      </button>
      <button
        onClick={() => set("month")}
        className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
          current === "month"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        This Month
      </button>
    </div>
  );
}
