import { Users } from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StaffAvatar } from "@/components/ui/staff-avatar";
import { PageContainer } from "@/components/app/page-container";
import { AddStaffDialog } from "./AddStaffDialog";
import { EditStaffButton, DeactivateStaffButton } from "./StaffActions";
import { StaffSettingsRealtime } from "@/lib/realtime/shims";

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  mot_tester: "MOT Tester",
  mechanic: "Mechanic",
};

const ROLE_COLOURS: Record<string, string> = {
  manager: "bg-primary/10 text-primary",
  mot_tester: "bg-info/10 text-info",
  mechanic: "bg-success/10 text-success",
};

export default async function StaffPage() {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();

  const { data: staffList, error: staffError } = await supabase
    .from("staff")
    .select("id, full_name, email, phone, is_active, avatar_url, roles")
    .order("full_name");

  if (staffError) {
    console.error("[staff-page] query error:", staffError.message, staffError.code);
  }

  const staff = staffList ?? [];

  const active = staff.filter((s) => s.is_active !== false);
  const inactive = staff.filter((s) => s.is_active === false);

  return (
    <PageContainer width="default">
      <StaffSettingsRealtime garageId={session.garageId} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Staff</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage technicians, MOT testers, and managers.
          </p>
        </div>
        <AddStaffDialog />
      </div>

      {staff.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff members"
          description="Add your first staff member to get started."
          className="mt-8"
        />
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((s) => {
              const roles = ((s as Record<string, unknown>).roles as string[] | null) ?? [];
              return (
                <Card key={s.id}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-success bg-success/10 text-success">
                      <StaffAvatar
                        src={(s as Record<string, unknown>).avatar_url as string | null}
                        name={s.full_name}
                        size={52}
                        roles={roles}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{s.full_name}</div>
                      <div className="text-sm text-muted-foreground truncate">{s.email}</div>
                      {s.phone && <div className="text-xs text-muted-foreground">{s.phone}</div>}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {roles.map((role) => (
                          <Badge key={role} variant="secondary" className={`text-xs ${ROLE_COLOURS[role] ?? ""}`}>
                            {ROLE_LABELS[role] ?? role}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <EditStaffButton staff={{ ...s, roles }} />
                      <DeactivateStaffButton staffId={s.id} isActive={true} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {inactive.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Deactivated ({inactive.length})
              </h2>
              <div className="grid gap-3 opacity-60 sm:grid-cols-2 lg:grid-cols-3">
                {inactive.map((s) => (
                  <Card key={s.id}>
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-gray-300 bg-gray-50 text-gray-400">
                        <StaffAvatar
                          src={(s as Record<string, unknown>).avatar_url as string | null}
                          name={s.full_name}
                          size={52}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{s.full_name}</div>
                        <div className="text-sm text-muted-foreground truncate">{s.email}</div>
                        <Badge variant="outline" className="mt-1 text-xs">Deactivated</Badge>
                      </div>
                      <DeactivateStaffButton staffId={s.id} isActive={false} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
