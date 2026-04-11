import type { Metadata } from "next";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm items-center justify-center p-6">
      <div className="w-full">
        <h1 className="text-2xl font-semibold text-neutral-900">Sign in</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Oplaris Workshop — staff access only.
        </p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
