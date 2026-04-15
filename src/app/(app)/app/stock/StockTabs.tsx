"use client";

import { Package, Shield } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface StockTabsProps {
  inventoryTab: React.ReactNode;
  warrantiesTab: React.ReactNode;
  warrantyCount: number;
}

export function StockTabs({ inventoryTab, warrantiesTab, warrantyCount }: StockTabsProps) {
  return (
    <Tabs defaultValue="inventory" className="mt-4">
      <TabsList>
        <TabsTrigger value="inventory" className="gap-1.5">
          <Package className="h-4 w-4" />
          Inventory
        </TabsTrigger>
        <TabsTrigger value="warranties" className="gap-1.5">
          <Shield className="h-4 w-4" />
          Warranties
          {warrantyCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center rounded-full px-2 text-xs">
              {warrantyCount}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="inventory">{inventoryTab}</TabsContent>
      <TabsContent value="warranties">{warrantiesTab}</TabsContent>
    </Tabs>
  );
}
