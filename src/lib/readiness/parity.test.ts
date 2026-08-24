import { describe, it, expect } from "vitest";
import {
  PASS_BAR,
  computeReadinessLedger,
  isSelfDeclaredDone,
  type ReadinessInput,
  type ReadinessLedger,
} from "./model";
import {
  findClusterSummary,
  findSubSkillSummary,
  ratioPct,
  summarizeReadinessLedger,
  type ReadinessSummary,
} from "./summary";

/**
 * PARITY LOCK — every surface reads the SAME numbers from the ledger.
 *
 * Scope note, stated plainly: the per-surface projections
 * (`clusterConceptCounts`/`subSkillConceptCounts` in syllabi/[id]/page.tsx,
 * `progressOf`/`overallProgressOf` in goal-mandala.tsx) are module-private, and
 * this prompt forbids production changes, so they cannot be imported here.
 * Exporting them purely to test them would be worse than the alternative:
 * `check:single-truth` already prevents a surface from deriving its own number
 * at all, and what remains to lock is the DATA-LAYER CONTRACT those surfaces
 * depend on. That is what this file pins.
 *
 * Each `read*` helper below mirrors, line for line, the accessor path the real
 * surface uses. If the contract underneath them ever shifts — a grain changes,
 * a denominator changes, a roll-up stops reconciling — these fail.
 *
 * /u/[handle] joined with the P1.5b route commit: its snapshot reads the raw
 * LEDGER (not the summary) — verified = breakdown.conceptsVerified, groups from
 * ledger.evidence, self-assessed = self-declared minus conceptStates.verified.
 * `readProfile`/`readProfileSelfAssessed` mirror those accessor paths.
 */

/* ── surface accessor mirrors ───────────────────────────────────────────── */

/** syllabi/[id]/page.tsx:264 — `{readiness.concepts.total} concepts ({.verified} verified)` */
function readHeader(s: ReadinessSummary) {
  return { total: s.concepts.total, verified: s.concepts.verified };
}

/** syllabus-tree.tsx:216/221 via page.tsx `clusterConceptCounts` — concept grain. */
function readTreeCluster(s: ReadinessSummary, clusterId: string) {
  const c = findClusterSummary(s, clusterId);
  if (!c) return { done: 0, total: 0, pct: 0 };
  return { done: c.concepts.done, total: c.concepts.total, pct: c.concepts.pct };
}

/** syllabus-tree.tsx:400 via page.tsx `subSkillConceptCounts`. */
function readTreeSubSkill(s: ReadinessSummary, subSkillId: string) {
  const x = findSubSkillSummary(s, subSkillId);
  if (!x) return { done: 0, total: 0, pct: 0 };
  return { done: x.done, total: x.total, pct: x.pct };
}

/** goal-mandala.tsx `progressOf` — same source as the tree, pct as a 0-1 fraction. */
function readMandalaCluster(s: ReadinessSummary, clusterId: string) {
  const c = readTreeCluster(s, clusterId);
  return { done: c.done, total: c.total, pct: c.pct / 100 };
}

/** goal-mandala.tsx `overallProgressOf` — sums the per-cluster counts. */
function readMandalaOverall(s: ReadinessSummary) {
  let done = 0;
  let total = 0;
  for (const c of s.byCluster) {
    done += c.concepts.done;
    total += c.concepts.total;
  }
  return { done, total, pct: total > 0 ? done / total : 0 };
}

/** u/[handle]/page.tsx — readiness snapshot + verified groups, from the ledger. */
function readProfile(led: ReadinessLedger) {
  return {
    verified: led.breakdown.conceptsVerified,
    inProgress: led.activity.conceptsInProgress,
    evidenceEntries: led.evidence.length,
  };
}

/** u/[handle]/page.tsx self-assessed partition — self-declared done, minus
 * everything `conceptStates` verified. Must equal ledger.selfAssessed.concepts. */
function readProfileSelfAssessed(input: ReadinessInput, led: ReadinessLedger) {
  const verifiedIds = new Set(
    led.conceptStates.filter((c) => c.verified).map((c) => c.conceptId),
  );
  return input.concepts.filter(
    (c) => isSelfDeclaredDone(c.status) && !verifiedIds.has(c.id),
  ).length;
}

/* ── fixture matrix ─────────────────────────────────────────────────────── */

const D = new Date("2026-08-01");
const cluster = (id: string, weight: number, bearing = false) => ({
  id,
  weight,
  isArtefactBearing: bearing,
});

