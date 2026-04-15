"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { z } from "zod";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import { ALLOWED_TABLES, type AllowedTable } from "./allowed-tables";

// ---------------------------------------------------------------------------
// Input schema (data-access.md guidance: validate at runtime, not just TS).
// `filter` characters are constrained to the PostgREST/Realtime alphabet so
// a stray user-supplied string can't smuggle in a different filter shape.
// ---------------------------------------------------------------------------

const argsSchema = z.object({
  table: z.enum(ALLOWED_TABLES as readonly [AllowedTable, ...AllowedTable[]]),
  filter: z
    .string()
    .max(512)
    .regex(/^[a-z0-9_=.,()\-]+$/i, "filter contains disallowed characters")
    .optional(),
  event: z.enum(["INSERT", "UPDATE", "DELETE", "*"]).default("*"),
  debounceMs: z.number().int().min(0).max(30_000).default(2_000),
  channelKey: z.string().min(1).max(128).optional(),
});

export type RealtimeRouterRefreshArgs = z.input<typeof argsSchema>;

// ---------------------------------------------------------------------------
// Hook — subscribes to postgres_changes for the given table+filter+event,
// debounces bursts, and calls router.refresh() so the surrounding RSC
// re-runs and React reconciles the new HTML.
//
// One subscription per call site. Supabase multiplexes many channels over
// one WS connection; the per-call channel is unmounted on cleanup so a
// nav away guarantees no leaked listeners.
//
// SSR-safe: the hook is `"use client"` and only runs in the browser; on
// the server it short-circuits because `useEffect` doesn't fire.
// ---------------------------------------------------------------------------

export function useRealtimeRouterRefresh(
  args: RealtimeRouterRefreshArgs,
): void {
  const router = useRouter();
  // Pull each scalar out so the dependency array stays string-stable —
  // a parent re-render that constructs `{ table, filter }` inline each
  // time will not tear down + re-establish the subscription unless one
  // of these primitives actually changes.
  const { table, filter, event, debounceMs, channelKey } = args;

  useEffect(() => {
    const parsed = argsSchema.safeParse({
      table,
      filter,
      event,
      debounceMs,
      channelKey,
    });
    if (!parsed.success) {
      // Loud failure in dev; never silently degrade. The hook lives in
      // the call site's own client component, so this surfaces in the
      // console without taking down the app.
      throw new Error(
        `useRealtimeRouterRefresh: invalid args — ${parsed.error.message}`,
      );
    }
    const valid = parsed.data;

    const supabase = getSupabaseBrowserClient();

    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    const fire = (): void => {
      if (pendingTimer !== null) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        router.refresh();
      }, valid.debounceMs);
    };

    // Each call site gets a unique channel name so multiple hooks on the
    // same page don't collide. The optional channelKey lets a caller pin
    // a name (helpful for log correlation).
    const name =
      valid.channelKey ??
      `rt:${valid.table}:${valid.filter ?? "*"}:${Math.random().toString(36).slice(2, 8)}`;

    const channel: RealtimeChannel = supabase
      .channel(name)
      .on(
        "postgres_changes",
        {
          event: valid.event,
          schema: "public",
          table: valid.table,
          ...(valid.filter ? { filter: valid.filter } : {}),
        },
        () => fire(),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[realtime] ${name} status=${status}`);
        }
      });

    return () => {
      if (pendingTimer !== null) clearTimeout(pendingTimer);
      void supabase.removeChannel(channel);
    };
  }, [table, filter, event, debounceMs, channelKey, router]);
}

// Re-exports so callers don't need to know which file holds what.
export { ALLOWED_TABLES, type AllowedTable } from "./allowed-tables";
export { garageFilter, idInFilter, eqUuidFilter } from "./filters";
