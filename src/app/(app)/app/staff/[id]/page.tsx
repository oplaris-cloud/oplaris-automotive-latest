import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageContainer } from "@/components/app/page-container";
import { PageTitle } from "@/components/ui/page-title";
import { RegPlate } from "@/components/ui/reg-plate";
import { Section } from "@/components/ui/section";
import { StaffAvatar } from "@/components/ui/staff-avatar";
import {
  formatPhone,
  formatWorkLogDuration,
  formatWorkLogTime,
} from "@/lib/format";
import { requireManager } from "@/lib/auth/session";
import { StaffDetailRealtime } from "@/lib/realtime/shims";

import { getStaffDetail } from "../actions";
import { StaffActiveHero } from "./StaffActiveHero";

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

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StaffDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireManager();
  const detail = await getStaffDetail(id);
  if (!detail) notFound();

  const { staff, activeWorkLog, todayLogs, weekTotalSeconds, weekJobsCompleted } =
    detail;

  return (
    <PageContainer width="default">
      <StaffDetailRealtime staffId={staff.id} garageId={session.garageId} />

      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href="/app/staff">
          <ArrowLeft className="h-4 w-4" />
          Back to Staff
        </Link>
      </Button>

      <PageTitle
        title={staff.full_name}
        description={staff.email}
        gap="sm"
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StaffAvatar
          src={staff.avatar_url}
          name={staff.full_name}
          size={56}
          roles={staff.roles}
        />
        <div className="flex flex-wrap gap-1">
          {staff.roles.map((role) => (
            <Badge
              key={role}
              variant="secondary"
              className={`text-xs ${ROLE_COLOURS[role] ?? ""}`}
            >
              {ROLE_LABELS[role] ?? role}
            </Badge>
          ))}
        </div>
        {staff.phone ? (
          <span className="text-sm text-muted-foreground">
            {formatPhone(staff.phone)}
          </span>
        ) : null}
      </div>

      {activeWorkLog ? <StaffActiveHero log={activeWorkLog} /> : null}

      <Section title="This week" gap="md">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card size="sm">
            <CardContent>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Total worked
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {formatWorkLogDuration(weekTotalSeconds)}
              </div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Jobs touched
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {weekJobsCompleted}
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Today's work logs" gap="md">
        {todayLogs.length === 0 ? (
          <Card size="sm">
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No closed work logs yet today.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card size="sm">
            <CardContent className="space-y-3">
              {todayLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    {log.vehicleReg ? (
                      <RegPlate
                        reg={log.vehicleReg}
                        size="sm"
                        vehicleId={log.vehicleId}
                      />
                    ) : null}
                    <Link
                      href={`/app/jobs/${log.jobId}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {log.jobNumber ?? "Job"}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {prettyTaskType(log.taskType)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatWorkLogTime(log.startedAt)} –{" "}
                    {formatWorkLogTime(log.endedAt)} ·{" "}
                    {formatWorkLogDuration(log.durationSeconds)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </Section>
    </PageContainer>
  );
}

function prettyTaskType(t: string): string {
  return t.replace(/_/g, " ");
}
