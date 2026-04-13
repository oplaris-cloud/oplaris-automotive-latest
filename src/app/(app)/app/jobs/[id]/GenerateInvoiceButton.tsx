"use client";

import { useState } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GenerateInvoiceButtonProps {
  jobId: string;
  jobNumber: string;
}

export function GenerateInvoiceButton({ jobId, jobNumber }: GenerateInvoiceButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/invoices/${jobId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Failed to generate invoice (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Open in new tab for print/download
      window.open(url, "_blank");

      // Also trigger download
      const a = document.createElement("a");
      a.href = url;
      a.download = `INV-${jobNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up after a delay
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate invoice");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Button
        onClick={handleGenerate}
        disabled={loading}
        className="gap-2"
        variant="default"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        {loading ? "Generating..." : "Generate Invoice"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
