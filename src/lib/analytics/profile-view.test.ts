import { describe, it, expect } from "vitest";
import {
  DWELL_BUCKETS,
  DWELL_BUCKET_FLOOR_MS,
  PROFILE_SECTIONS,
  ProfileViewInput,
  SELF_HOSTS,
  SessionDedupe,
  artefactIdFrom,
  dwellBucket,
  dwellBucketOf,
  isProfileSection,
  parseUtm,
  profileShareUrl,
  referrerHost,
  toProfileViewRow,
} from "./profile-view";

const ARTEFACT = "f1f70000-0000-4000-8000-000000000401";

const RESOLVED = { profileId: "p-1", syllabusId: "s-1", isOwner: false };

describe("parseUtm", () => {
  it("reads the three utm fields and normalises to lower-case tokens", () => {
    expect(parseUtm("?utm_source=DP1&utm_medium=Email&utm_campaign=cold-a")).toEqual({
      utmSource: "dp1",
      utmMedium: "email",
      utmCampaign: "cold-a",
    });
  });

  it("accepts the query string with or without the leading ?", () => {
    expect(parseUtm("utm_source=dp2").utmSource).toBe("dp2");
    expect(parseUtm("?utm_source=dp2").utmSource).toBe("dp2");
  });

  it("drops anything that is not a short token — no free text reaches the table", () => {
    expect(parseUtm("?utm_source=hello%20world").utmSource).toBeNull();
    expect(parseUtm("?utm_source=" + "a".repeat(41)).utmSource).toBeNull();
    expect(parseUtm("?utm_source=<script>").utmSource).toBeNull();
    expect(parseUtm("?utm_source=-leading").utmSource).toBeNull();
    expect(parseUtm("?utm_campaign=ok.but_fine-1").utmCampaign).toBe("ok.but_fine-1");
  });

  it("is all-null for missing or empty input", () => {
    const empty = { utmSource: null, utmMedium: null, utmCampaign: null };
    expect(parseUtm(null)).toEqual(empty);
    expect(parseUtm(undefined)).toEqual(empty);
    expect(parseUtm("")).toEqual(empty);
    expect(parseUtm("?foo=bar")).toEqual(empty);
  });
});

describe("referrerHost", () => {
  it("reduces a referrer to its lower-cased host, no path or port", () => {
    expect(referrerHost("https://Mail.Google.com:443/mail/u/0/#inbox", SELF_HOSTS)).toBe(
      "mail.google.com",
    );
    expect(referrerHost("https://www.linkedin.com/in/someone?x=1", SELF_HOSTS)).toBe(
      "www.linkedin.com",
    );
  });

  it("drops our own hosts — same-site navigation is not a referral", () => {
    expect(referrerHost("https://provency.ai/u/x", SELF_HOSTS)).toBeNull();
    expect(referrerHost("https://yakka-two.vercel.app/", SELF_HOSTS)).toBeNull();
    expect(referrerHost("http://localhost:3000/u/fixture-fiona", SELF_HOSTS)).toBeNull();
  });

  it("is null for empty, missing, or unparsable referrers", () => {
    expect(referrerHost("", SELF_HOSTS)).toBeNull();
    expect(referrerHost(null, SELF_HOSTS)).toBeNull();
    expect(referrerHost(undefined, SELF_HOSTS)).toBeNull();
    expect(referrerHost("not a url", SELF_HOSTS)).toBeNull();
  });
});

describe("ProfileViewInput", () => {
  it("accepts the beacon's minimal payload and defaults the event type", () => {
    const parsed = ProfileViewInput.parse({ handle: "fixture-fiona" });
    expect(parsed.eventType).toBe("view");
  });

  it("rejects an identifier-shaped visitor key and over-long fields", () => {
    expect(ProfileViewInput.safeParse({ handle: "h", visitorKey: "me@example.com" }).success).toBe(false);
    expect(ProfileViewInput.safeParse({ handle: "h", visitorKey: "short" }).success).toBe(false);
    expect(ProfileViewInput.safeParse({ handle: "h".repeat(65) }).success).toBe(false);
    expect(ProfileViewInput.safeParse({ handle: "h", referrer: "x".repeat(2049) }).success).toBe(false);
  });

  it("accepts a random-token visitor key", () => {
    expect(
      ProfileViewInput.safeParse({ handle: "h", visitorKey: "8f3c1b2a-77d4-4c1e-9a2b-0f1e2d3c4b5a" })
        .success,
    ).toBe(true);
  });

  it("accepts nothing resembling IP, user agent, or screen data", () => {
    const parsed = ProfileViewInput.parse({
      handle: "h",
      ip: "1.2.3.4",
      userAgent: "Mozilla",
      screen: "1440x900",
    } as unknown as Record<string, unknown>);
    expect(Object.keys(parsed).sort()).toEqual(["eventType", "handle"]);
  });
});

