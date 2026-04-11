"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/**
 * Subscribe to bay-board–relevant changes for a specific garage.
 *
 * Supabase Realtime filters by `garage_id` in the Postgres filter so
 * cross-tenant changes are never sent to the client — they're filtered
 * at the database level, not in the browser. This is critical for
 * multi-tenant isolation.
 *
 * The caller receives a `RealtimeChannel` that fires on INSERT, UPDATE,
 * and DELETE events on the `jobs` table where `garage_id` matches. The
 * client can then call `getBayBoard()` (server action) to refetch the
 * full board — we don't try to do client-side patching because the
 * nested join shape is complex and server re-render is cheaper than
 * getting it wrong.
 *
 * Returns a cleanup function to unsubscribe.
 */
export function subscribeBayBoard(
  supabase: SupabaseClient,
  garageId: string,
  onUpdate: () => void,
): { channel: RealtimeChannel; unsubscribe: () => void } {
  const channel = supabase
    .channel("bay-board")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "jobs",
        filter: `garage_id=eq.${garageId}`,
      },
      onUpdate,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "job_assignments",
        filter: `garage_id=eq.${garageId}`,
      },
      onUpdate,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "work_logs",
        filter: `garage_id=eq.${garageId}`,
      },
      onUpdate,
    )
    .subscribe();

  return {
    channel,
    unsubscribe: () => supabase.removeChannel(channel),
  };
}
