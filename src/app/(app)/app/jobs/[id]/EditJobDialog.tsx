"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { updateJobDetails } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface EditJobDialogProps {
  jobId: string;
  description: string | null;
  estimatedReadyAt: string | null;
}

export function EditJobDialog({ jobId, description, estimatedReadyAt }: EditJobDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Edit job details"
      >
        <Pencil className="h-4 w-4" />
      </button>
    );
  }

  // Format datetime-local value
  const etaDefault = estimatedReadyAt
    ? new Date(estimatedReadyAt).toISOString().slice(0, 16)
    : "";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateJobDetails({
        jobId,
        description: (form.get("description") as string) ?? "",
        estimatedReadyAt: (form.get("estimatedReadyAt") as string) || "",
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to save");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-3 rounded-lg border p-4">
      <div>
        <Label htmlFor="edit-desc">Description</Label>
        <Textarea
          id="edit-desc"
          name="description"
          rows={3}
          defaultValue={description ?? ""}
          placeholder="Describe the work..."
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="edit-eta">Estimated Ready</Label>
        <Input
          id="edit-eta"
          name="estimatedReadyAt"
          type="datetime-local"
          defaultValue={etaDefault}
          className="mt-1"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
