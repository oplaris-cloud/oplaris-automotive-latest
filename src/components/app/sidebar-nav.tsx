"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import type { StaffRole } from "@/lib/auth/session";

export function SidebarNav({ role, badges }: { role: StaffRole; badges?: Record<string, number> }) {
  const pathname = usePathname();
  return <Sidebar role={role} currentPath={pathname} badges={badges} />;
}
