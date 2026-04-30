import type { Metadata } from "next";
import { Clock } from "lucide-react";

import { GarageLogo } from "@/components/ui/garage-logo";
import { PatternBackground } from "@/components/ui/pattern-background";
import { getPublicGarageBrand } from "@/lib/brand/garage-brand";

export const metadata: Metadata = {
  title: "Link expired",
  robots: { index: false, follow: false },
};

/**
 * P2.1 — landing page when a customer taps an SMS short-link past its
 * 24-hour validity window. Same response shape regardless of WHY the
 * link is dead (expired, exhausted, never existed) so we don't leak
 * anything useful to a probe.
 */
export default async function ShortLinkExpiredPage() {
  const brand = await getPublicGarageBrand();
  return (
    <PatternBackground className="min-h-screen" opacity={0.03}>
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
        <GarageLogo
          name={brand?.name ?? "Oplaris Workshop"}
          logoUrl={brand?.logoUrl ?? null}
          size="lg"
        />
        <div className="rounded-full border border-border bg-background p-4">
          <Clock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-semibold">
            This link has expired
          </h1>
          <p className="text-muted-foreground">
            For your security, approval links are valid for 24 hours.
            Please contact the garage and ask them to send you a fresh
            link.
          </p>
        </div>
      </main>
    </PatternBackground>
  );
}
