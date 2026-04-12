import { requireManagerOrTester } from "@/lib/auth/session";
import { getBayBoard } from "../jobs/actions";
import { BayBoardClient } from "./BayBoardClient";

export default async function BayBoardPage() {
  await requireManagerOrTester();
  const { bays, error } = await getBayBoard();

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Bay Board</h1>
        <p className="mt-2 text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Bay Board</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Drag jobs between bays to reassign. Live view of all bays and active jobs.
      </p>

      <div className="mt-6">
        <BayBoardClient initialBays={bays} />
      </div>
    </div>
  );
}