describe("toProfileViewRow", () => {
  it("builds a view row with host-only referrer and parsed utm", () => {
    const row = toProfileViewRow(
      ProfileViewInput.parse({
        handle: "fixture-fiona",
        referrer: "https://mail.google.com/mail/u/0/",
        search: "?utm_source=dp1&utm_medium=email",
        visitorKey: "abcdefgh-1234",
      }),
      RESOLVED,
    );
    expect(row).toEqual({
      profileId: "p-1",
      syllabusId: "s-1",
      eventType: "view",
      section: null,
      artefactId: null,
      dwellMs: null,
      referrerHost: "mail.google.com",
      utmSource: "dp1",
      utmMedium: "email",
      utmCampaign: null,
      visitorKey: "abcdefgh-1234",
      isOwner: false,
    });
  });

  it("keeps per-type fields only on their own event type", () => {
    const base = { handle: "h" };
    // A dwell bucket on a view event is ignored, not stored.
    expect(
      toProfileViewRow(
        ProfileViewInput.parse({ ...base, eventType: "view", dwellBucket: "30_60s" }),
        RESOLVED,
      ).dwellMs,
    ).toBeNull();
    expect(
      toProfileViewRow(
        ProfileViewInput.parse({ ...base, eventType: "dwell", dwellBucket: "30_60s" }),
        RESOLVED,
      ).dwellMs,
    ).toBe(30_000);
    expect(
      toProfileViewRow(
        ProfileViewInput.parse({ ...base, eventType: "section", section: "artefacts" }),
        RESOLVED,
      ).section,
    ).toBe("artefacts");
    expect(
      toProfileViewRow(
        ProfileViewInput.parse({ ...base, eventType: "artefact_click", artefactId: ARTEFACT }),
        RESOLVED,
      ).artefactId,
    ).toBe(ARTEFACT);
  });

  it("refuses a per-type event without its field — nothing half-empty is stored", () => {
    expect(ProfileViewInput.safeParse({ handle: "h", eventType: "section" }).success).toBe(false);
    expect(ProfileViewInput.safeParse({ handle: "h", eventType: "section", section: "sidebar" }).success).toBe(false);
    expect(ProfileViewInput.safeParse({ handle: "h", eventType: "artefact_click" }).success).toBe(false);
    expect(ProfileViewInput.safeParse({ handle: "h", eventType: "artefact_click", artefactId: "not-a-uuid" }).success).toBe(false);
    expect(ProfileViewInput.safeParse({ handle: "h", eventType: "dwell" }).success).toBe(false);
    expect(ProfileViewInput.safeParse({ handle: "h", eventType: "dwell", dwellBucket: "forever" }).success).toBe(false);
    // and exact durations are not even a field any more
    expect(
      Object.keys(ProfileViewInput.parse({ handle: "h", eventType: "dwell", dwellBucket: "lt10s", dwellMs: 1234 } as unknown as Record<string, unknown>)),
    ).not.toContain("dwellMs");
  });

  it("marks the owner so readouts can exclude them", () => {
    const row = toProfileViewRow(ProfileViewInput.parse({ handle: "h" }), {
      ...RESOLVED,
      isOwner: true,
    });
    expect(row.isOwner).toBe(true);
  });
});

describe("profileShareUrl — the C-4 copy-link helper", () => {
  it("builds a profile link tagged with the partner source", () => {
    expect(profileShareUrl("https://provency.ai", "caleb", { source: "dp1" })).toBe(
      "https://provency.ai/u/caleb?utm_source=dp1",
    );
    expect(
      profileShareUrl("https://provency.ai", "caleb", {
        source: "DP2",
        medium: "email",
        campaign: "design-partner",
      }),
    ).toBe("https://provency.ai/u/caleb?utm_source=dp2&utm_medium=email&utm_campaign=design-partner");
  });

  it("round-trips through parseUtm", () => {
    const url = new URL(profileShareUrl("https://provency.ai", "caleb", { source: "dp3", medium: "email" }));
    expect(parseUtm(url.search)).toEqual({ utmSource: "dp3", utmMedium: "email", utmCampaign: null });
  });

  it("refuses a source that is not a token", () => {
    expect(() => profileShareUrl("https://provency.ai", "caleb", { source: "not a token" })).toThrow();
  });
});

