"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { createStockLocation } from "../settings/stock/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LocationSelectProps {
  locations: { id: string; name: string }[];
  defaultValue?: string | null;
  name?: string;
}

export function LocationSelect({ locations, defaultValue, name = "location" }: LocationSelectProps) {
  const [items, setItems] = useState(locations);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    if (!newName.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createStockLocation(newName.trim());
      if (!result.ok) {
        setError(result.error ?? "Failed");
        return;
      }
      setItems((prev) => [...prev, { id: result.id!, name: newName.trim() }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setShowNew(false);
      // Select the new value by updating the select element
      const sel = document.querySelector(`select[name="${name}"]`) as HTMLSelectElement | null;
      if (sel) sel.value = newName.trim();
    });
  }

  return (
    <div className="space-y-1">
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">— None —</option>
        {items.map((loc) => (
          <option key={loc.id} value={loc.name}>
            {loc.name}
          </option>
        ))}
      </select>

      {showNew ? (
        <div className="flex gap-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New location name"
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } }}
          />
          <Button type="button" size="sm" className="h-8 text-xs" disabled={isPending} onClick={handleCreate}>
            {isPending ? "..." : "Add"}
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setShowNew(false); setNewName(""); }}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Create new location
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
