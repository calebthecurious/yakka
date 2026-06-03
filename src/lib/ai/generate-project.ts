import { z } from "zod";
import { grok, DEFAULT_MODEL } from "./client";

/**
 * On-demand generator for a single artefact-bearing cluster's PROJECT: a
 * role-relevant problem plus the scaffolding (starting point, ordered approach,
 * per-criterion definition-of-done, project resources) that turns a bare problem
 * into a streamlined build flow.
 *
 * Relevance is the whole point: the project is anchored HARD on the specific
 * target role + company + the cluster's actual concepts, and reuses the cluster's
 * artefactTarget/employerValue when present. It must build the employer-valuable
 * artefact the role implies — not a generic CRUD/marketing service.
 */

const projectResourceSchema = z.object({
  title: z.string().min(1),
  // null when only a resource TYPE is known. Never fabricate a URL.
  url: z.string().nullable().optional(),
  why: z.string().min(1),
});

const milestoneSchema = z.object({
  step: z.string().min(1),
  detail: z.string().min(1),
});

const criterionGuidanceSchema = z.object({
  criterion: z.string().min(1),
  definitionOfDone: z.string().min(1),
});

export const generatedProjectSchema = z.object({
  type: z.enum(["project", "writeup", "certificate", "contribution"]),
  title: z.string().min(1),
  description: z.string().min(1),
  employerValue: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(3).max(6),
  startingPoint: z.string().min(1),
  suggestedApproach: z.array(milestoneSchema).min(4).max(7),
  criteriaGuidance: z.array(criterionGuidanceSchema).min(1),
  projectResources: z.array(projectResourceSchema).min(1).max(8),
  demonstratesConcepts: z.array(z.string().min(1)).min(1).max(12),
});

export type GeneratedProject = z.infer<typeof generatedProjectSchema>;

export type GenerateProjectInput = {
  targetRole: string;
  targetCompany?: string;
  jobDescription: string;
  clusterName: string;
  clusterDescription: string;
  /** From the cluster's artefactTarget, when it exists. Reuse as the basis. */
  employerValue?: string;
  existingArtefact?: {
    type: "project" | "writeup" | "certificate" | "contribution";
    title: string;
    description: string;
  } | null;
  /** The cluster's concepts — the project must develop a real subset of these. */
  concepts: { name: string; description: string }[];
};

const PERSONA = `You are a senior engineer and hiring manager who has personally interviewed and hired people into the exact role being targeted. You design portfolio projects that make a candidate's relevant ability unmistakable. Direct, concrete, no fluff.`;

