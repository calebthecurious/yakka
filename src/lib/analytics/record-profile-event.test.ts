import { describe, it, expect, vi } from "vitest";

// `server-only` throws when imported outside a React Server environment;
// stub it so the module under test loads in vitest's node environment.
vi.mock("server-only", () => ({}));
// The live deps import the Drizzle client, which reads env at module load.
// We never call them here — we inject fakes — so stub the heavy imports.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: async () => null }));

import { recordProfileEvent, type RecordDeps } from "./record-profile-event";
import type { ProfileViewRow } from "./profile-view";

function deps(over: Partial<RecordDeps> = {}): RecordDeps & { rows: ProfileViewRow[]; warnings: string[] } {
  const rows: ProfileViewRow[] = [];
  const warnings: string[] = [];
  return {
    rows,
    warnings,
    findProfileId: async (h) => (h === "fixture-fiona" ? "p-1" : null),
    findSyllabusId: async () => "s-1",
    currentUserId: async () => null,
    insert: async (row) => {
      rows.push(row);
    },
    warn: (m) => warnings.push(m),
    ...over,
  };
}

describe("recordProfileEvent — happy path", () => {
  it("records a view with the resolved profile and syllabus", async () => {
    const d = deps();
    const out = await recordProfileEvent(
      { handle: "fixture-fiona", search: "?utm_source=dp1", visitorKey: "abcdefgh-123" },
      d,
    );
    expect(out).toEqual({ recorded: true });
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]).toMatchObject({
      profileId: "p-1",
      syllabusId: "s-1",
      eventType: "view",
      utmSource: "dp1",
      isOwner: false,
    });
  });

  it("flags the owner when the session user is the profile", async () => {
    const d = deps({ currentUserId: async () => "p-1" });
    await recordProfileEvent({ handle: "fixture-fiona" }, d);
    expect(d.rows[0].isOwner).toBe(true);
  });

  it("stores dwell as the bucket floor, never a duration", async () => {
    const d = deps();
    await recordProfileEvent(
      { handle: "fixture-fiona", eventType: "dwell", dwellBucket: "30_60s" },
      d,
    );
    expect(d.rows[0]).toMatchObject({ eventType: "dwell", dwellMs: 30_000 });
  });
});

describe("recordProfileEvent — fails closed, silently", () => {
  it("resolves (never throws) when the table does not exist yet — prod before the G-gate", async () => {
    const d = deps({
      insert: async () => {
        throw new Error('relation "profile_view_events" does not exist');
      },
    });
    await expect(recordProfileEvent({ handle: "fixture-fiona" }, d)).resolves.toEqual({
      recorded: false,
      reason: "store_failed",
    });
    expect(d.warnings).toHaveLength(1);
    expect(d.warnings[0]).toContain("profile_view_events");
  });

  it("warns once per distinct failure, not once per page view", async () => {
    const d = deps({
      insert: async () => {
        throw new Error('relation "profile_view_events" does not exist');
      },
    });
    await recordProfileEvent({ handle: "fixture-fiona" }, d);
    await recordProfileEvent({ handle: "fixture-fiona" }, d);
    await recordProfileEvent({ handle: "fixture-fiona" }, d);
    // The first test in this file already warned for this message via a
    // module-level set, so this run adds none — the point is "not three".
    expect(d.warnings.length).toBeLessThanOrEqual(1);
  });

  it("resolves when the lookup itself fails (connection refused, paused project)", async () => {
    const d = deps({
      findProfileId: async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:6543");
      },
    });
    await expect(recordProfileEvent({ handle: "fixture-fiona" }, d)).resolves.toMatchObject({
      recorded: false,
      reason: "store_failed",
    });
    expect(d.rows).toHaveLength(0);
  });

  it("drops invalid input without touching the database", async () => {
    const d = deps();
    expect(await recordProfileEvent({ handle: "" }, d)).toEqual({
      recorded: false,
      reason: "invalid_input",
    });
    expect(await recordProfileEvent({ handle: "h", eventType: "section" }, d)).toEqual({
      recorded: false,
      reason: "invalid_input",
    }); // section event with no section
    expect(await recordProfileEvent({ handle: "h", eventType: "artefact_click" }, d)).toEqual({
      recorded: false,
      reason: "invalid_input",
    });
    expect(await recordProfileEvent({ handle: "h", eventType: "dwell" }, d)).toEqual({
      recorded: false,
      reason: "invalid_input",
    });
    expect(await recordProfileEvent("garbage", d)).toEqual({
      recorded: false,
      reason: "invalid_input",
    });
    expect(d.rows).toHaveLength(0);
  });

  it("drops events for an unknown handle", async () => {
    const d = deps();
    expect(await recordProfileEvent({ handle: "nobody" }, d)).toEqual({
      recorded: false,
      reason: "unknown_profile",
    });
    expect(d.rows).toHaveLength(0);
  });

  it("still records when the session lookup fails — owner just defaults to false", async () => {
    const d = deps({
      currentUserId: async () => {
        throw new Error("auth unavailable");
      },
    });
    expect(await recordProfileEvent({ handle: "fixture-fiona" }, d)).toEqual({ recorded: true });
    expect(d.rows[0].isOwner).toBe(false);
  });
});
