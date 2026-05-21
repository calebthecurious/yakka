/**
 * Supabase browser client (Client Components).
 *
 * Used for interactive auth calls that must run in the browser, e.g.
 * `signInWithOAuth` (which redirects the window) and `signInWithPassword`.
 *
 * Configuration checklist (Google Cloud + Supabase dashboard, redirect URLs)
 * lives at the top of `src/lib/supabase/server.ts`.
 *
 * NOTE: these env vars are referenced statically (not via getEnv's dynamic
 * key) so Next.js inlines them into the client bundle at build time.
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