const SYSTEM_PROMPT = `${PERSONA}

Design ONE project that a candidate for a SPECIFIC role will build to prove they can do the work, then scaffold it so they can actually complete it. Call \`emit_project\`. Produce no other text.

RELEVANCE IS THE WHOLE POINT — read before anything else:

The project MUST be traceable to what THIS role actually does, anchored on the target role, the target company, and the cluster's actual concepts you are given. Do NOT pattern-match the job title and produce a generic problem.

- Anchor on the SPECIFIC role + company + concepts. If the role is a brain-computer-interface applications engineer, the project involves things like participant-facing UI, brain-signal handling, accessibility, native mobile, low-latency rendering — NOT a generic marketing platform, e-commerce store, blog, or todo/CRUD app.
- If you are given an existing artefact (title/description) and/or an employerValue line, REUSE them as the basis — build that defined employer-valuable artefact, do not invent an unrelated one. Sharpen it; don't replace it with something generic.
- Every project must develop a real subset of the cluster's actual concepts (use their exact names in \`demonstratesConcepts\`).

HARD SELF-CHECK before you emit (if the answer is "no", discard and redesign):
  "Would a hiring manager for THIS exact role, at THIS company, look at the finished artefact and immediately see directly relevant ability for the job they're hiring for?"
Generic projects with no role/company relevance are a FAILURE. Reject them.

Produce:

1. **type / title / description.** The buildable artefact. Title is specific to the role (not "A portfolio project"). Description says concretely what gets built and why it maps to the role.

1b. **employerValue** — one concrete, role-specific sentence on WHY an employer hiring for THIS role values the ability this artefact proves (tie it to the actual JD, not "good portfolio piece"). If an employerValue was provided above, keep/sharpen it.

2. **acceptanceCriteria** — 3-6 concrete, checkable, single-sentence "done" bullets, measurable where possible (e.g. "p99 query latency < 50ms on 7-day windows"), not soft ("code is clean").

3. **startingPoint** — the very FIRST concrete action the user should take to begin (one specific, small, unambiguous move that kills blank-page paralysis). E.g. "Scaffold a SwiftUI app with a single screen that renders a hardcoded 10-second neural trace from a local JSON fixture."

4. **suggestedApproach** — 4-7 ORDERED milestones ({step, detail}) taking the user from nothing to the completed artefact. Each \`step\` is a short imperative title; \`detail\` is 1-2 sentences of concrete guidance. Real build order, dependencies first.

5. **criteriaGuidance** — for EACH acceptance criterion above, one entry: \`criterion\` is the criterion text copied verbatim, \`definitionOfDone\` is a one-line description of what "good/done" looks like for it. Same count as acceptanceCriteria.

6. **projectResources** — 1-8 relevant pointers ({title, url, why}). \`why\` says how it helps THIS project.
   - URLs MUST be real and verifiable. Prefer well-known OFFICIAL documentation (e.g. the framework's own docs, an official API reference, a canonical spec).
   - DO NOT FABRICATE URLs. If you are not confident a specific URL is real, set \`url\` to null and describe the resource TYPE in the title/why instead (e.g. title "Official Apple Accessibility (VoiceOver) documentation", url null, why "..."). A null url is correct; a hallucinated link is a defect.

7. **demonstratesConcepts** — the concept NAMES (copied verbatim from the provided cluster concept list) that building this artefact genuinely develops. Pick the real subset, not all of them.

Checklist before emitting — fix any "no":
- [ ] The project is unmistakably relevant to THIS role + company (passes the hard self-check)
- [ ] It builds the given artefact/employerValue when one was provided (not a generic substitute)
- [ ] startingPoint is a single concrete first action
- [ ] suggestedApproach is 4-7 ordered, buildable milestones
- [ ] criteriaGuidance has one entry per acceptance criterion, criterion text copied verbatim
- [ ] Every projectResource url is either a real official doc or null (never invented)
- [ ] demonstratesConcepts are names copied verbatim from the provided list`;

const PROJECT_SCHEMA = {
  type: "object" as const,
  required: [
    "type",
    "title",
    "description",
    "employerValue",
    "acceptanceCriteria",
    "startingPoint",
    "suggestedApproach",
    "criteriaGuidance",
    "projectResources",
    "demonstratesConcepts",
  ],
  properties: {
    type: {
      type: "string",
      enum: ["project", "writeup", "certificate", "contribution"],
    },
    title: { type: "string" },
    description: { type: "string" },
    employerValue: {
      type: "string",
      description:
        "One concrete, role-specific sentence on why an employer hiring for THIS role values the ability this artefact proves. Not 'good portfolio piece'.",
    },
    acceptanceCriteria: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: { type: "string" },
    },
    startingPoint: {
      type: "string",
      description: "The single concrete first action to take. Kills blank-page paralysis.",
    },
    suggestedApproach: {
      type: "array",
      minItems: 4,
      maxItems: 7,
      description: "Ordered milestones from nothing to a finished artefact.",
      items: {
        type: "object",
        required: ["step", "detail"],
        properties: {
          step: { type: "string", description: "Short imperative milestone title." },
          detail: { type: "string", description: "1-2 sentences of concrete guidance." },
        },
      },
    },
    criteriaGuidance: {
      type: "array",
      description:
        "One entry per acceptance criterion (same count); criterion text copied verbatim.",
      items: {
        type: "object",
        required: ["criterion", "definitionOfDone"],
        properties: {
          criterion: { type: "string" },
          definitionOfDone: { type: "string" },
        },
      },
    },
    projectResources: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      description:
        "Relevant pointers. url MUST be a real official doc or null — NEVER fabricated.",
      items: {
        type: "object",
        required: ["title", "why"],
        properties: {
          title: { type: "string" },
          url: {
            type: ["string", "null"],
            description:
              "Real, verifiable official doc URL, or null if not certain. Do not invent links.",
          },
          why: { type: "string", description: "How this helps THIS project." },
        },
      },
    },
    demonstratesConcepts: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      description:
        "Concept NAMES copied verbatim from the provided cluster concept list that this artefact develops.",
      items: { type: "string" },
    },
  },
};

