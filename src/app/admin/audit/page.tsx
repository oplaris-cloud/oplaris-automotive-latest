import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AuditPageProps {
  searchParams: Promise<{
    garage?: string;
    actor?: string;
    action?: string;
    from?: string;
    to?: string;
  }>;
}

/**
 * B6.1 — Cross-garage audit log viewer.
 *
 * The `audit_log_select` policy now ORs in `is_super_admin()`, so a
 * super_admin's user-session client sees every garage's rows. We
 * filter optionally by garage / actor / action / date range — the
 * page is a Server Component so the URL is the source of truth.
 */
export default async function AdminAuditPage({
  searchParams,
}: AuditPageProps) {
  const { garage, actor, action, from, to } = await searchParams;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("audit_log")
    .select(
      `id, garage_id, actor_staff_id, action, target_table,
       target_id, meta, created_at`,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (garage) query = query.eq("garage_id", garage);
  if (actor) query = query.eq("actor_staff_id", actor);
  if (action) query = query.ilike("action", `%${action}%`);
  if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  const { data: rows } = await query;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Audit log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cross-garage. Every super_admin action writes a row prefixed
          <code className="ml-1 rounded bg-muted px-1 py-1 text-xs">
            super_admin_*
          </code>
          .
        </p>
      </div>

      {/* Native form — server-only filter, no client JS needed. */}
      <Card>
        <CardContent className="p-4">
          <form
            method="get"
            action="/admin/audit"
            className="grid gap-3 sm:grid-cols-5"
          >
            <Field name="garage" label="Garage ID" defaultValue={garage} />
            <Field name="actor" label="Actor staff ID" defaultValue={actor} />
            <Field
              name="action"
              label="Action (substring)"
              defaultValue={action}
            />
            <Field
              name="from"
              label="From"
              type="date"
              defaultValue={from}
            />
            <Field name="to" label="To" type="date" defaultValue={to} />
            <div className="sm:col-span-5">
              <Button type="submit" size="sm">
                Filter
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Garage</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">
                  {new Date(r.created_at).toLocaleString("en-GB")}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {String(r.garage_id ?? "—").slice(0, 8)}…
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.actor_staff_id
                    ? String(r.actor_staff_id).slice(0, 8) + "…"
                    : "(super_admin)"}
                </TableCell>
                <TableCell>
                  <span className="rounded bg-muted px-2 py-1 text-xs font-medium">
                    {r.action}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.target_table ? `${r.target_table}` : "—"}
                  {r.target_id ? (
                    <span className="ml-1 font-mono">
                      {String(r.target_id).slice(0, 8)}…
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {(rows ?? []).length === 0 ? (
          <div className="border-t p-6 text-center text-sm text-muted-foreground">
            No matching audit entries.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={`audit-${name}`}>{label}</Label>
      <Input id={`audit-${name}`} name={name} type={type} defaultValue={defaultValue ?? ""} />
    </div>
  );
}
