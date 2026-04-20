import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContainer } from "@/components/app/page-container";

import { BillingForm } from "./BillingForm";

export default async function BillingSettingsPage() {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();

  const { data: garage } = await supabase
    .from("garages")
    .select("labour_rate_pence, labour_default_description")
    .eq("id", session.garageId)
    .single();

  return (
    <PageContainer width="form">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Defaults for labour charges. You can still override any of these on a per-job basis.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Labour defaults</CardTitle>
        </CardHeader>
        <CardContent>
          <BillingForm
            initialRatePounds={(garage?.labour_rate_pence ?? 7500) / 100}
            initialDescription={garage?.labour_default_description ?? ""}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
