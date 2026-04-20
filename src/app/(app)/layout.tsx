import { getStaffSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app/app-shell";
import { SidebarBadgeRealtime } from "@/lib/realtime/shims";
import { brandStyleBlock, getGarageBrand } from "@/lib/brand/garage-brand";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getStaffSession();

  // If no session, the proxy should have redirected to /login already.
  // This is a fallback; don't render the shell without a session.
  if (!session) return <>{children}</>;

  // V1 — Fetch the garage brand tokens once, render them as a scoped
  // `<style>` block so every shadcn component (which reads `--primary`
  // etc.) re-themes automatically. `getGarageBrand` is React-cached
  // per request, so the follow-on bookings query doesn't pay for
  // another round-trip.
  const brand = await getGarageBrand();

  // Sidebar badges — manager-only. Two surfaces today:
  //   /app/bookings  → unconverted check-ins (existing)
  //   /app/messages  → failed SMS delivery rows (migration 047) so
  //                    Twilio failures stop being invisible
  let badges: Record<string, number> | undefined;
  if (session.roles.includes("manager")) {
    const supabase = await createSupabaseServerClient();
    const [{ count: pendingCheckIns }, { count: failedSms }] = await Promise.all([
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .is("job_id", null)
        .is("deleted_at", null),
      supabase
        .from("sms_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
    ]);
    const next: Record<string, number> = {};
    if (pendingCheckIns && pendingCheckIns > 0) next["/app/bookings"] = pendingCheckIns;
    if (failedSms && failedSms > 0) next["/app/messages"] = failedSms;
    if (Object.keys(next).length > 0) badges = next;
  }

  return (
    <>
      {brand ? (
        <style
          id="garage-brand-tokens"
          // V1 — server-rendered tokens, not user input. No injection
          // surface: the loader validates hex + serialises via the
          // typed `brandStyleBlock` helper.
          dangerouslySetInnerHTML={{ __html: brandStyleBlock(brand) }}
        />
      ) : null}
      <SidebarBadgeRealtime garageId={session.garageId} />
      <AppShell
        roles={session.roles}
        badges={badges}
        garageName={brand?.name ?? "Dudley Auto Service"}
        garageLogoUrl={brand?.logoUrl ?? null}
        garageShowName={brand?.showName ?? true}
        userEmail={session.email}
        userRole={session.roles[0] ?? "mechanic"}
      >
        {children}
      </AppShell>
    </>
  );
}
