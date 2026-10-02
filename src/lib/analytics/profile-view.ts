/**
 * Profile view analytics — the pure half (P5.4a).
 *
 * Everything that turns a raw browser signal into a row is here, DB-free and
 * unit-tested, so the server action is a thin shell: validate → look up →
 * insert. The privacy rules live here too, as code rather than policy:
 *   - the referrer is reduced to its HOST, and dropped entirely when it is our
 *     own host (navigating within the site is not a referral);
 *   - utm values are lower-cased, restricted to a short token alphabet, and
 *     dropped when they do not match — nothing free-form reaches the table;
 *   - the visitor key is accepted only in the shape the client generates
 *     (a random token), never anything that could carry an identifier.
 * No IP address, user agent, language, or screen size is ever accepted.
 */

import { z } from "zod";

/** utm_* values: short lower-case tokens. `dp1`, `cold-email-a`, `linkedin`. */
const UTM_TOKEN = /^[a-z0-9][a-z0-9_.-]{0,39}$/;
/** The client's per-session random token (UUID or similar). */
const VISITOR_KEY = /^[A-Za-z0-9_-]{8,64}$/;

export const PROFILE_VIEW_EVENT_TYPES = ["view", "section", "artefact_click", "dwell"] as const;
export type ProfileViewEventType = (typeof PROFILE_VIEW_EVENT_TYPES)[number];

/** What the client beacon sends. Deliberately narrow. */
export const ProfileViewInput = z.object({
  handle: z.string().min(1).max(64),
  eventType: z.enum(PROFILE_VIEW_EVENT_TYPES).default("view"),
  /** `document.referrer` — may be empty. Reduced to a host server-side. */
  referrer: z.string().max(2048).nullable().optional(),
  /** `location.search` — parsed for utm_* only. */
  search: z.string().max(2048).nullable().optional(),
  visitorKey: z.string().regex(VISITOR_KEY).nullable().optional(),
  /** P5.4b fields; accepted now so the write path needs no second change. */
  section: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/).nullable().optional(),
  artefactId: z.string().uuid().nullable().optional(),
  dwellMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).nullable().optional(),
});
export type ProfileViewInput = z.infer<typeof ProfileViewInput>;

export interface UtmFields {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

function utmToken(value: string | null): string | null {
  if (value == null) return null;
  const v = value.trim().toLowerCase();
  return UTM_TOKEN.test(v) ? v : null;
}

/** Parse `utm_source`, `utm_medium`, `utm_campaign` from a query string. */
export function parseUtm(search: string | null | undefined): UtmFields {
  const empty: UtmFields = { utmSource: null, utmMedium: null, utmCampaign: null };
  if (!search) return empty;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return empty;
  }
  return {
    utmSource: utmToken(params.get("utm_source")),
    utmMedium: utmToken(params.get("utm_medium")),
    utmCampaign: utmToken(params.get("utm_campaign")),
  };
}

/**
 * The referrer's host, or null when absent, unparsable, or one of OUR hosts
 * (same-site navigation is not a referral). Lower-cased, no port, no path.
 */
export function referrerHost(
  referrer: string | null | undefined,
  selfHosts: readonly string[],
): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;
  const self = new Set(selfHosts.map((h) => h.toLowerCase()));
  return self.has(host) ? null : host;
}

/** Hosts that count as "us" for the referrer rule. */
export const SELF_HOSTS: readonly string[] = [
  "provency.ai",
  "www.provency.ai",
  "yakka-two.vercel.app",
  "localhost",
  "127.0.0.1",
];

export interface ProfileViewRow {
  profileId: string;
  syllabusId: string | null;
  eventType: ProfileViewEventType;
  section: string | null;
  artefactId: string | null;
  dwellMs: number | null;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  visitorKey: string | null;
  isOwner: boolean;
}

/**
 * Build the insert row from validated input plus what the server resolved.
 * Pure. The server action supplies `profileId`/`syllabusId` from the handle
 * and `isOwner` from the session; nothing else about the viewer is known.
 */
export function toProfileViewRow(
  input: ProfileViewInput,
  resolved: { profileId: string; syllabusId: string | null; isOwner: boolean },
  selfHosts: readonly string[] = SELF_HOSTS,
): ProfileViewRow {
  const utm = parseUtm(input.search);
  return {
    profileId: resolved.profileId,
    syllabusId: resolved.syllabusId,
    eventType: input.eventType,
    section: input.eventType === "section" ? (input.section ?? null) : null,
    artefactId: input.eventType === "artefact_click" ? (input.artefactId ?? null) : null,
    dwellMs: input.eventType === "dwell" ? (input.dwellMs ?? null) : null,
    referrerHost: referrerHost(input.referrer, selfHosts),
    ...utm,
    visitorKey: input.visitorKey ?? null,
    isOwner: resolved.isOwner,
  };
}

/**
 * Build a shareable profile URL carrying a partner source tag — the helper
 * C-4's "copy link with utm" will call. Pure; the tag must be a utm token.
 */
export function profileShareUrl(
  origin: string,
  handle: string,
  utm: { source: string; medium?: string; campaign?: string },
): string {
  const u = new URL(`/u/${encodeURIComponent(handle)}`, origin);
  const src = utmToken(utm.source);
  if (!src) throw new Error(`utm source "${utm.source}" is not a valid token`);
  u.searchParams.set("utm_source", src);
  const med = utmToken(utm.medium ?? null);
  if (med) u.searchParams.set("utm_medium", med);
  const camp = utmToken(utm.campaign ?? null);
  if (camp) u.searchParams.set("utm_campaign", camp);
  return u.toString();
}
