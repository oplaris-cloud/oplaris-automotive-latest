import { AlertTriangle, Phone } from "lucide-react";

import { CustomerNameLink } from "@/components/ui/customer-name-link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RegPlate } from "@/components/ui/reg-plate";
import { TelLink } from "@/components/ui/tel-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

import type { ExpiredMotRow } from "./actions";

/**
 * Migration 047 — Step 5f.
 *
 * The receptionist's call list. Renders vehicles whose MOT has
 * expired but for which we can't auto-send a reminder (the cron
 * only fires at -30 / -7 / -5 days; once a vehicle is past 0 the
 * reminder train has already left). Manager taps the phone number
 * to call the customer directly.
 */
export function ExpiredMotList({ rows }: { rows: ExpiredMotRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Expired MOTs</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Nothing expired"
            description="Vehicles past their MOT expiry will appear here as a manual call list."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-8 border-warning/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Expired MOTs ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Mobile cards */}
        <ul className="space-y-2 md:hidden">
          {rows.map((r) => (
            <li
              key={r.vehicleId}
              className="rounded-lg border p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <RegPlate
                  reg={r.registration}
                  size="default"
                  vehicleId={r.vehicleId}
                />
                <span
                  className={
                    r.daysOverdue > 30
                      ? "text-xs font-semibold text-foreground"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {r.daysOverdue} {r.daysOverdue === 1 ? "day" : "days"} overdue
                </span>
              </div>
              <div className="mt-2 text-sm">
                {r.customerName ? (
                  <CustomerNameLink
                    customerId={r.customerId}
                    fullName={r.customerName}
                  />
                ) : (
                  "—"
                )}
              </div>
              {r.customerPhone ? (
                <TelLink
                  phone={r.customerPhone}
                  label={`Call ${r.customerName ?? "customer"}`}
                  className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <Phone className="h-4 w-4" />
                  {r.customerPhone}
                </TelLink>
              ) : null}
            </li>
          ))}
        </ul>

        {/* Desktop table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reg</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Expired</TableHead>
                <TableHead className="text-right">Days overdue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.vehicleId}>
                  <TableCell>
                    <RegPlate
                      reg={r.registration}
                      size="sm"
                      vehicleId={r.vehicleId}
                    />
                  </TableCell>
                  <TableCell>
                    {r.customerName ? (
                      <CustomerNameLink
                        customerId={r.customerId}
                        fullName={r.customerName}
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {r.customerPhone ? (
                      <TelLink
                        phone={r.customerPhone}
                        label={`Call ${r.customerName ?? "customer"}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {r.customerPhone}
                      </TelLink>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(r.expiredOn).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell
                    className={
                      r.daysOverdue > 30
                        ? "text-right font-semibold text-foreground"
                        : "text-right"
                    }
                  >
                    {r.daysOverdue}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
