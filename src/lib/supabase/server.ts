/**
 * Supabase server client (App Router / RSC + Route Handlers + Server Actions).
 *
 * ============================================================================
 * MANUAL CONFIGURATION CHECKLIST  (Caleb — do these before Google sign-in works)
 * ============================================================================
 *
 * Email/password works with zero extra setup. Google OAuth needs the two
 * dashboards below wired together. The flow is:
 *
 *   Browser → Google → Supabase (<project>.supabase.co/auth/v1/callback)
 *           → our app (/auth/callback) → exchange code → session cookie set.
 *
 * (a) GOOGLE CLOUD CONSOLE  (https://console.cloud.google.com → APIs & Services → Credentials)
 *     1. Create an OAuth 2.0 Client ID → Application type: "Web application".
 *     2. Authorized JavaScript origins:
 *          http://localhost:3000
 *          https://yakka-two.vercel.app
 *     3. Authorized redirect URIs  (this points at SUPABASE, not our app):
 *          https://dzdfeundgibdiyvtajue.supabase.co/auth/v1/callback
 *        (= NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/callback")
 *     4. Copy the generated Client ID and Client Secret.
 *
 * (b) SUPABASE DASHBOARD  (https://supabase.com/dashboard → this project)
 *     1. Authentication → Providers → Google: enable it, paste the Client ID
 *        and Client Secret from step (a)4, save.
 *     2. Authentication → URL Configuration:
 *          - Site URL:  https://yakka-two.vercel.app
 *          - Redirect URLs (allow-list — these are OUR app's callback, one per env):
 *              http://localhost:3000/auth/callback
 *              https://yakka-two.vercel.app/auth/callback
 *     3. (Email/password) Authentication → Providers → Email is on by default.
 *        Decide whether "Confirm email" is required — if on, new signups must
 *        click the emailed link before they can log in.
 *
 * SUPABASE_SERVICE_ROLE_KEY is NOT needed for this auth setup. The anon key +
 * cookie-based SSR session is all email/password and OAuth require. Only add a
 * service-role key later if you need server-side admin operations that bypass
 * Row Level Security (e.g. backfills, webhooks). Keep it server-only if so.
 * ============================================================================
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore — middleware refreshes the session cookie.
          }
        },
      },
    },
  );
}
