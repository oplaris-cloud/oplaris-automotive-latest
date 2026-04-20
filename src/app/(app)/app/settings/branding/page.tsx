import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { getGarageBrand } from "@/lib/brand/garage-brand";
import { Separator } from "@/components/ui/separator";
import { PageContainer } from "@/components/app/page-container";

import { BrandingForm } from "./BrandingForm";

// Phase 3 > V1.5 — Manager-only brand configuration.
export default async function BrandingSettingsPage(): Promise<React.JSX.Element> {
  await requireManager();
  const brand = await getGarageBrand();

  return (
    <PageContainer width="narrow">
      <Link
        href="/app/settings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Settings
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">Branding</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Customise the colour, logo, and business name the app uses in the
        sidebar, on the customer status page, and on printed job sheets.
      </p>

      <Separator className="my-6" />

      <BrandingForm
        initial={{
          brandName: brand?.name ?? "",
          primaryHex: brand?.primaryHex ?? "#3b82f6",
          accentHex: brand?.accentHex ?? "",
          primaryForegroundHex: brand?.primaryForegroundHex ?? "",
          showName: brand?.showName ?? true,
          font: brand?.font ?? "Inter",
          logoUrl: brand?.logoUrl ?? null,
        }}
      />
    </PageContainer>
  );
}