/** Two clusters, four sub-skills, eight concepts — every evidence state present. */
function buildWorkspace(
  variant:
    | "unchecked"
    | "failed-check"
    | "passed-check"
    | "verified-artefact"
    | "mixed",
): ReadinessInput {
  const base: ReadinessInput = {
    clusters: [cluster("A", 5, true), cluster("B", 2, false)],
    concepts: [
      { id: "a1", clusterId: "A", subSkillId: "sA1", status: "not_started" },
      { id: "a2", clusterId: "A", subSkillId: "sA1", status: "learning" },
      { id: "a3", clusterId: "A", subSkillId: "sA2", status: "understood" },
      { id: "a4", clusterId: "A", subSkillId: "sA2", status: "not_started" },
      { id: "b1", clusterId: "B", subSkillId: "sB1", status: "understood" },
      { id: "b2", clusterId: "B", subSkillId: "sB1", status: "learning" },
      { id: "b3", clusterId: "B", subSkillId: "sB2", status: "not_started" },
      { id: "b4", clusterId: "B", subSkillId: "sB2", status: "verified" },
    ],
    competencyChecks: [],
    artefacts: [],
    foundationItems: [],
  };

  switch (variant) {
    case "unchecked":
      return base;
    case "failed-check":
      return {
        ...base,
        competencyChecks: [
          { conceptId: "a3", score: PASS_BAR - 1, completedAt: D },
          { conceptId: "b1", score: 1, completedAt: D },
          { conceptId: "b4", score: 5, completedAt: null }, // never finished
        ],
      };
    case "passed-check":
      return {
        ...base,
        competencyChecks: [
          { conceptId: "a1", score: 5, completedAt: D }, // not_started + evidence
          { conceptId: "a3", score: PASS_BAR, completedAt: D },
          { conceptId: "b1", score: 5, completedAt: D },
        ],
      };
    case "verified-artefact":
      return {
        ...base,
        artefacts: [
          {
            id: "art1",
            clusterId: "A",
            verifiedAt: D,
            demonstratedConceptIds: ["a2", "a4"],
            title: "Rig",
            type: "project",
          },
          {
            id: "art2",
            clusterId: "A",
            verifiedAt: null,
            demonstratedConceptIds: ["a3"], // unbacked → no evidence
            title: "Draft",
            type: "writeup",
          },
        ],
      };
    case "mixed":
      return {
        ...base,
        competencyChecks: [
          { conceptId: "a1", score: 5, completedAt: D }, // pass, status not_started
          { conceptId: "a3", score: 2, completedAt: D }, // fail, status understood
          { conceptId: "b2", score: null, completedAt: null }, // unfinished
          { conceptId: "b4", score: PASS_BAR, completedAt: D }, // pass
        ],
        artefacts: [
          {
            id: "art1",
            clusterId: "A",
            verifiedAt: D,
            demonstratedConceptIds: ["a4"],
            title: "Rig",
            type: "project",
          },
        ],
        resources: [
          { conceptId: "a1", type: "book", status: "completed", title: "B", author: null },
          { conceptId: "a2", type: "course", status: "consuming", title: "C", author: null },
        ],
      };
  }
}

const VARIANTS = [
  "unchecked",
  "failed-check",
  "passed-check",
  "verified-artefact",
  "mixed",
] as const;

const CLUSTERS = ["A", "B"];
const SUBSKILLS = ["sA1", "sA2", "sB1", "sB2"];

/* ── the parity contract ────────────────────────────────────────────────── */

