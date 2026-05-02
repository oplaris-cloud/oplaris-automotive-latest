import Link from "next/link";

import { requireSuperAdmin } from "@/lib/auth/session";
import { readImpersonationCookie } from "@/lib/auth/super-admin-cookie";
import { Shield, Users, Building2, FileText } from "lucide-react";

/**
 * B6.1 — `/admin/*` route gate.
 *
 * Every page below this layout calls `requireSuperAdmin()` first via
 * the layout. Non-super_admin users are redirected to /403; logged-out
 * to /login.
 *
 * The shell is intentionally thin — fewer concepts on screen than the
 * manager UI (ux-audit cognitive-load reference). A red banner makes
 * the privilege level obvious; the cross-garage nav is two links
 * (Garages, Audit log) to keep the surface small.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSuperAdmin();
  const impersonation = await readImpersonationCookie();

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* Top alert: this is the privilege-level signal, intentionally
          loud + non-dismissable. Stays at every level of /admin. */}
      <div className="bg-destructive px-4 py-3 text-destructive-foreground">
        <div className="mx-auto flex max-w-6xl items-center gap-3 text-sm">
          <Shield className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            <strong>Oplaris support mode.</strong> You are{" "}
            {impersonation ? "impersonating a tenant" : "in cross-tenant view"}.
            Every action is logged.
          </span>
          <span className="font-mono text-xs opacity-80">{session.email}</span>
        </div>
      </div>

      <div className="flex flex-1">
        <aside className="w-56 shrink-0 border-r bg-background p-4">
          <h1 className="font-heading text-lg font-semibold">Oplaris Admin</h1>
          <nav className="mt-6 flex flex-col gap-1 text-sm">
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-accent"
            >
              <Building2 className="h-4 w-4" /> Garages
            </Link>
            <Link
              href="/admin/audit"
              className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-accent"
            >
              <FileText className="h-4 w-4" /> Audit log
            </Link>
            <div className="mt-6 border-t pt-3 text-xs text-muted-foreground">
              <Users className="mb-1 inline h-3 w-3" /> v1 — Hossein only
            </div>
          </nav>
        </aside>

        <main className="flex-1 p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
