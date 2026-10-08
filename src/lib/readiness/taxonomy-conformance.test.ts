import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * H-1 source pins. `surface-words.test.ts` fixes what the words ARE; this
 * file fixes WHERE they come from: each listed surface imports its state words
 * from the ledger module and composes none of its own. It reads the component
 * source because the repo has no DOM test runner, and a string that can only
 * reach the screen through an import is pinned as firmly as a rendered one.
 *
 * Retired literals, per docs/verification-taxonomy.md and the Phase A map
 * (docs/design/app-screen-map.md, flags A1–A6, B1–B3):
 *   "Learning", "Understood"      → formatTierLabel / formatSelfMarkLabel
 *   raw-status "Verified"         → the ledger's tier
 *   "Mark as understood"          → removed; a pass is evidence already
 *   "Self-logged", "Not yet verified", "Completed" badge → Self-assessed /
 *                                   formatArtefactVerifiedLabel
 *   `…%` labels and pct-driven widths → formatCount
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/** Surfaces that label a CONCEPT's state. */
const CONCEPT_SURFACES = [
  "src/app/syllabi/[id]/concept-row.tsx",
  "src/app/syllabi/[id]/goal-mandala.tsx",
  "src/app/concepts/[id]/page.tsx",
  "src/app/concepts/[id]/status-controls.tsx",
  "src/app/syllabi/[id]/gap/page.tsx",
  "src/app/syllabi/[id]/start/start-view.tsx",
];

/** Surfaces that label an ARTEFACT's state. */
const ARTEFACT_SURFACES = [
  "src/app/syllabi/[id]/artefact-row.tsx",
  "src/app/syllabi/[id]/artefact-form.tsx",
  "src/app/artefacts/[id]/page.tsx",
  "src/app/artefacts/[id]/artefact-footer.tsx",
  "src/app/u/[handle]/page.tsx",
];

/** A JSX text node or string literal containing exactly this word. */
const literal = (word: string) =>
  new RegExp(`(["'\`>]|\\{" "\\})\\s*${word}\\s*(["'\`<]|\\{)`);

