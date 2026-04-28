import type { BayWithJobs, BayJob } from "../jobs/actions";

export type PendingMoves = Map<string, string>;

export function applyPendingMoves(
  bays: BayWithJobs[],
  pendingMoves: PendingMoves,
): BayWithJobs[] {
  if (pendingMoves.size === 0) return bays;

  const movedByDest = new Map<string, BayJob[]>();
  const stripped: BayWithJobs[] = bays.map((bay) => {
    const remaining: BayJob[] = [];
    for (const job of bay.jobs) {
      const dest = pendingMoves.get(job.id);
      if (dest && dest !== bay.id) {
        const list = movedByDest.get(dest) ?? [];
        list.push(job);
        movedByDest.set(dest, list);
      } else {
        remaining.push(job);
      }
    }
    return { ...bay, jobs: remaining };
  });

  return stripped.map((bay) => {
    const incoming = movedByDest.get(bay.id);
    if (!incoming || incoming.length === 0) return bay;
    return { ...bay, jobs: [...bay.jobs, ...incoming] };
  });
}

export function pruneAcceptedMoves(
  bays: BayWithJobs[],
  prev: PendingMoves,
): PendingMoves {
  if (prev.size === 0) return prev;

  const next = new Map(prev);
  let changed = false;
  for (const [jobId, destBayId] of prev) {
    const reflected = bays.some(
      (b) => b.id === destBayId && b.jobs.some((j) => j.id === jobId),
    );
    if (reflected) {
      next.delete(jobId);
      changed = true;
    }
  }
  return changed ? next : prev;
}