describe("surface parity — every surface reads one truth", () => {
  for (const variant of VARIANTS) {
    describe(variant, () => {
      const input = buildWorkspace(variant);
      const led = computeReadinessLedger(input);
      const s = summarizeReadinessLedger(led);

      it("header equals the ledger's concept counters", () => {
        expect(readHeader(s)).toEqual({
          total: s.concepts.total,
          verified: s.concepts.verified,
        });
      });

      it("tree cluster rows sum to exactly what the header reports", () => {
        const rows = CLUSTERS.map((id) => readTreeCluster(s, id));
        expect(rows.reduce((n, r) => n + r.total, 0)).toBe(readHeader(s).total);
        expect(rows.reduce((n, r) => n + r.done, 0)).toBe(readHeader(s).verified);
      });

      it("tree sub-skill rows sum to their cluster's row, not the milestone row", () => {
        for (const clusterId of CLUSTERS) {
          const c = readTreeCluster(s, clusterId);
          const mine = SUBSKILLS.filter(
            (id) => findSubSkillSummary(s, id)?.clusterId === clusterId,
          ).map((id) => readTreeSubSkill(s, id));

          expect(mine.reduce((n, r) => n + r.total, 0)).toBe(c.total);
          expect(mine.reduce((n, r) => n + r.done, 0)).toBe(c.done);

          // The artefact-target milestone must NOT leak into the tree's grain.
          const milestone = findClusterSummary(s, clusterId)!;
          if (milestone.total !== milestone.concepts.total) {
            expect(c.total).not.toBe(milestone.total);
          }
        }
      });

      it("mandala reads the same per-cluster numbers as the tree", () => {
        for (const clusterId of CLUSTERS) {
          const tree = readTreeCluster(s, clusterId);
          const mandala = readMandalaCluster(s, clusterId);
          expect(mandala.done).toBe(tree.done);
          expect(mandala.total).toBe(tree.total);
          // Same ratio, expressed 0-1 instead of 0-100 — the only difference.
          expect(mandala.pct * 100).toBeCloseTo(tree.pct, 10);
        }
      });

      it("mandala's overall roll-up equals the header", () => {
        const overall = readMandalaOverall(s);
        const header = readHeader(s);
        expect(overall.done).toBe(header.verified);
        expect(overall.total).toBe(header.total);
        expect(overall.pct * 100).toBeCloseTo(
          ratioPct(header.verified, header.total),
          10,
        );
      });

      it("no surface can disagree: all four agree on the same totals", () => {
        const header = readHeader(s);
        const treeTotal = CLUSTERS.map((id) => readTreeCluster(s, id)).reduce(
          (n, r) => n + r.total,
          0,
        );
        const subTotal = SUBSKILLS.map((id) => readTreeSubSkill(s, id)).reduce(
          (n, r) => n + r.total,
          0,
        );
        const mandalaTotal = readMandalaOverall(s).total;

        expect(new Set([header.total, treeTotal, subTotal, mandalaTotal]).size).toBe(1);
      });

      it("evidence provenance count equals the verified count every surface shows", () => {
        expect(s.evidence.length).toBe(readHeader(s).verified);
      });

      it("sub-skill coverage is complete, so no surface renders a short total", () => {
        expect(s.subSkillCoverage.complete).toBe(true);
        expect(s.subSkillCoverage.conceptsMissing).toBe(0);
      });

      it("public profile shows the same verified count as the workspace header", () => {
        const p = readProfile(led);
        expect(p.verified).toBe(readHeader(s).verified);
        expect(p.evidenceEntries).toBe(p.verified);
        expect(p.inProgress).toBe(s.activity.conceptsInProgress);
      });

      it("profile self-assessed partition equals the ledger's own count", () => {
        expect(readProfileSelfAssessed(input, led)).toBe(
          led.selfAssessed.concepts,
        );
      });
    });
  }
});

/* ── the states that make the numbers differ from raw status ────────────── */

describe("surface parity — evidence gating is visible in the shared numbers", () => {
  it("unchecked: eight concepts, three self-declared done, zero verified", () => {
    const s = summarizeReadinessLedger(
      computeReadinessLedger(buildWorkspace("unchecked")),
    );
    expect(readHeader(s)).toEqual({ total: 8, verified: 0 });
    expect(s.concepts.selfAssessed).toBe(3); // a3, b1, b4
    expect(readMandalaOverall(s).pct).toBe(0);
  });

  it("failed-check: failing scores never verify, on any surface", () => {
    const s = summarizeReadinessLedger(
      computeReadinessLedger(buildWorkspace("failed-check")),
    );
    expect(readHeader(s).verified).toBe(0);
    expect(readMandalaOverall(s).done).toBe(0);
    for (const id of CLUSTERS) expect(readTreeCluster(s, id).done).toBe(0);
  });

  it("passed-check: a pass on a not_started concept counts everywhere", () => {
    const s = summarizeReadinessLedger(
      computeReadinessLedger(buildWorkspace("passed-check")),
    );
    // a1 is not_started yet evidence-verified — no surface may hide it. The
    // public profile in particular: its old status gate made exactly this
    // evidence invisible, which is the P1.5b bug this line locks out.
    expect(readHeader(s).verified).toBe(3);
    expect(readTreeSubSkill(s, "sA1").done).toBe(1); // a1
    expect(readMandalaOverall(s).done).toBe(3);
    expect(
      readProfile(computeReadinessLedger(buildWorkspace("passed-check"))).verified,
    ).toBe(3);
  });

  it("verified-artefact: a backed artefact verifies its concepts; an unbacked one does not", () => {
    const s = summarizeReadinessLedger(
      computeReadinessLedger(buildWorkspace("verified-artefact")),
    );
    expect(readHeader(s).verified).toBe(2); // a2, a4 via art1
    expect(readTreeSubSkill(s, "sA1").done).toBe(1); // a2
    expect(readTreeSubSkill(s, "sA2").done).toBe(1); // a4, NOT a3 (art2 unbacked)
    expect(s.artefactCounts.completed).toBe(1);
    expect(s.artefactCounts.projectsCompleted).toBe(1);
  });

  it("mixed: cluster A's tree grain excludes its artefact-target milestone", () => {
    const s = summarizeReadinessLedger(
      computeReadinessLedger(buildWorkspace("mixed")),
    );
    const tree = readTreeCluster(s, "A");
    const milestone = findClusterSummary(s, "A")!;

    expect(tree.total).toBe(4); // four concepts
    expect(milestone.total).toBe(5); // + one artefact target
    expect(readHeader(s).verified).toBe(3); // a1 (pass), a4 (artefact), b4 (pass)
    expect(s.activity.conceptsInProgress).toBe(2); // a2, b2
    expect(s.trail.total).toBe(1); // one completed resource
  });
});
