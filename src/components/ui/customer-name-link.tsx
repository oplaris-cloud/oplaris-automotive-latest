"use client";

import Link from "next/link";

import { TraderBadge } from "@/components/ui/trader-badge";
import { cn } from "@/lib/utils";

/** B3.3 — clickable customer name primitive.
 *
 * Wraps a customer's full name in a link to `/app/customers/[id]` so
 * every staff-side surface that renders `customer.full_name` becomes
 * a one-tap navigation into the customer record. Without `customerId`
 * (e.g. audit-log entries by deleted users) renders inert text so the
 * historical row doesn't pretend to navigate somewhere it can't.
 *
 * B4 — accepts an optional `isTrader` flag and renders a TraderBadge
 * inline after the name. Centralising it here means every existing
 * call site picks up the badge for free as soon as the row carries
 * `is_trader` in its select.
 *
 * Visual rule: the underlying text colour is unchanged — the link is
 * signposted by `hover:underline` only, so the row reads as the same
 * piece of text whether or not the user is moused over it. No layout
 * shift; the focus ring is the existing focus-visible token.
 */
interface CustomerNameLinkProps {
  customerId: string | null | undefined;
  fullName: string;
  isTrader?: boolean | null;
  className?: string;
}

const LINK_AFFORDANCE =
  "underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm";

export function CustomerNameLink({
  customerId,
  fullName,
  isTrader,
  className,
}: CustomerNameLinkProps) {
  if (!customerId) {
    return (
      <span data-slot="customer-name-link" className={className}>
        {fullName}
        <TraderBadge isTrader={isTrader} />
      </span>
    );
  }
  return (
    <span data-slot="customer-name-link-wrapper" className="inline">
      <Link
        href={`/app/customers/${customerId}`}
        className={cn(LINK_AFFORDANCE, className)}
        aria-label={`View customer ${fullName}`}
      >
        {fullName}
      </Link>
      <TraderBadge isTrader={isTrader} />
    </span>
  );
}