describe("concept surfaces take their state words from the ledger module", () => {
  for (const file of CONCEPT_SURFACES) {
    describe(file, () => {
      const src = read(file);

      it("imports from surface-words or constellation", () => {
        expect(src).toMatch(/@\/lib\/readiness\/(surface-words|constellation)/);
      });

      it("never renders the retired words Learning / Understood as labels", () => {
        expect(src).not.toMatch(literal("Learning"));
        expect(src).not.toMatch(literal("Understood"));
        expect(src).not.toMatch(/label:\s*["']Learning["']/);
        expect(src).not.toMatch(/label:\s*["']Understood["']/);
      });

      it("never renders a literal 'Verified' — the word comes from formatTierLabel", () => {
        expect(src).not.toMatch(literal("Verified"));
        expect(src).not.toMatch(/label:\s*["']Verified["']/);
      });

      it("keys no label table on raw concept status", () => {
        // A Record keyed by the raw status union would let a status word leak
        // through as a label; tiers are the only allowed key.
        expect(src).not.toMatch(/Record<\s*(Concept)?Status\s*,\s*\{[^}]*label/);
      });
    });
  }
});

describe("the status control offers no Verified", () => {
  const src = read("src/app/concepts/[id]/status-controls.tsx");
  it("iterates SELF_MARK_STATUSES and names no raw 'verified' option", () => {
    expect(src).toContain("SELF_MARK_STATUSES");
    expect(src).not.toMatch(/status:\s*["']verified["']/);
  });
  const actions = read("src/app/concepts/[id]/actions.ts");
  it("the server action rejects 'verified' as a settable status", () => {
    expect(actions).toMatch(/ConceptStatus\.exclude\(\["verified"\]\)/);
  });
});

describe("the check flow offers nothing weaker than the evidence it wrote", () => {
  const check = read("src/app/concepts/[id]/competency-check.tsx");
  const page = read("src/app/concepts/[id]/page.tsx");
  it("no 'Mark as understood' and no self-mark write", () => {
    expect(check).not.toMatch(/Mark as understood/);
    expect(check).not.toMatch(/updateConceptStatus/);
    expect(page).not.toMatch(/ready to mark it understood/);
  });
  it("shows the taxonomy's dated label and the written/not-written copy", () => {
    expect(check).toContain("formatEvidenceLabelDated(");
    expect(check).toContain("CHECK_PASS_WRITTEN");
    expect(check).toContain("CHECK_FAIL_NOTHING_WRITTEN");
    expect(page).toContain("CHECK_INTRO");
  });
  it("the action returns the instant it wrote", () => {
    const actions = read("src/app/concepts/[id]/actions.ts");
    expect(actions).toMatch(/completedAt: completedAt\.toISOString\(\)/);
  });
});

describe("artefact surfaces use the taxonomy's words", () => {
  for (const file of ARTEFACT_SURFACES) {
    describe(file, () => {
      const src = read(file);
      it("imports from surface-words", () => {
        expect(src).toMatch(/@\/lib\/readiness\/surface-words/);
      });
      it("never says Self-logged, Not yet verified, or a bare Completed badge", () => {
        expect(src).not.toMatch(/Self-logged/);
        expect(src).not.toMatch(/Not yet verified/);
        expect(src).not.toMatch(literal("Completed"));
      });
      it("never offers 'verify' as an action", () => {
        expect(src).not.toMatch(/["'>]\s*(Verify|Unverify|Mark verified|Mark as verified)\s*["'<]/);
        expect(src).not.toMatch(/click to unverify/);
      });
    });
  }
  it("the public card's completed state is formatArtefactVerifiedLabel's string", () => {
    const src = read("src/app/u/[handle]/page.tsx");
    expect(src).toMatch(/a\.completed && a\.verifiedLabel/);
  });
});

describe("counts, not percentages, on the workspace", () => {
  const files = [
    "src/app/syllabi/[id]/goal-mandala.tsx",
    "src/app/syllabi/[id]/syllabus-tree.tsx",
    "src/app/syllabi/[id]/page.tsx",
    "src/app/syllabi/[id]/syllabus-views.tsx",
  ];
  for (const file of files) {
    it(`${file} carries no pct and draws no percentage`, () => {
      const src = read(file);
      expect(src).not.toMatch(/\bpct\b/);
      expect(src).not.toMatch(/\}%/); // `${x}%` or `{x}%`
      expect(src).not.toMatch(/strokeDasharray/);
      expect(src).not.toMatch(/style=\{\{\s*width/);
    });
  }
  it("the mandala and tree read counts through formatCount", () => {
    expect(read("src/app/syllabi/[id]/goal-mandala.tsx")).toContain("formatCount(");
    expect(read("src/app/syllabi/[id]/syllabus-tree.tsx")).toContain("formatCount(");
  });
  it("the mandala never says 'understood' for the verified count", () => {
    expect(read("src/app/syllabi/[id]/goal-mandala.tsx")).not.toMatch(/understood/);
  });
  it("hours are labelled as estimates", () => {
    expect(read("src/app/syllabi/[id]/page.tsx")).toContain("formatHoursEstimate(");
    expect(read("src/app/syllabi/[id]/syllabus-tree.tsx")).toContain("formatHoursEstimateShort(");
  });
  it("the generation overlay's bar is indeterminate", () => {
    const src = read("src/app/syllabi/new/generation-loading.tsx");
    expect(src).not.toMatch(/PROGRESS_CAP|PROGRESS_TAU/);
    expect(src).not.toMatch(/style=\{\{\s*width/);
    expect(src).toMatch(/animate-\[indeterminate/);
  });
});

describe("write surfaces are reachable from the default view", () => {
  it("the Tree is the default view", () => {
    expect(read("src/app/syllabi/[id]/syllabus-views.tsx")).toMatch(
      /useState<View>\("tree"\)/,
    );
  });
  it("the suggested-project link sits in the card's title row, not behind an expand", () => {
    const src = read("src/app/syllabi/[id]/syllabus-tree.tsx");
    const link = src.indexOf("View details &amp; build");
    const content = src.indexOf("<CollapsibleContent>", src.indexOf("function ProjectCard"));
    expect(link).toBeGreaterThan(0);
    expect(link).toBeLessThan(content);
  });
});
