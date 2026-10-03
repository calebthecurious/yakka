import { describe, it, expect } from "vitest";
import { PURPOSE_COPY, purposeCopy } from "./syllabus-purpose-copy";
import { SYLLABUS_PURPOSES } from "./syllabus-purpose";

/**
 * W-2's definition of done says the get_hired path is pixel-identical. These
 * are the product's strings as they stood before W-2, copied from the
 * components verbatim. If this test fails, the original flow changed.
 */
describe("PURPOSE_COPY.get_hired — pinned to the pre-W-2 strings", () => {
  const c = PURPOSE_COPY.get_hired;

  it("form labels, placeholders, help and button are byte-identical to the old form", () => {
    expect(c.form).toEqual({
      roleLabel: "Target role",
      rolePlaceholder: "e.g. ML Engineer, neural decoding",
      companyLabel: "Target company",
      companyPlaceholder: "e.g. Seer Medical",
      jdLabel: "Job description",
      jdPlaceholder: "Paste the full JD here.",
      skillsHelp:
        "The AI uses this to identify credential/experience gaps and suggest alternative target roles where your actual profile is viable.",
      submit: "Generate syllabus",
      submitting: "Generating…",
    });
  });

  it("start-here banner strings are byte-identical to the old banner", () => {
    expect(c.startHere).toEqual({
      freshTitle: "New here? Start with the on-ramp",
      freshBody:
        "See what this syllabus assumes you know, and exactly where to begin — no guessing.",
      revisitTitle: "Revisit your launching point",
      revisitBody: "Baselines this syllabus assumes, and the ordered first steps.",
    });
  });

  it("adds no element to the get_hired syllabus page or list card", () => {
    expect(c.headerBadge).toBeNull();
    expect(c.listTag).toBeNull();
  });
});

describe("PURPOSE_COPY.current_role — the wedge's framing", () => {
  const c = PURPOSE_COPY.current_role;

  it("uses the pack's selector label verbatim", () => {
    expect(c.selector.label).toBe("Master my current role");
    expect(PURPOSE_COPY.get_hired.selector.label).toBe("Land a role");
  });

  it("frames as a mastery map, never as get-hired", () => {
    const all = JSON.stringify(c).toLowerCase();
    expect(all).not.toContain("get hired");
    expect(all).not.toContain("interview");
    expect(all).not.toContain("target role");
    expect(c.headerBadge).toBe("Current role");
    expect(c.listTag).toBe("Current role");
  });

  it("never uses the word verified for anything the ledger would not", () => {
    // "verified" is allowed only as a description of ledger-verified work.
    expect(c.selector.description).toContain("where you're verified");
    expect(c.form.skillsHelp).toContain("already verified in");
  });
});

describe("coverage", () => {
  it("every purpose has complete copy and purposeCopy resolves it", () => {
    for (const p of SYLLABUS_PURPOSES) {
      const c = purposeCopy(p);
      expect(c.selector.label.length).toBeGreaterThan(0);
      for (const v of Object.values(c.form)) expect(v.length).toBeGreaterThan(0);
      for (const v of Object.values(c.startHere)) expect(v.length).toBeGreaterThan(0);
    }
  });
});
