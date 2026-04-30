"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Sidebar, SidebarNavList } from "./sidebar";
import { TopBar } from "./top-bar";
import type { StaffRole } from "@/lib/auth/session";

interface AppShellProps {
  roles: StaffRole[];
  badges?: Record<string, number>;
  garageName: string;
  /** V1 — optional uploaded logo URL. When null, the sidebar + drawer
   *  render a text wordmark in the brand colour via GarageLogo. */
  garageLogoUrl?: string | null;
  /** V1 — when false, the sidebar header renders only the logo (no
   *  business name), so a wordmark logo takes the full slot. */
  garageShowName?: boolean;
  userEmail: string;
  userRole: string;
  children: React.ReactNode;
}

// P38.1 — Static sidebar at md+, mobile Sheet drawer below. The TopBar
// hamburger toggles `drawerOpen`. Each nav link inside the drawer closes
// it on click; ESC + scrim close are handled by the Sheet primitive.
export function AppShell({
  roles,
  badges,
  garageName,
  garageLogoUrl,
  garageShowName = true,
  userEmail,
  userRole,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        roles={roles}
        currentPath={pathname}
        badges={badges}
        garageName={garageName}
        garageLogoUrl={garageLogoUrl ?? null}
        garageShowName={garageShowName}
      />

      {/* Mobile drawer — rendered always so the Sheet can animate; only
          actually visible when drawerOpen flips true.
          Hardcoded slate-900 sidebar — revisit when multi-garage
          white-label ships per 2026-04-27 decision (STAGING_FIX_PLAN.md). */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="w-64 bg-slate-900 p-0 text-white"
        >
          <SheetHeader className="border-b border-white/10 px-4 py-3">
            <SheetTitle className="text-left text-white">
              {garageName}
            </SheetTitle>
          </SheetHeader>
          <SidebarNavList
            roles={roles}
            currentPath={pathname}
            badges={badges}
            onLinkClick={() => setDrawerOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          userEmail={userEmail}
          userRole={userRole}
          onMenuClick={() => setDrawerOpen(true)}
        />
        <main
          key={pathname}
          id="main-content"
          role="main"
          className="page-fade-in flex-1 overflow-y-auto p-4 sm:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
