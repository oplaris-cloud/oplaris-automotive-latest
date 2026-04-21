import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { PassbackBadge } from "@/components/ui/passback-badge";
import { PASSBACK_LABEL_BY_VALUE, type PassbackItem } from "@/lib/constants/passback-items";
import { formatWorkLogTime } from "@/lib/format";

/** Audit F5 (2026-04-20) — Pass-back context for the mechanic.
 *
 *  When a mechanic opens `/app/tech/job/[id]` and the job has an
 *  unreturned `job_passbacks` row, render the ticked items + free-text
 *  note + who passed it back so the mechanic sees the MOT tester's
 *  flagged issues without leaving the tech UI for the manager view.
 *
 *  Display-only RSC. Visibility is gated server-side in `page.tsx`
 *  (mechanic-only render + null-coalesce on `returned_at`). Tenant
 *  isolation comes from the `job_passbacks_select` RLS policy, not
 *  this component.
 */

const FROM_ROLE_LABEL: Record<string, string> = {
  mot_tester: "MOT tester",
  mechanic: "mechanic",
  manager: "manager",
};

interface PassbackContextCardProps {
  items: PassbackItem[] | null;
  note: string | null;
  createdAt: string;
  fromRole: string | null;
}

export function PassbackContextCard({
  items,
  note,
  createdAt,
  fromRole,
}: PassbackContextCardProps) {
  const fromRoleLabel = fromRole ? FROM_ROLE_LABEL[fromRole] ?? fromRole : "previous handler";
  const itemList = Array.isArray(items) ? items : [];

  return (
    <Section
      title="Passed back from MOT"
      description={`${formatWorkLogTime(createdAt)} · from ${fromRoleLabel}`}
      className="mb-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <PassbackBadge />
        {itemList.map((entry) => {
          const label = PASSBACK_LABEL_BY_VALUE[entry.item] ?? entry.item;
          return (
            <Badge
              key={entry.item}
              variant="secondary"
              className="bg-warning/15 text-foreground"
            >
              {entry.detail ? `${label} (${entry.detail})` : label}
            </Badge>
          );
        })}
      </div>
      {note ? (
        <blockquote className="mt-3 border-l-2 border-warning/40 pl-3 text-sm text-muted-foreground">
          {note}
        </blockquote>
      ) : null}
    </Section>
  );
}
