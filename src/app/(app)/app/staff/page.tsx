import { Users } from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/app/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { Section } from "@/components/ui/section";
import { StaffPageRealtime } from "@/lib/realtime/shims";

import { getStaffWithLiveStatus } from "./actions";
import { StaffCard } from "./StaffCard";

export const metadata = {
  title: "Staff",
};

export default async function StaffListPage() {
  const session = await requireManager();
  const rows = await getStaffWithLiveStatus();

  // Busy first, then alphabetical. Manager's eye should land on the
  // action items (red cards with timers) before the idle pool.
  const sorted = [...rows].sort((a, b) => {
    if (a.status !== b.status) return a.status === "busy" ? -1 : 1;
    return a.staff.full_name.localeCompare(b.staff.full_name);
  });

  const busyCount = sorted.filter((r) => r.status === "busy").length;
  const freeCount = sorted.length - busyCount;

  return (
    <PageContainer width="default">
      <StaffPageRealtime garageId={session.garageId} />
      <PageTitle
        title="Staff"
        description={
          rows.length === 0
            ? "Add staff in Settings → Staff to populate this view."
            : `${busyCount} working · ${freeCount} free`
        }
      />

      {sorted.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No active staff"
          description="Add a manager, MOT tester, or mechanic in Settings → Staff."
          actionLabel="Open Settings → Staff"
          actionHref="/app/settings/staff"
        />
      ) : (
        <Section gap="md">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((row) => (
              <StaffCard key={row.staff.id} data={row} />
            ))}
          </div>
        </Section>
      )}
    </PageContainer>
  );
}
