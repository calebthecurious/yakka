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

// Exact public paths.
const PUBLIC_PATHS = new Set(["/login", "/signup"]);
// Public path prefixes: /auth/* (OAuth callback etc.) and /u/* (public profiles).
const PUBLIC_PREFIXES = ["/auth/", "/u/"];
const PROFILE_SETUP_PATH = "/profile/setup";

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve where they were headed so we can bounce back after login.
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && !request.nextUrl.pathname.startsWith(PROFILE_SETUP_PATH)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("handle")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.handle) {
      const url = request.nextUrl.clone();
      url.pathname = PROFILE_SETUP_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // IMPORTANT: return supabaseResponse unchanged so the refreshed cookies stick.
  return supabaseResponse;
}
