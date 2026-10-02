import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { profileViewEvents, profiles, syllabi } from "@/db/schema";
import { getCurrentUserId } from "@/lib/auth";
import { ProfileViewInput, toProfileViewRow, type ProfileViewRow } from "./profile-view";

/**
 * The server half of profile analytics, shared by the server action (view,
 * section, artefact_click) and the beacon route (dwell via sendBeacon).
 *
 * FAILS CLOSED, SILENTLY. Measurement must never surface to the viewer and
 * must never break the page: every failure path — bad input, unknown handle,
 * a database without the table yet (prod before the G-gate applies 0016), a
 * network error — resolves to `{ recorded: false }`. Nothing here throws to a
 * caller. The dependencies are injectable so the fail-closed contract is
 * unit-tested without a database (record-profile-event.test.ts).
 */

export interface RecordDeps {
  findProfileId(handle: string): Promise<string | null>;
  findSyllabusId(profileId: string): Promise<string | null>;
  currentUserId(): Promise<string | null>;
  insert(row: ProfileViewRow): Promise<void>;
  /** Where failures are reported. Defaults to console.warn, once per reason. */
  warn?(message: string): void;
}

export type RecordOutcome =
  | { recorded: true }
  | { recorded: false; reason: "invalid_input" | "unknown_profile" | "store_failed" };

/** The real dependencies: Drizzle over the app connection, session via Supabase. */
export const liveDeps: RecordDeps = {
  async findProfileId(handle) {
    const [p] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.handle, handle))
      .limit(1);
    return p?.id ?? null;
  },
  async findSyllabusId(profileId) {
    // The same syllabus the page rendered: featured, else most recent.
    const [featured] = await db
      .select({ id: syllabi.id })
      .from(syllabi)
      .where(and(eq(syllabi.userId, profileId), eq(syllabi.isFeaturedOnProfile, true)))
      .limit(1);
    if (featured) return featured.id;
    const [recent] = await db
      .select({ id: syllabi.id })
      .from(syllabi)
      .where(eq(syllabi.userId, profileId))
      .orderBy(desc(syllabi.createdAt))
      .limit(1);
    return recent?.id ?? null;
  },
  currentUserId: () => getCurrentUserId(),
  async insert(row) {
    await db.insert(profileViewEvents).values(row);
  },
};

const warnedReasons = new Set<string>();
function warnOnce(warn: (m: string) => void, key: string, message: string) {
  if (warnedReasons.has(key)) return;
  warnedReasons.add(key);
  warn(message);
}

export async function recordProfileEvent(
  raw: unknown,
  deps: RecordDeps = liveDeps,
): Promise<RecordOutcome> {
  const warn = deps.warn ?? ((m: string) => console.warn(m));
  const parsed = ProfileViewInput.safeParse(raw);
  if (!parsed.success) return { recorded: false, reason: "invalid_input" };
  const input = parsed.data;

  try {
    const profileId = await deps.findProfileId(input.handle);
    if (!profileId) return { recorded: false, reason: "unknown_profile" };
    const syllabusId = await deps.findSyllabusId(profileId);
    const viewerId = await deps.currentUserId().catch(() => null);
    const row = toProfileViewRow(input, {
      profileId,
      syllabusId,
      isOwner: viewerId != null && viewerId === profileId,
    });
    await deps.insert(row);
    return { recorded: true };
  } catch (err) {
    // e.g. relation "profile_view_events" does not exist (prod before 0016),
    // connection refused, timeout. Logged once per distinct FAILURE so a
    // not-yet-migrated database does not flood the logs on every page view.
    // Drizzle's message embeds the bound params, so the key is the Postgres
    // error code (e.g. 42P01 undefined_table) when present, else the first
    // line of the message.
    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error ? (err as Error & { cause?: unknown }).cause : undefined;
    const code =
      cause && typeof cause === "object" && "code" in cause ? String((cause as { code: unknown }).code) : null;
    const key = code ?? message.split("\n")[0];
    warnOnce(warn, key, `[profile-view] not recorded${code ? ` (${code})` : ""}: ${message.split("\n")[0]}`);
    return { recorded: false, reason: "store_failed" };
  }
}
