import { describe, it, expect } from "vitest";
import {
  ProfileViewInput,
  SELF_HOSTS,
  parseUtm,
  profileShareUrl,
  referrerHost,
  toProfileViewRow,
} from "./profile-view";

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
    expect(
      toProfileViewRow(ProfileViewInput.parse({ ...base, eventType: "view", dwellMs: 5000 }), RESOLVED)
        .dwellMs,
    ).toBeNull();
    expect(
      toProfileViewRow(ProfileViewInput.parse({ ...base, eventType: "dwell", dwellMs: 5000 }), RESOLVED)
        .dwellMs,
    ).toBe(5000);
    expect(
      toProfileViewRow(
        ProfileViewInput.parse({ ...base, eventType: "section", section: "artefacts" }),
        RESOLVED,
      ).section,
    ).toBe("artefacts");
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
