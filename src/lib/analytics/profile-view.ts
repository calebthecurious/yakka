/**
 * Profile view analytics — the pure half (P5.4a + P5.4b).
 *
 * Everything that turns a raw browser signal into a row is here, DB-free and
 * unit-tested, so the server side is a thin shell: validate → look up →
 * insert. The privacy rules live here too, as code rather than policy:
 *   - the referrer is reduced to its HOST, and dropped entirely when it is our
 *     own host (navigating within the site is not a referral);
 *   - utm values are lower-cased, restricted to a short token alphabet, and
 *     dropped when they do not match — nothing free-form reaches the table;
 *   - the visitor key is accepted only in the shape the client generates
 *     (a random token), never anything that could carry an identifier;
 *   - section ids are a fixed enum of the profile's nine layout sections;
 *   - dwell is a BUCKET, never a duration — the client buckets before sending
 *     and the table stores the bucket's floor in `dwell_ms`;
 *   - artefact clicks carry the artefact id, never the URL.
 * No IP address, user agent, language, screen size or scroll position is ever
 * accepted.
 */

import { z } from "zod";

/** utm_* values: short lower-case tokens. `dp1`, `cold-email-a`, `linkedin`. */
const UTM_TOKEN = /^[a-z0-9][a-z0-9_.-]{0,39}$/;
/** The client's per-session random token (UUID or similar). */
const VISITOR_KEY = /^[A-Za-z0-9_-]{8,64}$/;

export const PROFILE_VIEW_EVENT_TYPES = ["view", "section", "artefact_click", "dwell"] as const;
export type ProfileViewEventType = (typeof PROFILE_VIEW_EVENT_TYPES)[number];

/* ── Sections (P5.4b) ─────────────────────────────────────────────────────── */

/**
 * The nine layout sections of /u/[handle], in page order (C-2 layout). Stable
 * ids: a section keeps its id when the page is rearranged, so engagement
 * data stays comparable across redesigns. Each section element carries
 * `data-section="<id>"`; the beacon observes those and nothing else.
 */
