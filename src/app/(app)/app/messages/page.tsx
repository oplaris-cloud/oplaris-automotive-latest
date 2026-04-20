import { requireManager } from "@/lib/auth/session";
import { PageContainer } from "@/components/app/page-container";
import { MessagesRealtime } from "@/lib/realtime/shims";

import {
  getMessageKpis,
  getMessages,
  getExpiredMots,
} from "./actions";
import { MessagesClient } from "./MessagesClient";
import { ExpiredMotList } from "./ExpiredMotList";

/**
 * Migration 047 — manager Messages page.
 *
 * RSC entry point: fetches the first page of `sms_outbox` rows + the
 * three KPI counts in parallel, hands them to the client component
 * for filtering / pagination / row expansion.
 *
 * Realtime: `MessagesRealtime` subscribes to `sms_outbox` row changes
 * via the universal hook so Twilio status callbacks land in the table
 * without a manual refresh.
 */
export default async function MessagesPage() {
  const session = await requireManager();

  const [kpis, firstPage, expiredMots] = await Promise.all([
    getMessageKpis(),
    getMessages({}, 1),
    getExpiredMots(),
  ]);

  return (
    <PageContainer width="full">
      <MessagesRealtime garageId={session.garageId} />
      <h1 className="text-2xl font-semibold">Messages</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every outbound SMS — quotes, approvals, status codes, MOT
        reminders. Live delivery state from Twilio.
      </p>

      <MessagesClient initialKpis={kpis} initialPage={firstPage} />

      <ExpiredMotList rows={expiredMots} />
    </PageContainer>
  );
}
