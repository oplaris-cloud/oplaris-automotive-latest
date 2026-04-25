import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/app/page-container";
import { PageTitle } from "@/components/ui/page-title";
import {
  TEMPLATE_KEYS,
  type TemplateKey,
} from "@/lib/sms/templates";

import { SmsTemplatesClient } from "./SmsTemplatesClient";

export const dynamic = "force-dynamic";

export default async function SmsTemplatesPage() {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("sms_templates")
    .select("template_key, body, updated_at")
    .eq("garage_id", session.garageId);

  // Map to a stable shape keyed by template_key. If a row is missing
  // (shouldn't happen — migration 055 seeds all three on garage create)
  // the editor renders with an empty body and the manager can populate.
  const templatesByKey: Record<
    TemplateKey,
    { body: string; updatedAt: string | null }
  > = {
    status_code: { body: "", updatedAt: null },
    approval_request: { body: "", updatedAt: null },
    mot_reminder: { body: "", updatedAt: null },
  };

  for (const row of data ?? []) {
    const key = row.template_key as TemplateKey;
    if (TEMPLATE_KEYS.includes(key)) {
      templatesByKey[key] = {
        body: row.body,
        updatedAt: row.updated_at,
      };
    }
  }

  return (
    <PageContainer width="default">
      <PageTitle
        title="SMS templates"
        description="Customise the wording of automated text messages sent to your customers. Variables like {{code}} or {{customer_name}} are filled in automatically when the message goes out."
      />

      {error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          Couldn&apos;t load templates: {error.message}
        </p>
      ) : (
        <SmsTemplatesClient templatesByKey={templatesByKey} />
      )}
    </PageContainer>
  );
}