type ChatMessage = Parameters<
  typeof grok.chat.completions.create
>[0]["messages"][number];

function isTransientConnectionError(err: unknown): boolean {
  const cause = (err as { cause?: unknown } | null)?.cause;
  const text = [
    err instanceof Error ? err.message : String(err),
    cause instanceof Error ? cause.message : "",
  ]
    .join(" ")
    .toLowerCase();
  return /terminated|econnreset|socket hang up|other side closed|und_err_socket|fetch failed/.test(
    text,
  );
}

async function callEmitProject(messages: ChatMessage[]): Promise<string> {
  const stream = await grok.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: 8000,
    messages,
    tools: [
      {
        type: "function",
        function: {
          name: "emit_project",
          description: "Emit the scaffolded, role-relevant project.",
          parameters: PROJECT_SCHEMA,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "emit_project" } },
    stream: true,
  });

  let args = "";
  for await (const chunk of stream) {
    const tc = chunk.choices[0]?.delta?.tool_calls?.[0];
    if (tc?.function?.arguments) args += tc.function.arguments;
  }
  return args;
}

function formatZodErrors(err: z.ZodError): string {
  return err.issues
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

function contextLines(input: GenerateProjectInput): string {
  const conceptList = input.concepts
    .map((c) => `- ${c.name}: ${c.description}`)
    .join("\n");
  return [
    `Target role: ${input.targetRole}`,
    input.targetCompany ? `Target company: ${input.targetCompany}` : null,
    "",
    "Job description:",
    input.jobDescription,
    "",
    `Cluster: ${input.clusterName}`,
    `Cluster description: ${input.clusterDescription}`,
    input.employerValue
      ? `\nThis cluster's employer-value framing (reuse as the basis):\n${input.employerValue}`
      : null,
    input.existingArtefact
      ? `\nExisting defined artefact to build (sharpen, do not replace):\n${input.existingArtefact.title} — ${input.existingArtefact.description}`
      : null,
    "",
    "Cluster concepts (use these EXACT names for demonstratesConcepts):",
    conceptList,
    "",
    "Design the role-relevant, scaffolded project now.",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

export async function generateProject(
  input: GenerateProjectInput,
): Promise<GeneratedProject> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: contextLines(input) },
  ];

  let raw = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      raw = await callEmitProject(messages);
      break;
    } catch (err) {
      if (attempt === 2 || !isTransientConnectionError(err)) throw err;
      await new Promise((r) => setTimeout(r, 750));
    }
  }
  if (raw.length === 0) throw new Error("generateProject: empty tool call");

  const first = generatedProjectSchema.safeParse(JSON.parse(raw));
  if (first.success) return first.data;

  // One corrective retry with the validation errors fed back.
  const retry = await callEmitProject([
    ...messages,
    {
      role: "user",
      content: `Your previous emit_project call failed validation:\n${formatZodErrors(
        first.error,
      )}\n\nFix every issue and call emit_project again. Keep the project role-relevant and never fabricate URLs (use null when unsure).`,
    },
  ]);
  return generatedProjectSchema.parse(JSON.parse(retry));
}
