import { CalendarCheck } from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      <h1 className="text-2xl font-semibold">Bookings Inbox</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        New bookings from the kiosk and online form. Promote to a job to get started.
      </p>

      {!bookings || bookings.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No pending bookings"
          description="New bookings from the kiosk or online form will appear here."
          className="mt-8"
        />
      ) : (
        <div className="mt-6 space-y-3">
          {bookings.map((b) => (
            <Card key={b.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{b.customer_name}</span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {b.source}
                      </Badge>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {b.service}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      <span className="font-mono">{b.registration}</span>
                      {b.make && <span className="ml-2">{b.make} {b.model}</span>}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {b.customer_phone}
                      {b.preferred_date && (
                        <span className="ml-3">
                          Preferred: {new Date(b.preferred_date).toLocaleDateString("en-GB")}
                        </span>
                      )}
                    </div>
                    {b.notes && (
                      <p className="mt-2 text-sm">{b.notes}</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {new Date(b.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
