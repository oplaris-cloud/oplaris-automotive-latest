"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { dismissCheckin } from "./actions";
import { Button } from "@/components/ui/button";

export function DismissButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        title="Dismiss check-in"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="destructive"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await dismissCheckin(bookingId);
            router.refresh();
          });
        }}
        className="h-7 text-xs"
      >
        {isPending ? "..." : "Delete"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setConfirm(false)} className="h-7 text-xs">
        No
      </Button>
    </div>
  );
}