/* ── P5.4b ────────────────────────────────────────────────────────────────── */

describe("sections", () => {
  it("has exactly the nine C-2 layout sections, in page order", () => {
    expect([...PROFILE_SECTIONS]).toEqual([
      "header",
      "evidence_map",
      "readiness_snapshot",
      "artefacts",
      "verified_competencies",
      "self_assessed",
      "learning_trail",
      "currently_developing",
      "footer",
    ]);
    expect(isProfileSection("artefacts")).toBe(true);
    expect(isProfileSection("sidebar")).toBe(false);
    expect(isProfileSection(undefined)).toBe(false);
  });
});

describe("dwell bucketing", () => {
  it("buckets at the stated boundaries and never keeps a duration", () => {
    expect(dwellBucket(0)).toBe("lt10s");
    expect(dwellBucket(9_999)).toBe("lt10s");
    expect(dwellBucket(10_000)).toBe("10_30s");
    expect(dwellBucket(29_999)).toBe("10_30s");
    expect(dwellBucket(30_000)).toBe("30_60s");
    expect(dwellBucket(59_999)).toBe("30_60s");
    expect(dwellBucket(60_000)).toBe("60_180s");
    expect(dwellBucket(179_999)).toBe("60_180s");
    expect(dwellBucket(180_000)).toBe("180s_plus");
    expect(dwellBucket(10 * 60 * 60 * 1000)).toBe("180s_plus");
  });

  it("treats garbage as the first bucket rather than failing", () => {
    expect(dwellBucket(-5)).toBe("lt10s");
    expect(dwellBucket(Number.NaN)).toBe("lt10s");
  });

  it("stores the floor and recovers the bucket from it", () => {
    for (const b of DWELL_BUCKETS) {
      expect(dwellBucketOf(DWELL_BUCKET_FLOOR_MS[b])).toBe(b);
    }
    expect(dwellBucketOf(12_345)).toBeNull(); // an exact duration is not a bucket
    expect(dwellBucketOf(null)).toBeNull();
  });
});

describe("artefactIdFrom", () => {
  it("accepts only a UUID from the data attribute", () => {
    expect(artefactIdFrom(ARTEFACT)).toBe(ARTEFACT);
    expect(artefactIdFrom("https://github.com/x/y")).toBeNull(); // never the URL
    expect(artefactIdFrom("")).toBeNull();
    expect(artefactIdFrom(undefined)).toBeNull();
    expect(artefactIdFrom("<img src=x onerror=1>")).toBeNull();
  });
});

describe("SessionDedupe", () => {
  function mapStore() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  }

  it("claims once per kind per session, then refuses", () => {
    const d = new SessionDedupe(mapStore(), "fixture-fiona");
    expect(d.claim("view")).toBe(true);
    expect(d.claim("view")).toBe(false);
    expect(d.claim("dwell")).toBe(true);
    expect(d.claim("dwell")).toBe(false);
  });

  it("dedupes sections per section id, so nine sections yield nine claims and no tenth", () => {
    const d = new SessionDedupe(mapStore(), "fixture-fiona");
    const claimed = PROFILE_SECTIONS.map((s) => d.claim("section", s));
    expect(claimed.every(Boolean)).toBe(true);
    expect(PROFILE_SECTIONS.map((s) => d.claim("section", s)).some(Boolean)).toBe(false);
  });

  it("scopes keys by handle so two profiles in one tab are independent", () => {
    const store = mapStore();
    const a = new SessionDedupe(store, "a");
    const b = new SessionDedupe(store, "b");
    expect(a.claim("section", "artefacts")).toBe(true);
    expect(b.claim("section", "artefacts")).toBe(true);
    expect(a.claim("section", "artefacts")).toBe(false);
  });

  it("degrades to 'send' when storage is missing or throws — never to silence", () => {
    const none = new SessionDedupe(null, "h");
    expect(none.claim("view")).toBe(true);
    expect(none.claim("view")).toBe(true); // no memory, so it would send again
    const throwing = new SessionDedupe(
      {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
      "h",
    );
    expect(throwing.claim("view")).toBe(true);
    expect(throwing.mark("view")).toBe(false);
  });
});
