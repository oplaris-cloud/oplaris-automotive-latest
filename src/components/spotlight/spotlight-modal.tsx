"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import {
  Briefcase,
  Car,
  MessageSquare,
  Package,
  User,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

/**
 * B5.4 — Global Cmd+K spotlight modal.
 *
 * Cross-entity command palette. Cmd+K (or Ctrl+K on non-Mac) opens
 * it from anywhere inside the manager AppShell; Esc / clicking the
 * scrim closes. Searches fan out via /api/spotlight/search and
 * render five groups (jobs / customers / vehicles / messages /
 * stock) with arrow-key navigation between groups.
 *
 * cmdk's built-in fuzzy filter is disabled — the server already
 * narrowed via SQL ILIKE, and the default would re-filter and often
 * hide rows the server returned.
 */
type Kind = "job" | "customer" | "vehicle" | "message" | "stock";

interface SpotlightItem {
  id: string;
  kind: Kind;
  label: string;
  sublabel: string | null;
  href: string;
}

interface SpotlightGroups {
  jobs: SpotlightItem[];
  customers: SpotlightItem[];
  vehicles: SpotlightItem[];
  messages: SpotlightItem[];
  stock: SpotlightItem[];
}

const EMPTY: SpotlightGroups = {
  jobs: [],
  customers: [],
  vehicles: [],
  messages: [],
  stock: [],
};

const DEBOUNCE_MS = 200;

const KIND_META: Record<
  Kind,
  { icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  job: { icon: Briefcase, label: "Jobs" },
  customer: { icon: User, label: "Customers" },
  vehicle: { icon: Car, label: "Vehicles" },
  message: { icon: MessageSquare, label: "Messages" },
  stock: { icon: Package, label: "Stock" },
};

export function SpotlightModal() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [groups, setGroups] = React.useState<SpotlightGroups>(EMPTY);
  const [loading, setLoading] = React.useState(false);

  // Cmd+K (Ctrl+K on non-Mac) toggles the modal from anywhere inside
  // the shell. Esc is handled by the dialog itself.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cmdOrCtrl = e.metaKey || e.ctrlKey;
      if (cmdOrCtrl && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset state when the modal closes so the next open starts blank.
  React.useEffect(() => {
    if (!open) {
      setQ("");
      setGroups(EMPTY);
    }
  }, [open]);

  // Debounced fetch. AbortController makes a fast typer's stale
  // requests no-op when the next one supersedes them.
  React.useEffect(() => {
    if (!open) return;
    if (q.trim().length === 0) {
      setGroups(EMPTY);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/spotlight/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { groups: SpotlightGroups };
        setGroups(data.groups);
      } catch {
        // AbortError + transient network — UI shows last good state.
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, open]);

  function pick(item: SpotlightItem) {
    setOpen(false);
    router.push(item.href);
  }

  const totalCount =
    groups.jobs.length +
    groups.customers.length +
    groups.vehicles.length +
    groups.messages.length +
    groups.stock.length;

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Search">
      <CommandPrimitive
        shouldFilter={false}
        className="flex size-full flex-col overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground"
      >
        <CommandInput
          placeholder="Search jobs, customers, vehicles, messages, stock…"
          value={q}
          onValueChange={setQ}
          aria-label="Spotlight search"
        />
        <CommandList>
          {q.trim().length === 0 ? (
            <CommandEmpty>Start typing to search across the garage.</CommandEmpty>
          ) : loading && totalCount === 0 ? (
            <CommandEmpty>Searching…</CommandEmpty>
          ) : totalCount === 0 ? (
            <CommandEmpty>No matches.</CommandEmpty>
          ) : (
            <>
              {renderGroup("job", groups.jobs, pick)}
              {groups.jobs.length > 0 && groups.customers.length > 0 ? (
                <CommandSeparator />
              ) : null}
              {renderGroup("customer", groups.customers, pick)}
              {groups.customers.length > 0 && groups.vehicles.length > 0 ? (
                <CommandSeparator />
              ) : null}
              {renderGroup("vehicle", groups.vehicles, pick)}
              {groups.vehicles.length > 0 && groups.messages.length > 0 ? (
                <CommandSeparator />
              ) : null}
              {renderGroup("message", groups.messages, pick)}
              {groups.messages.length > 0 && groups.stock.length > 0 ? (
                <CommandSeparator />
              ) : null}
              {renderGroup("stock", groups.stock, pick)}
            </>
          )}
        </CommandList>
      </CommandPrimitive>
    </CommandDialog>
  );
}

function renderGroup(
  kind: Kind,
  items: SpotlightItem[],
  onPick: (item: SpotlightItem) => void,
) {
  if (items.length === 0) return null;
  const { icon: Icon, label } = KIND_META[kind];
  return (
    <CommandGroup heading={label}>
      {items.map((item) => (
        <CommandItem
          key={`${kind}-${item.id}`}
          value={`${kind}-${item.id}`}
          onSelect={() => onPick(item)}
        >
          <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{item.label}</span>
            {item.sublabel ? (
              <span className="truncate text-xs text-muted-foreground">
                {item.sublabel}
              </span>
            ) : null}
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
