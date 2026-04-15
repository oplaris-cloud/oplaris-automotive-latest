import Link from "next/link";

import { requireManager } from "@/lib/auth/session";
import { getAuditLog } from "../../customers/gdpr/actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AuditLogPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  await requireManager();
  const { page } = await searchParams;
  const currentPage = Math.max(1, parseInt(page ?? "1", 10));

  const { entries, total, perPage } = await getAuditLog({ page: currentPage });
  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Audit Log</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        All staff actions recorded for compliance.
      </p>

      {entries.length === 0 ? (
        <EmptyState title="No entries" description="Actions will appear here as staff use the system." className="mt-8" />
      ) : (
        <>
          {/* P38.2 — Mobile cards (<md) */}
          <ul className="mt-6 space-y-2 md:hidden">
            {entries.map((entry) => {
              const staff = Array.isArray(entry.staff) ? entry.staff[0] : entry.staff;
              return (
                <li key={entry.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs">{entry.action}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="mt-1 text-sm">
                    {(staff as { full_name: string } | null)?.full_name ?? "—"}
                  </div>
                  {entry.target_table && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {entry.target_table}/{entry.target_id?.slice(0, 8)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Desktop table (md+) */}
          <div className="mt-6 hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead className="hidden sm:table-cell">Target</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const staff = Array.isArray(entry.staff) ? entry.staff[0] : entry.staff;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                      <TableCell className="text-sm">
                        {(staff as { full_name: string } | null)?.full_name ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                        {entry.target_table ? `${entry.target_table}/${entry.target_id?.slice(0, 8)}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              {currentPage > 1 && (
                <Link href={`/app/settings/audit-log?page=${currentPage - 1}`}>
                  <Button variant="outline" size="sm">Previous</Button>
                </Link>
              )}
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              {currentPage < totalPages && (
                <Link href={`/app/settings/audit-log?page=${currentPage + 1}`}>
                  <Button variant="outline" size="sm">Next</Button>
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
