import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireManager } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const moveSchema = z.object({
  jobId: z.string().uuid(),
  bayId: z.string().uuid(),
});

/**
 * POST /api/bay-board/move — move a job to a different bay.
 * Manager-only. Used by the drag-and-drop bay board.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  await requireManager();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("jobs")
    .update({ bay_id: parsed.data.bayId })
    .eq("id", parsed.data.jobId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
