"use server";

import { recordProfileEvent } from "@/lib/analytics/record-profile-event";

/**
 * Record one profile analytics event (view, section, artefact_click) from the
 * client beacon on /u/[handle]. Fire-and-forget: the shared recorder fails
 * closed and silently (see src/lib/analytics/record-profile-event.ts), and
 * this wrapper swallows anything else, so a failed measurement can never
 * break a recruiter's view of the record. `dwell` goes through the beacon
 * route instead, because it is sent on pagehide via navigator.sendBeacon.
 */
export async function recordProfileView(raw: unknown): Promise<void> {
  try {
    await recordProfileEvent(raw);
  } catch {
    /* the recorder already fails closed; this is belt and braces */
  }
}
