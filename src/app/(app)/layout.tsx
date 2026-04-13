import { getStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { TopBar } from "@/components/app/top-bar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getStaffSession();

  // If no session, the proxy should have redirected to /login already.
  // This is a fallback; don't render the shell without a session.
  if (!session) return <>{children}</>;

  // Fetch check-in count for sidebar badge (managers only)
  let badges: Record<string, number> | undefined;
  if (session.role === "manager") {
    const supabase = await createSupabaseServerClient();
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .is("job_id", null);
    if (count && count > 0) {
      badges = { "/app/bookings": count };
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarNav role={session.role} badges={badges} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          garageName="Dudley Auto Service"
          userEmail={session.email}
          userRole={session.role}
        />
        <main id="main-content" role="main" className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
