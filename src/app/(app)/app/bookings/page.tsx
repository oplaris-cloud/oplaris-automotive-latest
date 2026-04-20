import { CalendarCheck } from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { RiskAnalysisIllustration } from "@/components/illustrations";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/app/page-container";
import { PassbackBadge } from "@/components/ui/passback-badge";
import { RegPlate } from "@/components/ui/reg-plate";
import { BookingsListRealtime } from "@/lib/realtime/shims";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  summarisePassback,
  type PassbackItem,
} from "@/lib/constants/passback-items";
import {
  getCategoryStyles,
  type ServiceKind,
} from "@/lib/constants/service-categories";
import { PromoteButton } from "./PromoteButton";
import { DismissButton } from "./DismissButton";

export default async function BookingsPage() {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();

  // Passbacks and any priority > 0 sort to the top; RLS already filters
  // the rows to what the manager can see.
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .is("job_id", null)
    .is("deleted_at", null)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  return (
    <PageContainer width="full">
      <BookingsListRealtime garageId={session.garageId} />
      <h1 className="text-2xl font-semibold">Check-ins</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        All check-ins waiting to become jobs — walk-ins, kiosk submissions, and MOT pass-backs.
      </p>

      {!bookings || bookings.length === 0 ? (
        <EmptyState
          illustration={RiskAnalysisIllustration}
          title="No pending check-ins"
          description="Walk-in check-ins from the reception kiosk will appear here."
          className="mt-8"
        />
      ) : (
        <>
          {/* P38.2 — Mobile cards (<md). One row per check-in, action sticks to bottom. */}
          <ul className="mt-6 space-y-3 md:hidden">
            {bookings.map((b) => {
              const isPassback = !!b.passed_from_job_id;
              const styles = getCategoryStyles(b.service as ServiceKind, {
                isPassback,
                priority: b.priority ?? 0,
              });
              const summary = summarisePassback(
                b.passback_items as PassbackItem[] | null,
              );
              return (
                <li
                  key={b.id}
                  className={`rounded-lg border bg-card p-4 ${styles.border}`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={`capitalize ${styles.badge}`}
                    >
                      {b.service}
                    </Badge>
                    {isPassback ? <PassbackBadge /> : null}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(b.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <div className="mt-2 font-medium">{b.customer_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.customer_phone}
                  </div>
                  <div className="mt-2">
                    <RegPlate reg={b.registration} size="sm" />
                    {b.make ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {b.make} {b.model ?? ""}
                      </span>
                    ) : null}
                  </div>
                  {summary ? (
                    <div className="mt-2 text-xs text-warning">
                      {summary}
                      {b.passback_note ? ` — ${b.passback_note}` : ""}
                    </div>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <PromoteButton
                      bookingId={b.id}
                      className={styles.button}
                    />
                    <DismissButton bookingId={b.id} />
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop table (md+) */}
          <div className="mt-6 hidden overflow-hidden rounded-lg border md:block">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead className="w-40 text-right">Action</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((b) => {
                const isPassback = !!b.passed_from_job_id;
                const styles = getCategoryStyles(b.service as ServiceKind, {
                  isPassback,
                  priority: b.priority ?? 0,
                });
                const summary = summarisePassback(
                  b.passback_items as PassbackItem[] | null,
                );
                return (
                  <TableRow key={b.id} className={styles.border}>
                    {/* Service — always visible, carries the category colour */}
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant="outline"
                          className={`capitalize ${styles.badge}`}
                        >
                          {b.service}
                        </Badge>
                        {isPassback ? <PassbackBadge /> : null}
                      </div>
                    </TableCell>

                    {/* Customer — identifier, top-weight text */}
                    <TableCell className="align-top">
                      <div className="font-medium">{b.customer_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.customer_phone}
                      </div>
                      {summary ? (
                        <div className="mt-1 text-xs text-warning">
                          {summary}
                          {b.passback_note ? ` — ${b.passback_note}` : ""}
                        </div>
                      ) : null}
                    </TableCell>

                    {/* Vehicle */}
                    <TableCell className="align-top">
                      <RegPlate reg={b.registration} size="sm" />
                      {b.make ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {b.make} {b.model ?? ""}
                        </div>
                      ) : null}
                    </TableCell>

                    {/* Date */}
                    <TableCell className="hidden align-top text-xs text-muted-foreground md:table-cell">
                      {new Date(b.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>

                    {/* Primary action — category-coloured */}
                    <TableCell className="text-right align-top">
                      <PromoteButton
                        bookingId={b.id}
                        className={styles.button}
                      />
                    </TableCell>

                    {/* Destructive action — separated, icon-only, muted */}
                    <TableCell className="border-l align-top">
                      <DismissButton bookingId={b.id} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </>
      )}
    </PageContainer>
  );
}
