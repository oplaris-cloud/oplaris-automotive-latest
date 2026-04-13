"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";

import { exportCustomerData } from "../gdpr/actions";
import { Button } from "@/components/ui/button";

export function GdprExportButton({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleExport = () => {
    setError(null);
    startTransition(async () => {
      const result = await exportCustomerData(customerId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      // Download as JSON file
      const blob = new Blob([result.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${customerName.replace(/\s+/g, "_")}_data_export.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExport} disabled={isPending}>
        <Download className="h-4 w-4" />
        {isPending ? "Exporting..." : "Export Data (GDPR)"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
