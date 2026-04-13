import {
  Clock,
  Wrench,
  Package,
  MessageSquare,
  CheckCircle2,
  XCircle,
  CalendarCheck,
  Search,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import type { JobStatus } from "@/lib/validation/job-schemas";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; className: string; icon: LucideIcon }
> = {
  draft: {
    label: "Draft",
    className: "bg-info text-info-foreground",
    icon: Clock,
  },
  checked_in: {
    label: "Checked In",
    className: "bg-info text-info-foreground",
    icon: UserCheck,
  },
  booked: {
    label: "Booked",
    className: "bg-info text-info-foreground",
    icon: CalendarCheck,
  },
  in_diagnosis: {
    label: "Diagnosis",
    className: "bg-primary text-primary-foreground",
    icon: Search,
  },
  in_repair: {
    label: "In Repair",
    className: "bg-primary text-primary-foreground",
    icon: Wrench,
  },
  awaiting_parts: {
    label: "Awaiting Parts",
    className: "bg-warning text-warning-foreground",
    icon: Package,
  },
  awaiting_customer_approval: {
    label: "Awaiting Approval",
    className: "bg-warning text-warning-foreground",
    icon: MessageSquare,
  },
  ready_for_collection: {
    label: "Ready",
    className: "bg-success text-success-foreground",
    icon: CheckCircle2,
  },
  completed: {
    label: "Completed",
    className: "bg-success text-success-foreground",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground",
    icon: XCircle,
  },
};

interface StatusBadgeProps {
  status: JobStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
        config.className,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}
