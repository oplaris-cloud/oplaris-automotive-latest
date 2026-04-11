import { Package, AlertTriangle } from "lucide-react";

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

export default async function StockPage() {
  await requireManager();
  const supabase = await createSupabaseServerClient();

  const { data: items } = await supabase
    .from("stock_items")
    .select("id, sku, description, quantity_on_hand, reorder_point, unit_cost_pence, location")
    .order("description", { ascending: true });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Stock</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Parts inventory and stock levels.
      </p>

      {!items || items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No stock items"
          description="Add stock items to track inventory levels."
          className="mt-8"
        />
      ) : (
        <div className="mt-6 rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="hidden sm:table-cell">SKU</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Reorder</TableHead>
                <TableHead className="hidden md:table-cell">Location</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isLow =
                  item.reorder_point != null &&
                  item.quantity_on_hand <= item.reorder_point;
                return (
                  <TableRow key={item.id}>
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
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
