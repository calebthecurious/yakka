import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LANDING_RECORD_PATH,
  buildLandingRecord,
  serializeLandingRecord,
} from "./build-landing-fixture";

/**
 * Single truth for the landing page: the committed src/data/landing-record.json
 * must be byte-identical to what the ledger module projects from the fixture
 * right now. If this fails, something upstream changed (the fixture, the
 * ledger, the projection, or a label) and the file is stale — the fix is
 * `npm run landing:fixture`, never a hand edit of the JSON.
 */
describe("landing-record.json", () => {
  it("exists", () => {
    expect(existsSync(LANDING_RECORD_PATH)).toBe(true);
  });

  it("is exactly what the ledger projects from the fixture", () => {
    const committed = readFileSync(LANDING_RECORD_PATH, "utf8").replace(/\r\n/g, "\n");
    const regenerated = serializeLandingRecord(buildLandingRecord());
    expect(committed).toBe(regenerated);
  });

  it("is deterministic across runs", () => {
    expect(serializeLandingRecord(buildLandingRecord())).toBe(
      serializeLandingRecord(buildLandingRecord()),
    );
  });

  it("carries a real-shaped record (every tier, both evidence kinds)", () => {
    const data = buildLandingRecord();
    const tiers = new Set(data.nodes.map((n) => n.tier));
    for (const t of [
      "artefact_verified",
      "check_passed",
      "self_assessed",
      "in_progress",
      "not_started",
    ] as const) {
      expect(tiers.has(t)).toBe(true);
    }
    const kinds = new Set(data.events.map((e) => e.kind));
    expect(kinds).toEqual(new Set(["competency_check", "artefact"]));
    expect(data.totals.concepts).toBe(data.nodes.length);
    expect(data.totals.verified).toBe(data.nodes.filter((n) => n.verified).length);
  });
});
