import { requireManager } from "@/lib/auth/session";
import {
  getTodaysJobs,
  getWeeklyRevenue,
  getTechHours,
  getCommonRepairs,
} from "../settings/reports/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function pence(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default async function ReportsPage() {
  await requireManager();

  const [todaysJobs, weeklyRevenue, techHours, commonRepairs] = await Promise.all([
    getTodaysJobs(),
    getWeeklyRevenue(),
    getTechHours(),
    getCommonRepairs(),
  ]);

  const weekTotal = (weeklyRevenue.data ?? []).reduce(
    (sum, r) => sum + (r.parts_total_pence ?? 0),
    0,
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        This week&apos;s summary.
      </p>

      {/* Summary cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today&apos;s Active Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{todaysJobs.data?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completed This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{weeklyRevenue.data?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Parts Revenue (Week)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pence(weekTotal)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tech hours */}
      {(techHours.data?.length ?? 0) > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Hours per Technician (This Week)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Active Now</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {techHours.data!.map((t: { staff_id: string; full_name: string; total_seconds: number | null; active_logs: number }) => (
                  <TableRow key={t.staff_id}>
                    <TableCell className="font-medium">{t.full_name}</TableCell>
                    <TableCell className="text-right">{fmtDuration(t.total_seconds)}</TableCell>
                    <TableCell className="text-right">
                      {t.active_logs > 0 ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
                          Yes
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Common repairs */}
      {(commonRepairs.data?.length ?? 0) > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Common Repair Types (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Total Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commonRepairs.data!.map((r: { task_type: string; occurrence_count: number; total_seconds: number | null }) => (
                  <TableRow key={r.task_type}>
                    <TableCell className="capitalize">{r.task_type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-right">{r.occurrence_count}</TableCell>
                    <TableCell className="text-right">{fmtDuration(r.total_seconds)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
