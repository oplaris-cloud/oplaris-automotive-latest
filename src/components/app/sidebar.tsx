import Link from "next/link";
import {
  LayoutDashboard,
  Grid3X3,
  Briefcase,
  Users,
  Car,
  CalendarCheck,
  BarChart3,
  Package,
  Shield,
  Settings,
  Wrench,
} from "lucide-react";

import type { StaffRole } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: readonly StaffRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/app",
    label: "Today",
    icon: <LayoutDashboard className="h-5 w-5" />,
    roles: ["manager", "mot_tester", "mechanic"],
  },
  {
    href: "/app/bay-board",
    label: "Bay Board",
    icon: <Grid3X3 className="h-5 w-5" />,
    roles: ["manager", "mot_tester"],
  },
  {
    href: "/app/jobs",
    label: "Jobs",
    icon: <Briefcase className="h-5 w-5" />,
    roles: ["manager", "mot_tester"],
  },
  {
    href: "/app/customers",
    label: "Customers",
    icon: <Users className="h-5 w-5" />,
    roles: ["manager", "mot_tester"],
  },
  {
    href: "/app/vehicles",
    label: "Vehicles",
    icon: <Car className="h-5 w-5" />,
    roles: ["manager", "mot_tester"],
  },
  {
    href: "/app/bookings",
    label: "Bookings",
    icon: <CalendarCheck className="h-5 w-5" />,
    roles: ["manager"],
  },
  {
    href: "/app/tech",
    label: "My Work",
    icon: <Wrench className="h-5 w-5" />,
    roles: ["mechanic", "mot_tester"],
  },
  {
    href: "/app/reports",
    label: "Reports",
    icon: <BarChart3 className="h-5 w-5" />,
    roles: ["manager"],
  },
  {
    href: "/app/stock",
    label: "Stock",
    icon: <Package className="h-5 w-5" />,
    roles: ["manager"],
  },
  {
    href: "/app/warranties",
    label: "Warranties",
    icon: <Shield className="h-5 w-5" />,
    roles: ["manager"],
  },
  {
    href: "/app/settings",
    label: "Settings",
    icon: <Settings className="h-5 w-5" />,
    roles: ["manager"],
  },
];

interface SidebarProps {
  role: StaffRole;
  currentPath: string;
}

export function Sidebar({ role, currentPath }: SidebarProps) {
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <aside className="hidden w-56 shrink-0 border-r bg-sidebar md:block" aria-label="Main navigation">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
          Oplaris Workshop
        </span>
      </div>
      <nav className="flex flex-col gap-1 p-2">
        {items.map((item) => {
          const active =
            currentPath === item.href ||
            (item.href !== "/app" && currentPath.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
