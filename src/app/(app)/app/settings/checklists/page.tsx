import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/app/page-container";
import { PageTitle } from "@/components/ui/page-title";

import { ChecklistsClient } from "./ChecklistsClient";

export const dynamic = "force-dynamic";

interface ChecklistRow {
  role: "mechanic" | "mot_tester";
  items: string[];
  enabled: boolean;
}

export default async function ChecklistsSettingsPage() {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("job_completion_checklists")
    .select("role, items, enabled")
    .eq("garage_id", session.garageId);

  // Default both rows when the garage was created before migration 059
  // ran (settings/checklists/actions.ts:ensureChecklistRow self-heals
  // on first toggle/save, but the form needs a sane initial state).
  const byRole: Record<"mechanic" | "mot_tester", ChecklistRow> = {
    mechanic: { role: "mechanic", items: [], enabled: false },
    mot_tester: { role: "mot_tester", items: [], enabled: false },
  };
  for (const row of (data ?? []) as ChecklistRow[]) {
    if (row.role in byRole) {
      byRole[row.role] = {
        role: row.role,
        items: Array.isArray(row.items) ? (row.items as string[]) : [],
        enabled: !!row.enabled,
      };
    }
  }

  return (
    <PageContainer width="default">
      <PageTitle
        title="End-of-job checklist"
        description="Force technicians to confirm a short list of questions before they can mark a job complete. One list per role; toggle off to skip the modal entirely."
      />
      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Couldn&apos;t load checklists: {error.message}
        </p>
      ) : (
        <ChecklistsClient
          mechanic={byRole.mechanic}
          motTester={byRole.mot_tester}
        />
      )}
    </PageContainer>
  );
}
