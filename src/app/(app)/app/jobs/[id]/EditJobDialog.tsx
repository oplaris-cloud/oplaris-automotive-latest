"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { updateJobDetails } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormCard } from "@/components/ui/form-card";
import { FormActions } from "@/components/ui/form-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="inline-flex items-center gap-1 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Edit job details"
      >
        <Pencil className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Job Details</DialogTitle>
        </DialogHeader>
        <FormCard variant="plain">
        <form onSubmit={handleSubmit}>
          <FormCard.Fields>
          <div>
            <Label htmlFor="edit-desc" optional>Description</Label>
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
            <Label htmlFor="edit-eta" optional>Estimated Ready</Label>
            <Input
              id="edit-eta"
              name="estimatedReadyAt"
              type="datetime-local"
              defaultValue={etaDefault}
              className="mt-1"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          </FormCard.Fields>
          <FormActions>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </FormActions>
        </form>
        </FormCard>
      </DialogContent>
    </Dialog>
  );
}
