import type { Metadata } from "next";

import { PatternBackground } from "@/components/ui/pattern-background";

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
    <PatternBackground className="min-h-screen" opacity={0.04}>
      <main className="mx-auto flex min-h-screen max-w-sm items-center justify-center p-6">
        <div className="w-full rounded-xl bg-card/95 p-8 shadow-lg backdrop-blur-sm">
          <h1 className="font-heading text-2xl font-semibold">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Oplaris Workshop — staff access only.
          </p>
          <LoginForm next={next} />
        </div>
      </main>
    </PatternBackground>
  );
}
