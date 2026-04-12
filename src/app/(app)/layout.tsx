import { getStaffSession } from "@/lib/auth/session";
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

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarNav role={session.role} />
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
