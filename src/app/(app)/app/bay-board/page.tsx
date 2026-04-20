import { requireManager } from "@/lib/auth/session";
import { PageContainer } from "@/components/app/page-container";
import { PatternBackground } from "@/components/ui/pattern-background";
import { getBayBoard } from "../jobs/actions";
import { BayBoardClient } from "./BayBoardClient";
import { BayBoardRealtime } from "@/lib/realtime/shims";

export default async function BayBoardPage() {
  const session = await requireManager();
  const { bays, error } = await getBayBoard();

  if (error) {
    return (
      <PageContainer width="full">
        <h1 className="text-2xl font-semibold">Bay Board</h1>
        <p className="mt-2 text-sm text-destructive">{error}</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="full">
      <BayBoardRealtime garageId={session.garageId} />
      <h1 className="text-2xl font-semibold">Bay Board</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Drag jobs between bays to reassign. Live view of all bays and active jobs.
      </p>

      {/* V4.2 — Hand-drawn car-part pattern at 3% so the board reads
          as "workshop floor" without fighting the bay cards above.
          Opacity is the UX-audit cap for surfaces that sit under data. */}
      <PatternBackground
        className="mt-6 rounded-xl border bg-card/40 p-4"
        opacity={0.03}
      >
        <BayBoardClient initialBays={bays} />
      </PatternBackground>
    </PageContainer>
  );
}
