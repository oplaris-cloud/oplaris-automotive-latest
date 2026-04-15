import { Package, AlertTriangle, Shield } from "lucide-react";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddStockDialog } from "./AddStockDialog";
import { EditStockButton, RecordMovementButton } from "./StockRowActions";
import { WarrantyRowActions } from "../warranties/WarrantyRowActions";
import { getStockLocations } from "../settings/stock/actions";
import { StockTabs } from "./StockTabs";
import { StockRealtime } from "@/lib/realtime/shims";

function isExpired(d: string): boolean {
  return new Date(d) < new Date();
}

function daysUntil(d: string): number {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function claimBadge(status: string) {
  switch (status) {
    case "claimed":
      return <Badge variant="outline" className="border-warning text-warning">Claimed</Badge>;
    case "resolved":
      return <Badge variant="outline" className="border-success text-success">Resolved</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    default:
      return null;
  }
}

export default async function StockPage() {
  const session = await requireManager();
  const supabase = await createSupabaseServerClient();

  const [{ data: items }, locations, { data: warranties }] = await Promise.all([
    supabase
      .from("stock_items")
      .select("id, sku, description, quantity_on_hand, reorder_point, unit_cost_pence, location")
      .order("description", { ascending: true }),
    getStockLocations(),
    supabase
      .from("warranties")
      .select(`
        id, supplier, purchase_date, expiry_date,
        invoice_reference, notes, claim_status, claim_reason, claim_resolution,
        voided_at,
        stock_items!stock_item_id ( id, description, sku )
      `)
      .is("voided_at", null)
      .order("expiry_date", { ascending: true }),
  ]);

  const activeWarranties = (warranties ?? []).filter((w) => !isExpired(w.expiry_date));
  const expiredWarranties = (warranties ?? []).filter((w) => isExpired(w.expiry_date));
  const warrantyCount = activeWarranties.length;

  const inventoryTab = (
    <>
      {!items || items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No stock items"
          description="Add stock items to track inventory levels."
          className="mt-6"
        />
      ) : (
        <>
          {/* P38.2 — Mobile cards (<md) */}
          <ul className="mt-4 space-y-2 md:hidden">
            {(items ?? []).map((item) => {
              const isLow =
                item.reorder_point != null &&
                item.quantity_on_hand <= item.reorder_point;
              return (
                <li
                  key={item.id}
                  className={`rounded-lg border bg-card p-4 ${
                    isLow ? "border-warning/40 bg-warning/5" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{item.description}</div>
                      {item.sku && (
                        <div className="font-mono text-xs text-muted-foreground">
                          {item.sku}
                        </div>
                      )}
                    </div>
                    {isLow ? (
                      <Badge
                        variant="outline"
                        className="border-warning text-warning"
                      >
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Low
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-success text-success"
                      >
                        OK
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-sm">
                    <span className="font-mono">Qty {item.quantity_on_hand}</span>
                    {item.reorder_point != null && (
                      <span className="text-muted-foreground">
                        reorder ≤ {item.reorder_point}
                      </span>
                    )}
                    {item.location && (
                      <span className="text-muted-foreground">
                        · {item.location}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <EditStockButton item={item} locations={locations} />
                    <RecordMovementButton itemId={item.id} />
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop table (md+) */}
          <div className="mt-4 hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="hidden sm:table-cell">SKU</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">Reorder</TableHead>
                  <TableHead className="hidden md:table-cell">Location</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(items ?? []).map((item) => {
                  const isLow =
                    item.reorder_point != null &&
                    item.quantity_on_hand <= item.reorder_point;
                  return (
                    <TableRow key={item.id} className={isLow ? "bg-warning/5" : ""}>
                      <TableCell className="font-medium">{item.description}</TableCell>
                      <TableCell className="hidden font-mono text-sm text-muted-foreground sm:table-cell">
                        {item.sku ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {item.quantity_on_hand}
                      </TableCell>
                      <TableCell className="hidden text-right text-sm text-muted-foreground sm:table-cell">
                        {item.reorder_point ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {item.location ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {isLow ? (
                          <Badge variant="outline" className="border-warning text-warning">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Low
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-success text-success">
                            OK
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <EditStockButton item={item} locations={locations} />
                          <RecordMovementButton itemId={item.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );

  const warrantiesTab = (
    <>
      {(warranties ?? []).length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No part warranties"
          description="Add warranty details when creating stock items."
          className="mt-6"
        />
      ) : (
        <>
          {activeWarranties.length > 0 && (
            <>
              {/* P38.2 — Mobile cards (<md) */}
              <ul className="mt-4 space-y-2 md:hidden">
                {activeWarranties.map((w) => {
                  const stockItem = Array.isArray(w.stock_items)
                    ? w.stock_items[0]
                    : w.stock_items;
                  const dl = daysUntil(w.expiry_date);
                  return (
                    <li
                      key={w.id}
                      className={`rounded-lg border bg-card p-4 ${
                        dl <= 30 ? "border-warning/40 bg-warning/5" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">
                            {(stockItem as { description: string } | null)?.description ?? "—"}
                          </div>
                          {(stockItem as { sku?: string | null } | null)?.sku && (
                            <div className="font-mono text-xs text-muted-foreground">
                              {(stockItem as { sku: string }).sku}
                            </div>
                          )}
                          <div className="mt-1 text-sm">{w.supplier}</div>
                          {w.invoice_reference && (
                            <div className="text-xs text-muted-foreground">
                              ref {w.invoice_reference}
                            </div>
                          )}
                        </div>
                        {dl <= 30 ? (
                          <Badge
                            variant="outline"
                            className="border-warning text-warning"
                          >
                            <AlertTriangle className="mr-1 h-3 w-3" /> {dl}d
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-success text-success"
                          >
                            <Shield className="mr-1 h-3 w-3" /> {dl}d
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {claimBadge(w.claim_status)}
                        <WarrantyRowActions warranty={w} />
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Desktop table (md+) */}
              <div className="mt-4 hidden rounded-lg border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stock Item</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="hidden sm:table-cell">Ref</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Claim</TableHead>
                      <TableHead className="w-28"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeWarranties.map((w) => {
                      const stockItem = Array.isArray(w.stock_items) ? w.stock_items[0] : w.stock_items;
                      const dl = daysUntil(w.expiry_date);
                      return (
                        <TableRow key={w.id} className={dl <= 30 ? "bg-warning/5" : ""}>
                          <TableCell>
                            <div className="font-medium">
                              {(stockItem as { description: string } | null)?.description ?? "—"}
                            </div>
                            {(stockItem as { sku?: string | null } | null)?.sku && (
                              <div className="text-xs text-muted-foreground font-mono">
                                {(stockItem as { sku: string }).sku}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{w.supplier}</TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                            {w.invoice_reference || "—"}
                          </TableCell>
                          <TableCell>
                            {dl <= 30 ? (
                              <Badge variant="outline" className="border-warning text-warning">
                                <AlertTriangle className="mr-1 h-3 w-3" /> {dl}d
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-success text-success">
                                <Shield className="mr-1 h-3 w-3" /> {dl}d
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{claimBadge(w.claim_status)}</TableCell>
                          <TableCell>
                            <WarrantyRowActions warranty={w} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {expiredWarranties.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Expired ({expiredWarranties.length})
              </h3>
              <div className="rounded-lg border opacity-60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stock Item</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Expired</TableHead>
                      <TableHead>Claim</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiredWarranties.map((w) => {
                      const stockItem = Array.isArray(w.stock_items) ? w.stock_items[0] : w.stock_items;
                      return (
                        <TableRow key={w.id}>
                          <TableCell className="text-sm">
                            {(stockItem as { description: string } | null)?.description ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm">{w.supplier}</TableCell>
                          <TableCell className="text-sm">{w.expiry_date}</TableCell>
                          <TableCell>{claimBadge(w.claim_status)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <div>
      <StockRealtime garageId={session.garageId} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Stock & Warranties</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Parts inventory, stock levels, and supplier warranties.
          </p>
        </div>
        <AddStockDialog locations={locations} stockItems={items ?? []} />
      </div>

      <StockTabs
        inventoryTab={inventoryTab}
        warrantiesTab={warrantiesTab}
        warrantyCount={warrantyCount}
      />
    </div>
  );
}
