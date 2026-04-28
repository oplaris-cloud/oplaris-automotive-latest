"use client";

import * as React from "react";

/** Tap-to-call anchor for tech My Work job/check-in cards (audit F7).
 *
 *  Why this is a Client Component: the surrounding card is wrapped in
 *  an outer `<Link>` (RSC-rendered) so a tap on the phone link would
 *  bubble up and navigate to the job detail. We need
 *  `onClick={(e) => e.stopPropagation()}` to keep the tap focused on
 *  `tel:`. Event handlers cannot be passed to native elements rendered
 *  inside a Server Component (Next 16 / React 19 RSC payload would
 *  fail to serialise — digest 51703861), so the anchor lives behind a
 *  `"use client"` boundary.
 */
interface TelLinkProps {
  phone: string;
  label: string;
  className?: string;
  children?: React.ReactNode;
}

export function TelLink({
  phone,
  label,
  className,
  children,
}: TelLinkProps): React.JSX.Element {
  return (
    <a
      href={`tel:${phone}`}
      onClick={(e) => e.stopPropagation()}
      className={className}
      aria-label={label}
    >
      {children}
    </a>
  );
}
