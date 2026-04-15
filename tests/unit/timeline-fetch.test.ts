/**
 * P54 — `getJobTimelineEvents` shaping.
 *
 * The fetcher's job once the RLS-aware DB returns rows: attach first-
 * name attribution, filter to the curated customer subset for that
 * audience, and apply the copy map. These tests stub the Supabase
 * client so the assertions focus on shaping.
 */
import { describe, expect, it, vi } from "vitest";

import { getJobTimelineEvents } from "@/lib/timeline/fetch";

interface FakeRow {
  event_id: string;
  job_id: string;
  garage_id: string;
  kind: string;
  actor_staff_id: string | null;
  at: string;
  payload: Record<string, unknown>;
}

const JOB = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const JAKE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SARAH_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeClient(rows: FakeRow[]) {
  const queries: Array<Record<string, unknown>> = [];

  const from = vi.fn((table: string) => {
    if (table === "job_timeline_events") {
      const chain: Record<string, unknown> = {};
      const builder = {
        select: (_: string) => {
          queries.push({ table, action: "select" });
          return chain;
        },
        eq: (_: string, __: unknown) => chain,
        order: (_: string, __: unknown) => chain,
        limit: (_: number) => {
          return Promise.resolve({ data: rows, error: null });
        },
      };
      Object.assign(chain, builder);
      return chain;
    }
    if (table === "staff") {
      const chain: Record<string, unknown> = {};
      const builder = {
        select: (_: string) => chain,
        in: (_: string, _ids: string[]) => {
          return Promise.resolve({
            data: [
              { id: JAKE_ID, full_name: "Jake Smith" },
              { id: SARAH_ID, full_name: "Sarah Hybrid" },
            ],
            error: null,
          });
        },
      };
      Object.assign(chain, builder);
      return chain;
    }
    throw new Error(`Unexpected table ${table}`);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from } as any;
}

describe("getJobTimelineEvents — staff audience", () => {
  it("returns all rows with first-name attribution", async () => {
    const rows: FakeRow[] = [
      {
        event_id: "1",
        job_id: JOB,
        garage_id: "g",
        kind: "passed_to_mechanic",
        actor_staff_id: JAKE_ID,
        at: "2026-04-15T10:00:00Z",
        payload: { note: "knocking sound", items: [] },
      },
      {
        event_id: "2",
        job_id: JOB,
        garage_id: "g",
        kind: "returned_from_mot_tester",
        actor_staff_id: SARAH_ID,
        at: "2026-04-15T09:30:00Z",
        payload: {},
      },
    ];
    const result = await getJobTimelineEvents(JOB, {
      audience: "staff",
      client: makeClient(rows),
    });
    expect(result).toHaveLength(2);
    expect(result[0]!.actorFirstName).toBe("Jake");
    expect(result[1]!.actorFirstName).toBe("Sarah");
    // Staff audience does NOT set customerCopy.
    expect(result[0]!.customerCopy).toBeUndefined();
  });
});

describe("getJobTimelineEvents — customer audience", () => {
  it("filters to the curated subset and applies the copy map", async () => {
    const rows: FakeRow[] = [
      {
        event_id: "1",
        job_id: JOB,
        garage_id: "g",
        kind: "passed_to_mechanic",
        actor_staff_id: JAKE_ID,
        at: "2026-04-15T10:00:00Z",
        payload: { note: "knocking sound" },
      },
      {
        // Filtered — returned_from_mot_tester is not customer-visible.
        event_id: "2",
        job_id: JOB,
        garage_id: "g",
        kind: "returned_from_mot_tester",
        actor_staff_id: SARAH_ID,
        at: "2026-04-15T09:30:00Z",
        payload: {},
      },
      {
        event_id: "3",
        job_id: JOB,
        garage_id: "g",
        kind: "status_changed",
        actor_staff_id: JAKE_ID,
        at: "2026-04-15T09:00:00Z",
        payload: { from_status: "draft", to_status: "ready_for_collection" },
      },
      {
        // Filtered — status_changed whose target isn't in the safe list.
        event_id: "4",
        job_id: JOB,
        garage_id: "g",
        kind: "status_changed",
        actor_staff_id: null,
        at: "2026-04-15T08:00:00Z",
        payload: { from_status: null, to_status: "checked_in" },
      },
      {
        event_id: "5",
        job_id: JOB,
        garage_id: "g",
        kind: "work_running",
        actor_staff_id: SARAH_ID,
        at: "2026-04-15T11:00:00Z",
        payload: { started_at: "2026-04-15T11:00:00Z" },
      },
    ];
    const result = await getJobTimelineEvents(JOB, {
      audience: "customer",
      client: makeClient(rows),
    });

    // Only 3 rows should make the cut (1, 3, 5).
    expect(result.map((r) => r.eventId)).toEqual(["1", "3", "5"]);

    const byId = new Map(result.map((r) => [r.eventId, r]));
    expect(byId.get("1")!.customerCopy!.line).toBe(
      "Passed to mechanic for repair work",
    );
    expect(byId.get("3")!.customerCopy!.line).toBe("Ready for collection");
    expect(byId.get("5")!.customerCopy!.line).toBe(
      "Sarah is working on your car now",
    );
  });

  it("returns an empty list when no rows are customer-visible", async () => {
    const rows: FakeRow[] = [
      {
        event_id: "99",
        job_id: JOB,
        garage_id: "g",
        kind: "returned_from_mot_tester",
        actor_staff_id: null,
        at: "2026-04-15T09:00:00Z",
        payload: {},
      },
    ];
    const result = await getJobTimelineEvents(JOB, {
      audience: "customer",
      client: makeClient(rows),
    });
    expect(result).toEqual([]);
  });
});
