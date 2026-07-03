/**
 * Session refresh + route protection for Next.js middleware.
 *
 * Runs on every matched request: refreshes the Supabase auth cookie (so server
 * components always see a valid session) and redirects unauthenticated users
 * away from protected routes.
 *
 * Configuration checklist lives at the top of `src/lib/supabase/server.ts`.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";

// Exact public paths. "/" is the marketing landing page — public so logged-out
// visitors see it instead of being bounced to /login. (The redirect TARGETS
// below are unchanged; we only widen the allowlist.)
const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);
// Public path prefixes: /auth/* (OAuth callback etc.) and /u/* (public profiles).
const PUBLIC_PREFIXES = ["/auth/", "/u/"];
const PROFILE_SETUP_PATH = "/profile/setup";

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// Middleware runs on every request. A slow or unreachable Supabase must never
// hang the invocation until Vercel kills it (504 MIDDLEWARE_INVOCATION_TIMEOUT);
// that takes the whole site down, public pages included. Cap each Supabase call
// and degrade gracefully instead. getUser() normally answers in <500ms, so 2.5s
// is ample headroom without approaching Vercel's middleware execution limit.
const SUPABASE_TIMEOUT_MS = 2500;

export const TIMEOUT = Symbol("supabase-timeout");

export async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser(), and do
  // not remove getUser() — it refreshes the auth token. Skipping it can log
  // users out at random.
  const userResult = await withTimeout(
    supabase.auth.getUser(),
    SUPABASE_TIMEOUT_MS,
  );

  if (userResult === TIMEOUT) {
    // Supabase auth didn't answer in time. Fail safe rather than hang the
    // middleware: public paths render as logged-out; protected paths bounce to
    // /login (itself public, so it renders even while Supabase is degraded).
    if (isPublicPath(request.nextUrl.pathname)) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  const {
    data: { user },
  } = userResult;

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve where they were headed so we can bounce back after login.
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && !request.nextUrl.pathname.startsWith(PROFILE_SETUP_PATH)) {
    const profileResult = await withTimeout(
      supabase
        .from("profiles")
        .select("handle")
        .eq("id", user.id)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
    );

    // On timeout, fail open: skip the setup redirect and let the logged-in user
    // through rather than blocking them. The setup nudge is a convenience, not a
    // security gate — the target page re-checks on its own.
    if (profileResult !== TIMEOUT && !profileResult.data?.handle) {
      const url = request.nextUrl.clone();
      url.pathname = PROFILE_SETUP_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // IMPORTANT: return supabaseResponse unchanged so the refreshed cookies stick.
  return supabaseResponse;
}
