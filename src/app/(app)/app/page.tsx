import Link from "next/link";
import { Wrench, MessageSquare, CheckCircle2, CalendarCheck } from "lucide-react";

import { requireStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TodayPage() {
  const session = await requireStaffSession();
  const supabase = await createSupabaseServerClient();

  // Fetch counts in parallel
  const [inProgress, awaitingApproval, readyForCollection, newBookings] =
    await Promise.all([
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["in_diagnosis", "in_repair"])
        .is("deleted_at", null),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "awaiting_customer_approval")
        .is("deleted_at", null),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "ready_for_collection")
        .is("deleted_at", null),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .is("job_id", null),
    ]);

  const cards = [
    {
      title: "Jobs in Progress",
      count: inProgress.count ?? 0,
      icon: Wrench,
      href: "/app/bay-board",
      color: "text-primary",
    },
    {
      title: "Awaiting Approval",
      count: awaitingApproval.count ?? 0,
      icon: MessageSquare,
      href: "/app/jobs",
      color:
        (awaitingApproval.count ?? 0) > 0
          ? "text-warning"
          : "text-muted-foreground",
    },
    {
      title: "Ready for Collection",
      count: readyForCollection.count ?? 0,
      icon: CheckCircle2,
      href: "/app/jobs",
      color: "text-success",
    },
    {
      title: "New Bookings",
      count: newBookings.count ?? 0,
      icon: CalendarCheck,
      href: "/app/bookings",
      color:
        (newBookings.count ?? 0) > 0
          ? "text-info"
          : "text-muted-foreground",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        Good {getGreeting()}, {session.email.split("@")[0]}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Here&apos;s what&apos;s happening today.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.title} href={card.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{card.count}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
