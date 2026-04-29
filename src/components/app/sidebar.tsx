import Link from "next/link";
import {
  LayoutDashboard,
  Grid3X3,
  Briefcase,
  Users,
  UserSquare,
  Car,
  CalendarCheck,
  BarChart3,
  Package,
  Settings,
  Wrench,
  MessageSquare,
} from "lucide-react";

import type { StaffRole } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { GarageLogo } from "@/components/ui/garage-logo";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: readonly StaffRole[];
}

// P48 role-based access matrix (source of truth: CLAUDE.md "Page access policy").
// Sidebar = union of items whose `roles` intersect the staff member's roles.
const NAV_ITEMS: NavItem[] = [
  {
    href: "/app",
    label: "Today",
    icon: <LayoutDashboard className="h-5 w-5" />,
    roles: ["manager", "mot_tester", "mechanic"],
  },
  {
    // Managers don't need a "My Work" queue — they run the shop from
    // Today / Bay Board / Jobs. If a manager ever needs to work a job
    // hands-on, that's a separate personal tech account.
    href: "/app/tech",
    label: "My Work",
    icon: <Wrench className="h-5 w-5" />,
    roles: ["mot_tester", "mechanic"],
  },
  {
    href: "/app/bookings",
    label: "Check-ins",
    icon: <CalendarCheck className="h-5 w-5" />,
    roles: ["manager"],
  },
  {
    href: "/app/bay-board",
    label: "Bay Board",
    icon: <Grid3X3 className="h-5 w-5" />,
    roles: ["manager"],
  },
  {
    href: "/app/jobs",
    label: "Jobs",
    icon: <Briefcase className="h-5 w-5" />,
    roles: ["manager"],
  },
  {
    href: "/app/customers",
    label: "Customers",
    icon: <Users className="h-5 w-5" />,
    roles: ["manager"],
  },
  // P3.1 — Live staff status board (manager-only). Sits next to Customers
  // because the manager's "who's working" question naturally lives in the
  // people-management cluster.
  {
    href: "/app/staff",
    label: "Staff",
    icon: <UserSquare className="h-5 w-5" />,
    roles: ["manager"],
  },
  {
    href: "/app/vehicles",
    label: "Vehicles",
    icon: <Car className="h-5 w-5" />,
    roles: ["manager"],
  },
  {
    href: "/app/reports",
    label: "Reports",
    icon: <BarChart3 className="h-5 w-5" />,
    roles: ["manager"],
  },
  {
    href: "/app/stock",
    label: "Stock & Warranties",
    icon: <Package className="h-5 w-5" />,
    roles: ["manager"],
  },
  // Migration 047 — Messages between operational tools and Settings.
  // Failed-SMS badge wired in (app)/layout.tsx.
  {
    href: "/app/messages",
    label: "Messages",
    icon: <MessageSquare className="h-5 w-5" />,
    roles: ["manager"],
  },
  {
    href: "/app/settings",
    label: "Settings",
    icon: <Settings className="h-5 w-5" />,
    roles: ["manager"],
  },
];

interface SidebarNavListProps {
  roles: StaffRole[];
  currentPath: string;
  badges?: Record<string, number>;
  /** Called after a nav link click — used by the mobile drawer to close itself. */
  onLinkClick?: () => void;
}

// P38 — pure-list component, used by both the static sidebar (md+) and
// the mobile Sheet drawer (<md). All role filtering happens here so both
// surfaces stay in lock-step with the P48 access matrix.
export function SidebarNavList({
  roles,
  currentPath,
  badges,
  onLinkClick,
}: SidebarNavListProps) {
  const items = NAV_ITEMS.filter((item) =>
    item.roles.some((r) => roles.includes(r)),
  );

  // P56.0 (S-M8) — top + horizontal padding match the app-shell main
  // content (`p-4 sm:p-6`) so the sidebar's first nav link aligns with
  // the page title's baseline; bottom + inner-row padding stay tight
  // (8 px / 4 px) for nav density.
  return (
    <nav
      className="flex flex-col gap-1 px-4 pt-4 pb-2 sm:px-3 sm:pt-3"
      aria-label="Main navigation"
    >
      {items.map((item) => {
        const active =
          currentPath === item.href ||
          (item.href !== "/app" && currentPath.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onLinkClick}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            )}
          >
            {item.icon}
            {item.label}
            {badges?.[item.href] ? (
              <span
                role="status"
                aria-label={`${badges[item.href]} new ${item.label.toLowerCase()}`}
                className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-2 text-[10px] font-bold text-destructive-foreground"
              >
                {badges[item.href]! > 99 ? "99+" : badges[item.href]}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

interface SidebarProps {
  roles: StaffRole[];
  currentPath: string;
  badges?: Record<string, number>;
  /** V1 — Brand display in the sidebar header. Defaults protect any
   *  path that calls Sidebar before the layout wiring lands (tests). */
  garageName?: string;
  garageLogoUrl?: string | null;
  /** V1 — when false, render only the logo (no name) and let it take
   *  the full header slot. */
  garageShowName?: boolean;
}

// Static sidebar: visible at md+ only. <md is handled by the Sheet
// drawer in `app-shell.tsx`.
export function Sidebar({
  roles,
  currentPath,
  badges,
  garageName = "Oplaris Workshop",
  garageLogoUrl = null,
  garageShowName = true,
}: SidebarProps) {
  return (
    <aside
      className="hidden w-56 shrink-0 flex-col border-r bg-sidebar md:flex"
      aria-label="Main navigation"
    >
      <div className="flex h-14 items-center border-b px-4">
        <GarageLogo
          name={garageName}
          logoUrl={garageLogoUrl}
          hideName={!garageShowName}
        />
      </div>
      <SidebarNavList
        roles={roles}
        currentPath={currentPath}
        badges={badges}
      />
      {/* V5.4 — Resale credit line. Small + muted so the garage brand
       *  stays dominant, but always present so the Oplaris signature
       *  travels with the product. */}
      <div className="mt-auto border-t px-4 py-2 text-[11px] text-sidebar-foreground/50">
        Powered by{" "}
        <span className="font-semibold text-sidebar-foreground/70">
          Oplaris
        </span>
      </div>
    </aside>
  );
}