export const PROFILE_SECTIONS = [
  "header",
  "evidence_map",
  "readiness_snapshot",
  "artefacts",
  "verified_competencies",
  "self_assessed",
  "learning_trail",
  "currently_developing",
  "footer",
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export function isProfileSection(value: unknown): value is ProfileSection {
  return typeof value === "string" && (PROFILE_SECTIONS as readonly string[]).includes(value);
}

/* ── Dwell buckets (P5.4b) ────────────────────────────────────────────────── */

/**
 * Dwell is stored as a bucket, never an exact duration. The ids are what the
 * client sends; `DWELL_BUCKET_FLOOR_MS` is the value written to `dwell_ms`
 * (the bucket's lower bound) so the column stays an integer without a
 * migration and a reader can recover the bucket with `dwellBucketOf`.
 */
export const DWELL_BUCKETS = ["lt10s", "10_30s", "30_60s", "60_180s", "180s_plus"] as const;
export type DwellBucket = (typeof DWELL_BUCKETS)[number];

export const DWELL_BUCKET_FLOOR_MS: Readonly<Record<DwellBucket, number>> = {
  lt10s: 0,
  "10_30s": 10_000,
  "30_60s": 30_000,
  "60_180s": 60_000,
  "180s_plus": 180_000,
};

/** Bucket a visible-time duration. Negative or NaN input is the first bucket. */
export function dwellBucket(visibleMs: number): DwellBucket {
  if (!Number.isFinite(visibleMs) || visibleMs < 10_000) return "lt10s";
  if (visibleMs < 30_000) return "10_30s";
  if (visibleMs < 60_000) return "30_60s";
  if (visibleMs < 180_000) return "60_180s";
  return "180s_plus";
}

/** Recover the bucket from a stored `dwell_ms` floor. Null for unknown values. */
export function dwellBucketOf(storedMs: number | null): DwellBucket | null {
  if (storedMs == null) return null;
  for (const b of DWELL_BUCKETS) if (DWELL_BUCKET_FLOOR_MS[b] === storedMs) return b;
  return null;
}

/* ── Input ────────────────────────────────────────────────────────────────── */

const UUID = z.string().uuid();

/**
 * What the client beacon sends. Deliberately narrow, and refined so a
 * per-type field is REQUIRED on its own type and ignored elsewhere — a
 * `section` event without a section, or an `artefact_click` without an id,
 * is dropped rather than stored half-empty.
 */
export const ProfileViewInput = z
  .object({
    handle: z.string().min(1).max(64),
    eventType: z.enum(PROFILE_VIEW_EVENT_TYPES).default("view"),
    /** `document.referrer` — may be empty. Reduced to a host server-side. */
    referrer: z.string().max(2048).nullable().optional(),
    /** `location.search` — parsed for utm_* only. */
    search: z.string().max(2048).nullable().optional(),
    visitorKey: z.string().regex(VISITOR_KEY).nullable().optional(),
    /** `section` events only. */
    section: z.enum(PROFILE_SECTIONS).nullable().optional(),
    /** `artefact_click` events only. The id, never the URL. */
    artefactId: UUID.nullable().optional(),
    /** `dwell` events only. A bucket, never a duration. */
    dwellBucket: z.enum(DWELL_BUCKETS).nullable().optional(),
  })
  .refine((v) => v.eventType !== "section" || v.section != null, {
    message: "section events need a section",
    path: ["section"],
  })
  .refine((v) => v.eventType !== "artefact_click" || v.artefactId != null, {
    message: "artefact_click events need an artefactId",
    path: ["artefactId"],
  })
  .refine((v) => v.eventType !== "dwell" || v.dwellBucket != null, {
    message: "dwell events need a dwellBucket",
    path: ["dwellBucket"],
  });
export type ProfileViewInput = z.infer<typeof ProfileViewInput>;

/* ── Referrer and utm ─────────────────────────────────────────────────────── */

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

/* ── Row ──────────────────────────────────────────────────────────────────── */

export interface ProfileViewRow {
  profileId: string;
  syllabusId: string | null;
  eventType: ProfileViewEventType;
  section: string | null;
  artefactId: string | null;
  /** The dwell BUCKET's floor in ms (see DWELL_BUCKET_FLOOR_MS), never a duration. */
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
 * Pure. The server supplies `profileId`/`syllabusId` from the handle and
 * `isOwner` from the session; nothing else about the viewer is known.
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
    dwellMs:
      input.eventType === "dwell" && input.dwellBucket != null
        ? DWELL_BUCKET_FLOOR_MS[input.dwellBucket]
        : null,
    referrerHost: referrerHost(input.referrer, selfHosts),
    ...utm,
    visitorKey: input.visitorKey ?? null,
    isOwner: resolved.isOwner,
  };
}

/* ── Client-side helpers (pure, DOM-free) ─────────────────────────────────── */

/**
 * Extract an artefact id from a clicked element's `data-artefact-id`. The
 * beacon reads the attribute and passes the string here; anything that is not
 * a UUID is ignored, so a malformed or injected attribute records nothing.
 */
export function artefactIdFrom(datasetValue: string | null | undefined): string | null {
  if (!datasetValue) return null;
  return UUID.safeParse(datasetValue).success ? datasetValue : null;
}

/** The subset of Storage the dedupe guard needs, so it can be tested with a Map. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Once-per-session guard shared by every event kind. Keys are scoped by
 * handle so two profiles in one tab dedupe independently. Storage failures
 * (private mode, quota, blocked) degrade to "not seen" — we would rather
 * record a duplicate than lose the event, and the server side is idempotent
 * enough for analytics.
 */
export class SessionDedupe {
  constructor(
    private readonly store: KeyValueStore | null,
    private readonly handle: string,
  ) {}

  private key(kind: string, id?: string): string {
    return id ? `pv:${kind}:${this.handle}:${id}` : `pv:${kind}:${this.handle}`;
  }

  /** True if already recorded this session. */
  seen(kind: string, id?: string): boolean {
    try {
      return this.store?.getItem(this.key(kind, id)) != null;
    } catch {
      return false;
    }
  }

  /** Record as seen. Returns false if storage refused (caller may still send). */
  mark(kind: string, id?: string): boolean {
    try {
      this.store?.setItem(this.key(kind, id), "1");
      return this.store != null;
    } catch {
      return false;
    }
  }

  /** Atomically: if unseen, mark and return true; else false. */
  claim(kind: string, id?: string): boolean {
    if (this.seen(kind, id)) return false;
    this.mark(kind, id);
    return true;
  }
}

/* ── Share link (C-4 helper) ──────────────────────────────────────────────── */

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
