import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Forbidden",
  robots: { index: false, follow: false },
};

/**
 * 403 landing page used by `requireRole()` when a logged-in user lacks
 * the role required for a route. We keep this page deliberately terse —
 * no route enumeration, no "you tried to access X" messaging.
 */
export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-semibold text-neutral-900">Not allowed</h1>
      <p className="mt-3 text-sm text-neutral-500">
        You&apos;re signed in, but this area isn&apos;t available to your role.
      </p>
      <Link
        href="/app"
        className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Back to workshop
      </Link>
    </main>
  );
}
