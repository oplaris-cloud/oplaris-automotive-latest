import { CalendarCheck } from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PromoteButton } from "./PromoteButton";
import { DismissButton } from "./DismissButton";

export default async function BookingsPage() {
  await requireManager();
  const supabase = await createSupabaseServerClient();

  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .is("job_id", null)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Check-ins</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Walk-in check-ins from the reception kiosk. Create a job to get started.
      </p>

      {!bookings || bookings.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No pending check-ins"
          description="Walk-in check-ins from the reception kiosk will appear here."
          className="mt-8"
        />
      ) : (
        <div className="mt-6 rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead className="hidden sm:table-cell">Service</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="font-medium">{b.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{b.customer_phone}</div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-block rounded bg-yellow-400 px-1.5 py-0.5 font-mono text-xs font-bold text-black">
                      {b.registration}
                    </span>
                    {b.make && (
                      <span className="ml-2 text-sm text-muted-foreground">{b.make} {b.model}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="secondary" className="text-xs capitalize">
                      {b.service}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {new Date(b.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <PromoteButton bookingId={b.id} />
                      <DismissButton bookingId={b.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
