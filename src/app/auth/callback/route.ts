/**
 * OAuth callback: exchanges the `code` returned by Supabase for a session,
 * then redirects to `next` (defaults to "/").
 *
 * The browser flow lands here after Google → Supabase. Supabase appends
 * `?code=...` (and `?next=...` if we set it on signInWithOAuth's redirectTo).
 *
 * Configuration checklist lives at the top of `src/lib/supabase/server.ts`.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only allow same-origin relative redirects to avoid open-redirect abuse.
  const nextParam = searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") ? nextParam : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // In production behind a proxy, prefer the forwarded host so the
      // redirect points at the public URL (e.g. yakka-two.vercel.app), not
      // the internal origin.
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // No code, or exchange failed — send back to login with an error flag.
  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
