"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { restoreCustomer } from "./gdpr/actions";
import { Button } from "@/components/ui/button";

export function RestoreButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1 text-xs"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await restoreCustomer(customerId);
          router.refresh();
        });
      }}
    >
      <RotateCcw className="h-3.5 w-3.5" />
      {isPending ? "..." : "Restore"}
    </Button>
  );
}
