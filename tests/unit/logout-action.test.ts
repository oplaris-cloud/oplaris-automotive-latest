/**
 * Sign-out Server Action contract — verifies the dropdown form's bound
 * action calls supabase.auth.signOut(), busts the layout RSC cache,
 * and redirects to /login. The bug fix (Todoist 6gVQJ3gFrWCf9c2G,
 * "Logout auto-refresh broken") is rooted in the prior route handler
 * not triggering a Next.js navigation when posted from inside a Radix
 * portal-rendered DropdownMenuContent — the action variant uses React's
 * Server Action runtime so cookie clear + cache bust + redirect happen
 * in a single round-trip the RSC client knows to follow.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    // Mirror Next.js: redirect() throws so callers know it never returns.
    const e = new Error(`NEXT_REDIRECT:${path}`);
    (e as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${path};303;`;
    throw e;
  }),
}));

const signOut = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { signOut },
  })),
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/(auth)/logout/actions";

describe("signOutAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls supabase.auth.signOut, revalidates the layout, then redirects to /login", async () => {
    await expect(signOutAction()).rejects.toThrow(/NEXT_REDIRECT:\/login/);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("still redirects to /login when signOut throws (expired session)", async () => {
    signOut.mockRejectedValueOnce(new Error("session_expired"));
    await expect(signOutAction()).rejects.toThrow(/NEXT_REDIRECT:\/login/);
    // Cache bust + redirect must still fire so the user lands on login.
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
