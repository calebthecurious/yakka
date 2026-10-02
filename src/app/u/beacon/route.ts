import { recordProfileEvent } from "@/lib/analytics/record-profile-event";

/**
 * Beacon endpoint for the `dwell` event (P5.4b). The only route handler the
 * analytics layer has, and it exists for one reason: dwell is sent on
 * pagehide / visibilitychange→hidden via `navigator.sendBeacon`, which can
 * only POST to a URL — it cannot invoke a Server Action. Everything else
 * (view, section, artefact_click) uses the Server Action.
 *
 * It lives at /u/beacon, under the public-profile prefix, because the auth
 * middleware redirects every non-public path (including /api/*) to /login
 * and a redirected beacon is a lost event. The proper home is a public-path
 * entry in src/lib/supabase/middleware.ts; that file is an auth-QA guarded
 * domain, so it is left for a paired supabase-auth-qa change rather than
 * edited here. Until then "beacon" is a reserved handle.
 *
 * Always 204. The recorder fails closed and silently; a client that is
 * unloading cannot act on a response anyway, and no detail about what was or
 * was not stored should leak back.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  try {
    await recordProfileEvent(body);
  } catch {
    /* fail closed */
  }
  return new Response(null, { status: 204 });
}
