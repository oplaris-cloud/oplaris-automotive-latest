import { requireManager } from "@/lib/auth/session";
import {
  getTodaysJobs,
  getCompletedRevenue,
  getTechHoursByPeriod,
  getCommonRepairs,
  type ReportPeriod,
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
import { PeriodToggle } from "./period-toggle";
import { CsvExportButton } from "./csv-export";

function pence(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireManager();

  const params = await searchParams;
  const period: ReportPeriod = params.period === "month" ? "month" : "week";
  const periodLabel = period === "month" ? "This Month" : "This Week";

  const [todaysJobs, revenue, techHours, commonRepairs] = await Promise.all([
    getTodaysJobs(),
    getCompletedRevenue(period),
    getTechHoursByPeriod(period),
    getCommonRepairs(),
  ]);

  const weekTotal = (revenue.data ?? []).reduce(
    (sum, r) => sum + (r.parts_total_pence ?? 0),
    0,
  );

  const revenueRows = (revenue.data ?? []).map((r) => [
    r.job_number,
    r.customer_name,
    r.registration,
    pence(r.parts_total_pence),
    r.completed_at ?? "",
  ]);

  const techRows = (techHours.data ?? []).map((t) => [
    t.full_name,
    fmtDuration(t.total_seconds),
    t.active_logs > 0 ? "Yes" : "No",
  ]);

  const repairRows = (commonRepairs.data ?? []).map((r: { task_type: string; occurrence_count: number; total_seconds: number | null }) => [
    r.task_type.replace(/_/g, " "),
    r.occurrence_count,
    fmtDuration(r.total_seconds),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {periodLabel}&apos;s summary.
          </p>
        </div>
        <PeriodToggle current={period} />
      </div>

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
              Completed ({periodLabel})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{revenue.data?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Parts Revenue ({periodLabel})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pence(weekTotal)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Completed jobs / revenue */}
      {(revenue.data?.length ?? 0) > 0 && (
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Completed Jobs ({periodLabel})</CardTitle>
            <CsvExportButton
              headers={["Job #", "Customer", "Registration", "Parts Total", "Completed"]}
              rows={revenueRows}
              filename={`completed-jobs-${period}`}
            />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead className="text-right">Parts Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenue.data!.map((r) => (
                  <TableRow key={r.job_id}>
                    <TableCell className="font-medium">{r.job_number}</TableCell>
                    <TableCell>{r.customer_name}</TableCell>
                    <TableCell>{r.registration}</TableCell>
                    <TableCell className="text-right">{pence(r.parts_total_pence)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tech hours */}
      {(techHours.data?.length ?? 0) > 0 && (
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Hours per Technician ({periodLabel})</CardTitle>
            <CsvExportButton
              headers={["Technician", "Hours", "Active Now"]}
              rows={techRows}
              filename={`tech-hours-${period}`}
            />
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
                {techHours.data!.map((t) => (
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Common Repair Types (Last 30 Days)</CardTitle>
            <CsvExportButton
              headers={["Type", "Count", "Total Time"]}
              rows={repairRows}
              filename="common-repairs"
            />
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
