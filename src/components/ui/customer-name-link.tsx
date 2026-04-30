"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

/** B3.3 — clickable customer name primitive.
 *
 * Wraps a customer's full name in a link to `/app/customers/[id]` so
 * every staff-side surface that renders `customer.full_name` becomes
 * a one-tap navigation into the customer record. Without `customerId`
 * (e.g. audit-log entries by deleted users) renders inert text so the
 * historical row doesn't pretend to navigate somewhere it can't.
 *
 * Visual rule: the underlying text colour is unchanged — the link is
 * signposted by `hover:underline` only, so the row reads as the same
 * piece of text whether or not the user is moused over it. No layout
 * shift; the focus ring is the existing focus-visible token.
 */
interface CustomerNameLinkProps {
  customerId: string | null | undefined;
  fullName: string;
  className?: string;
}

const LINK_AFFORDANCE =
  "underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm";

export function CustomerNameLink({
  customerId,
  fullName,
  className,
}: CustomerNameLinkProps) {
  if (!customerId) {
    return (
      <span data-slot="customer-name-link" className={className}>
        {fullName}
      </span>
    );
  }
  return (
    <Link
      data-slot="customer-name-link"
      href={`/app/customers/${customerId}`}
      className={cn(LINK_AFFORDANCE, className)}
      aria-label={`View customer ${fullName}`}
    >
      {fullName}
    </Link>
  );
}
