import Link from "next/link";
import { Shield, Package, ScrollText } from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  await requireManager();

  const links = [
    { href: "/app/settings/audit-log", label: "Audit Log", description: "View all staff actions", icon: ScrollText },
    { href: "/app/stock", label: "Stock", description: "Parts inventory", icon: Package },
    { href: "/app/warranties", label: "Warranties", description: "Active warranty coverage", icon: Shield },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <l.icon className="h-5 w-5 text-muted-foreground" />
                  {l.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{l.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
