import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env so the middleware doesn't need real Supabase credentials.
vi.mock("@/lib/env", () => ({
  getEnv: (key: string) =>
    key === "NEXT_PUBLIC_SUPABASE_URL"
      ? "https://example.supabase.co"
      : "anon-key",
}));

// Controllable Supabase mock: getUser() and the profiles query resolve with
// whatever the current handlers return. Tests swap the handlers per-case.
let getUserImpl: () => PromiseLike<unknown>;
let profileImpl: () => PromiseLike<unknown>;

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: () => getUserImpl() },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => profileImpl(),
        }),
      }),
    }),
  }),
}));

import { NextRequest } from "next/server";
import { updateSession, withTimeout, TIMEOUT } from "./middleware";

const NEVER = new Promise<never>(() => {}); // hangs forever

function req(path: string): NextRequest {
  return new NextRequest(new URL(`https://app.test${path}`));
}

beforeEach(() => {
  getUserImpl = () => Promise.resolve({ data: { user: null } });
  profileImpl = () => Promise.resolve({ data: null });
});

describe("withTimeout", () => {
  it("returns the resolved value when the promise wins", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it("returns the TIMEOUT sentinel when the promise hangs", async () => {
    await expect(withTimeout(NEVER, 20)).resolves.toBe(TIMEOUT);
  });

  it("resolves promptly even if the underlying promise never settles", async () => {
    const start = Date.now();
    await withTimeout(NEVER, 20);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe("updateSession — Supabase hang does not hang the middleware", () => {
  it("does not hang a public path when getUser() never resolves", async () => {
    getUserImpl = () => NEVER;
    // If the timeout guard were missing, this await would never resolve and the
    // test would time out — reproducing the 504 MIDDLEWARE_INVOCATION_TIMEOUT.
    const res = await updateSession(req("/"));
    expect(res.status).toBe(200); // rendered as logged-out, site stays up
  });

  it("bounces a protected path to /login when getUser() hangs, preserving ?next", async () => {
    getUserImpl = () => NEVER;
    const res = await updateSession(req("/syllabi"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
    // The bounce-back contract: where they were headed is preserved.
    expect(location).toContain("next=%2Fsyllabi");
  });

  it("lets a logged-in user through when the profiles query hangs", async () => {
    getUserImpl = () =>
      Promise.resolve({ data: { user: { id: "u1" } } });
    profileImpl = () => NEVER; // profile lookup stalls
    const res = await updateSession(req("/syllabi"));
    expect(res.status).toBe(200); // fail open, not blocked on the setup redirect
  });

  it("still redirects a handle-less user to /profile/setup (wrapper didn't break it)", async () => {
    getUserImpl = () =>
      Promise.resolve({ data: { user: { id: "u1" } } });
    profileImpl = () => Promise.resolve({ data: { handle: null } });
    const res = await updateSession(req("/syllabi"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/profile/setup");
  });
});
