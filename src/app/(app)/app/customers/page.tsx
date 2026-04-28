import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { GarageOwnerWelcomingCustomersIllustration } from "@/components/illustrations";
import { PageContainer } from "@/components/app/page-container";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { RestoreButton } from "./RestoreButton";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CustomersListRealtime } from "@/lib/realtime/shims";
import { TelLink } from "@/components/ui/tel-link";

interface CustomersPageProps {
  searchParams: Promise<{ q?: string; page?: string; openJob?: string; deleted?: string }>;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const session = await requireManager();
  const { q, page, openJob, deleted } = await searchParams;
  const filterOpenJob = openJob === "true";
  const showDeleted = deleted === "true";
  const isManager = session.roles.includes("manager");
  const supabase = await createSupabaseServerClient();
  const currentPage = Math.max(1, parseInt(page ?? "1", 10));
  const perPage = 25;

  let customers: { id: string; full_name: string; phone: string; email: string | null; created_at: string }[] | null;
  let count: number | null;

  if (filterOpenJob) {
    // Use inner join: only customers with at least one non-terminal job
    const result = await supabase
      .from("customers")
      .select("id, full_name, phone, email, created_at, jobs!inner(status)", { count: "exact" })
      .is("deleted_at", null)
      .not("jobs.status", "in", "(completed,cancelled)")
      .order("created_at", { ascending: false })
      .range((currentPage - 1) * perPage, currentPage * perPage - 1);
    // Deduplicate (inner join may repeat customers with multiple jobs)
    const seen = new Set<string>();
    customers = (result.data ?? [])
      .filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; })
      .map(({ id, full_name, phone, email, created_at }) => ({ id, full_name, phone, email, created_at }));
    count = result.count;
  } else {
    let query = supabase
      .from("customers")
      .select("id, full_name, phone, email, created_at", { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range((currentPage - 1) * perPage, currentPage * perPage - 1);

    if (q) {
      query = query.ilike("full_name", `%${q}%`);
    }

    const result = await query;
    customers = result.data;
    count = result.count;
  }
  const totalPages = Math.ceil((count ?? 0) / perPage);

  // Fetch recently deleted customers (manager only, for restore)
  let deletedCustomers: { id: string; full_name: string; phone: string; deleted_at: string | null }[] = [];
  if (showDeleted && isManager) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("customers")
      .select("id, full_name, phone, deleted_at")
      .eq("garage_id", session.garageId)
      .not("deleted_at", "is", null)
      .gte("deleted_at", thirtyDaysAgo)
      .order("deleted_at", { ascending: false });
    deletedCustomers = (data ?? []) as typeof deletedCustomers;
  }

  return (
    <PageContainer width="full">
      <CustomersListRealtime garageId={session.garageId} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <Link href="/app/customers/new">
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        </Link>
      </div>

      <form className="mt-4 flex flex-wrap items-center gap-3" action="/app/customers">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            placeholder="Search by name..."
            defaultValue={q}
            className="pl-9"
          />
        </div>
        <Link
          href={filterOpenJob ? "/app/customers" : "/app/customers?openJob=true"}
          className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
            filterOpenJob
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input hover:bg-accent"
          }`}
        >
          Has open job
        </Link>
        {isManager && (
          <Link
            href={showDeleted ? "/app/customers" : "/app/customers?deleted=true"}
            className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
              showDeleted
                ? "border-destructive bg-destructive text-destructive-foreground"
                : "border-input hover:bg-accent"
            }`}
          >
            Recently Deleted
          </Link>
        )}
      </form>

      {showDeleted && isManager && (
        deletedCustomers.length === 0 ? (
          <EmptyState title="No recently deleted customers" description="Deleted customers appear here for 30 days." className="mt-8" />
        ) : (
          <div className="mt-4 rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deletedCustomers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.full_name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      <TelLink
                        phone={c.phone}
                        label={`Call ${c.full_name}`}
                        className="hover:underline underline-offset-4"
                      >
                        {c.phone}
                      </TelLink>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(c.deleted_at!).toLocaleDateString("en-GB")}
                    </TableCell>
                    <TableCell><RestoreButton customerId={c.id} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {showDeleted ? null : (!customers || customers.length === 0) ? (
        <EmptyState
          illustration={GarageOwnerWelcomingCustomersIllustration}
          title={q ? "No customers found" : "No customers yet"}
          description={q ? `No results for "${q}"` : "Add your first customer to get started."}
          actionLabel={q ? undefined : "Add Customer"}
          actionHref={q ? undefined : "/app/customers/new"}
          className="mt-8"
        />
      ) : (
        <>
          {/* Mobile card list — P38.2. The phone wraps in TelLink with
              stopPropagation so a tap on the number dials, while a tap
              elsewhere in the card still navigates to the customer
              detail. Same nested-anchor pattern as `tech/page.tsx`. */}
          <ul className="mt-4 space-y-2 md:hidden">
            {customers.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/app/customers/${c.id}`}
                  className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
                >
                  <div className="font-medium">{c.full_name}</div>
                  <TelLink
                    phone={c.phone}
                    label={`Call ${c.full_name}`}
                    className="mt-1 inline-flex font-mono text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
                  >
                    {c.phone}
                  </TelLink>
                  {c.email && (
                    <div className="mt-1 truncate text-sm text-muted-foreground">
                      {c.email}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop table — md and up */}
          <div className="mt-4 hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/app/customers/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.full_name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      <TelLink
                        phone={c.phone}
                        label={`Call ${c.full_name}`}
                        className="hover:underline underline-offset-4"
                      >
                        {c.phone}
                      </TelLink>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {c.email ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              {currentPage > 1 && (
                <Link href={`/app/customers?q=${q ?? ""}&page=${currentPage - 1}`}>
                  <Button variant="outline" size="sm">Previous</Button>
                </Link>
              )}
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              {currentPage < totalPages && (
                <Link href={`/app/customers?q=${q ?? ""}&page=${currentPage + 1}`}>
                  <Button variant="outline" size="sm">Next</Button>
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
