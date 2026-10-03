import type { SyllabusPurpose } from "./syllabus-purpose";

/**
 * Purpose-dependent presentation copy (W-2). Framing is PRESENTATION-LAYER:
 * the generator, its prompts and its output are identical for both purposes;
 * only what the product says around them changes.
 *
 * `get_hired` entries are the product's existing strings, verbatim — a test
 * pins them so the original flow stays byte-identical. `current_role` entries
 * use the wedge's own words from strengthening-pack-v1 (W-2): a role mastery
 * map — what this role demands, where you're verified, what to build next.
 *
 * [LATE-BIND] The W-2 brief sources final current_role copy from the PR-2
 * copy session's second half, which is not in the repo. The strings below are
 * honest placeholders drawn from the pack; replacing them is a copy-only
 * change in this one file.
 */

export interface PurposeCopy {
  /** Selector card. */
  selector: { label: string; description: string };
  /** Creation form. */
  form: {
    roleLabel: string;
    rolePlaceholder: string;
    companyLabel: string;
    companyPlaceholder: string;
    jdLabel: string;
    jdPlaceholder: string;
    skillsHelp: string;
    submit: string;
    submitting: string;
  };
  /** Syllabus page header badge; null renders nothing (the get_hired path adds no element). */
  headerBadge: string | null;
  /** Start-here banner, before and after the learner has begun. */
  startHere: {
    freshTitle: string;
    freshBody: string;
    revisitTitle: string;
    revisitBody: string;
  };
  /** Small tag on the /syllabi list card; null renders nothing. */
  listTag: string | null;
}

export const PURPOSE_COPY: Readonly<Record<SyllabusPurpose, PurposeCopy>> = {
  get_hired: {
    selector: {
      label: "Land a role",
      description: "Paste a target job description and build toward it.",
    },
    form: {
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
    },
    headerBadge: null,
    startHere: {
      freshTitle: "New here? Start with the on-ramp",
      freshBody:
        "See what this syllabus assumes you know, and exactly where to begin — no guessing.",
      revisitTitle: "Revisit your launching point",
      revisitBody: "Baselines this syllabus assumes, and the ordered first steps.",
    },
    listTag: null,
  },
  current_role: {
    selector: {
      label: "Master my current role",
      description: "Paste your own job description. Get a map of what it demands, where you're verified, and what to build next.",
    },
    form: {
      roleLabel: "Your current role",
      rolePlaceholder: "e.g. Signal Processing Engineer",
      companyLabel: "Your employer",
      companyPlaceholder: "e.g. Seer Medical",
      jdLabel: "Your current job description",
      jdPlaceholder: "Paste your own JD here — the one for the job you have now.",
      skillsHelp:
        "The AI uses this to work out which parts of your role you're already verified in, and what to build next.",
      submit: "Map my role",
      submitting: "Mapping…",
    },
    headerBadge: "Current role",
    startHere: {
      freshTitle: "Start with what this role demands",
      freshBody:
        "See which parts of your role you're already verified in, and exactly what to build next.",
      revisitTitle: "Revisit what this role demands",
      revisitBody: "The baselines this role assumes, and the ordered next steps.",
    },
    listTag: "Current role",
  },
};

export function purposeCopy(purpose: SyllabusPurpose): PurposeCopy {
  return PURPOSE_COPY[purpose];
}
