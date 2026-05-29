import { z } from "zod";
import { grok, DEFAULT_MODEL } from "./client";

export const alternativeTargetBranchSchema = z.object({
  role: z.string().min(1),
  rationale: z.string().min(1),
  tradeoffs: z.string().min(1),
});

export const suggestedResourceSchema = z.object({
  type: z.enum(["course", "book", "video", "article", "project", "paper"]),
  title: z.string().min(1),
  url: z.string().optional(),
  author: z.string().optional(),
  priority: z.number().int().min(1),
});

export const conceptSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  orderIndex: z.number().int().nonnegative(),
  tier: z.enum(["foundation", "intermediate", "advanced"]),
  suggestedResources: z
    .array(suggestedResourceSchema)
    .min(2)
    .max(3)
    .refine(
      (rs) => rs.some((r) => r.priority === 1),
      "Each concept must have exactly one priority-1 resource.",
    ),
});

export const subSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  orderIndex: z.number().int().nonnegative(),
  estimatedHours: z.number().int().nonnegative(),
  concepts: z.array(conceptSchema).min(4).max(10),
});

export const suggestedArtefactSchema = z.object({
  type: z.enum(["project", "writeup", "certificate", "contribution"]),
  title: z.string().min(1),
  description: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(3).max(6),
});

export const clusterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(["technical", "domain", "soft", "meta"]),
  weight: z.number().int().min(1).max(5),
  orderIndex: z.number().int().nonnegative(),
  subSkills: z.array(subSkillSchema).min(2).max(5),
  suggestedArtefact: suggestedArtefactSchema,
});

export const syllabusSchema = z
  .object({
    roleNature: z.enum(["technical", "non_technical", "hybrid"]),
    structuralBlockers: z.array(z.string().min(1)),
    alternativeTargetBranches: z.array(alternativeTargetBranchSchema),
    clusters: z.array(clusterSchema).min(4).max(7),
  })
  .refine(
    (s) => s.clusters.some((c) => c.type === "soft"),
    "Syllabus must include at least one cluster of type 'soft'.",
  )
  .refine(
    (s) => s.clusters.some((c) => c.type === "domain"),
    "Syllabus must include at least one cluster of type 'domain'.",
  );

export type GeneratedSyllabus = z.infer<typeof syllabusSchema>;

export type GenerateSyllabusInput = {
  targetRole: string;
  targetCompany?: string;
  jobDescription: string;
  currentSkills: string;
};

/**
 * Generation is split into two stages so no single streamed Grok call runs long
 * enough to hit the upstream ~60s stream-duration cut:
 *   1. SKELETON  — blockers, branches, clusters + sub-skills + artefacts (no
 *      concepts/resources). Small, fast.
 *   2. DETAIL    — per cluster, the concepts + resources for its sub-skills.
 *      One call per cluster, run in parallel; each is ~1/N the size.
 * The two stages are assembled and validated against `syllabusSchema`, so the
 * return shape (and every caller) is unchanged.
 */

const PERSONA = `You are a senior engineer and career strategist who has personally hired people into roles like the one being targeted. You've watched dozens of self-taught engineers either land these jobs or wash out in the loop. You know which knowledge gaps are fixable, which ones aren't, and which resources actually move the needle. Direct, no fluff. No marketing language. State what things are.`;

const SKELETON_SYSTEM_PROMPT = `${PERSONA}

Produce the STRUCTURE of a learning syllabus from a job description by calling \`emit_skeleton\`. You are NOT writing concepts or resources yet — only the role classification, blockers, alternative branches, and the cluster / sub-skill scaffold. Do not produce any other text.

ROLE NATURE — CLASSIFY THIS FIRST, before you design a single cluster:

Set \`roleNature\` to one of:
- **'technical'** — the role is primarily about BUILDING / engineering systems (e.g. software engineer, ML engineer, data engineer, embedded/firmware engineer). The bulk of the day is producing or operating technical artefacts.
- **'non_technical'** — the role is primarily about PEOPLE, STRATEGY, COMMUNICATION, or OPERATIONS (e.g. marketing lead, clinical research coordinator, sales, recruiter, program/operations manager). Tools and data may be used, but building systems is not the core of the job.
- **'hybrid'** — a SUBSTANTIAL mix of both, where neither side dominates (e.g. product manager, technical program manager, solutions/sales engineer, founder, developer advocate).

Decide from what the JD actually spends its responsibilities and requirements on — not from the title's stereotype or the company's industry. A "coordinator" at a deep-tech company is usually still non_technical; a "manager" who ships code is often hybrid.

roleNature MUST SHAPE THE CLUSTER MIX you produce (this is the whole point — stop defaulting to a technical-heavy syllabus regardless of role):
- **technical role** → MAJORITY of clusters are type 'technical' or 'domain', but STILL include at least one 'soft' or 'meta' cluster (technical roles still require communication, collaboration, and interview performance — do not drop these).
- **non_technical role** → MAJORITY of clusters are type 'soft' or 'domain'. Include 'technical' clusters ONLY where the JD genuinely requires tool/data/systems literacy (e.g. "build dashboards in Looker", "manage the CRM"). Do NOT force heavy engineering content (programming, system design, algorithms) onto a non_technical role — that is the failure mode to avoid.
- **hybrid role** → a GENUINE BALANCE: explicitly cover both the technical side and the people/strategy side; neither should be a token afterthought.

Self-check before emitting: does the type distribution of your clusters actually match the roleNature you set? If you classified 'non_technical' but produced four 'technical' clusters, you have misclassified or mis-designed — fix it.

ROLE FIDELITY — read this before you start:

Every cluster and every sub-skill you produce must trace to a SPECIFIC line or clear implication of THE JOB DESCRIPTION you were given. Anchor on the JD's verbatim responsibilities and requirements — NOT on generic expectations for the job title. Two candidates with the same title can have wildly different JDs; the JD is the ground truth, the title is just a label.

Forbidden patterns:
- Do NOT include clusters or sub-skills that belong to ADJACENT roles at the same kind of company. A BCI applications engineer is not a backend infrastructure engineer. A frontend engineer is not an ML researcher. A solutions architect is not a platform SRE. Stay strictly within the discipline the JD describes.
- Do NOT pattern-match on the company name to import its broader engineering culture's concerns. (e.g. if the JD is for a mobile-app role at an AI lab, do NOT bring in LLM ops, prompt engineering, rate limiting, credential rotation, model-call audit logging, or other platform-infra concerns — those belong to a different role at the same company.)
- Do NOT include "things every senior engineer should know" if the JD doesn't actually call them out and a hiring manager for THIS role wouldn't assess them. Bias toward DEPTH in the role's actual core areas over BREADTH across tangentially-related areas.

Before emitting each cluster, silently self-check:
  "Can I point to specific JD text (a line, a responsibility, a tool, a workflow) that justifies this cluster, AND would a hiring manager for THIS specific role recognize it as part of what they actually assess?"
If the answer to either part is no, drop the cluster and replace it with one that does fit.

Rules:

1. **Structural blockers.** \`structuralBlockers\`: short, specific strings, one per blocker (e.g. "Requires US work authorization; not addressable by self-study"). Empty array if none. Don't invent blockers; don't paper over real ones.

2. **Alternative branches.** \`alternativeTargetBranches\`: 2-4 \`{role, rationale, tradeoffs}\` for adjacent roles viable for this learner's actual profile, with honest tradeoffs. Empty array if no real blockers.

3. **4-7 clusters, with a TYPE MIX that fits \`roleNature\`** (see the ROLE NATURE section above). Weight each 1-5 by importance to THIS specific JD. The mix is not fixed — a technical role leans technical/domain, a non_technical role leans soft/domain, a hybrid role balances both.

4. **Cluster \`orderIndex\` is the LEARNING-PATH ORDER.** 0 is the first cluster a learner should work on. Order foundations-first: clusters whose content prerequisites the others come earlier. Foundational/domain-knowledge clusters typically precede applied-technical clusters; soft/interview clusters can sit later. This is a deliberate learning sequence, not arbitrary.

5. **At least one cluster of type 'soft'** — concrete communication/collaboration/interview skills for THIS role (e.g. "Writing engineering design docs that get approved"), not generic "be a good teammate".

6. **At least one cluster of type 'domain'** — role-specific field knowledge a generalist would lack, traced to the JD (e.g. for a BCI mobile-apps role: neural-decoding fundamentals because the JD asks the engineer to expose decoded brain signals to UI). Not generic "industry knowledge".

7. **Classify each cluster's \`type\`:** technical (craft), domain (field knowledge), soft (interpersonal/interview), meta (learning-to-learn).

8. **Each cluster has 2-5 sub-skills.** For each: a specific \`name\`, a 1-2 sentence \`description\` of what mastering it means, realistic \`estimatedHours\` for a self-taught learner starting from the candidate's actual current skills (usually 20-80 hours per sub-skill), AND an \`orderIndex\` (0 first) that reflects a sensible foundations-first order WITHIN the cluster. Do NOT include concepts — those come later.

9. **One concrete portfolio artefact per cluster**, specific enough that a hiring manager for this exact role (not a generic engineering manager) would recognize the relevance. Pick the type that fits: project, writeup, certificate, contribution. Include \`acceptanceCriteria\`: 3-6 concrete, checkable, single-sentence "done" bullets, measurable where possible ("Detector achieves AUC ≥ 0.85 on held-out test set"), not soft ones like "code is clean".

Checklist before emitting — fix any "no":
- [ ] \`roleNature\` is set ('technical' | 'non_technical' | 'hybrid') from what the JD actually does
- [ ] The cluster type mix MATCHES roleNature (technical → mostly technical/domain + ≥1 soft/meta; non_technical → mostly soft/domain, technical only where truly required; hybrid → balanced both sides)
- [ ] A non_technical role is NOT flooded with heavy engineering clusters
- [ ] Every cluster traces to specific JD text or a clear JD implication
- [ ] No clusters belong to an adjacent role at the same kind of company
- [ ] 4-7 clusters, ordered foundations-first via orderIndex
- [ ] At least one cluster type='soft'
- [ ] At least one cluster type='domain'
- [ ] Every cluster has 2-5 sub-skills, each with estimatedHours and orderIndex
- [ ] Every cluster has a suggestedArtefact with 3-6 acceptanceCriteria
- [ ] The cluster at orderIndex 0 is a sensible STARTING POINT for someone beginning this journey`;

const DETAIL_SYSTEM_PROMPT = `${PERSONA}

You are filling in ONE sub-skill of an already-designed syllabus. You will be given the target role/JD/current-skills for context, the cluster the sub-skill belongs to (name, type, description), and the specific sub-skill (name + description). Produce that sub-skill's concepts by calling \`emit_concepts\`. Do not produce any other text.

ROLE FIDELITY at the concept level:

Every concept must serve THE specific job described in the JD — not the job title, not the company at large. Self-check each concept silently:
  "Can I trace this concept to a specific JD responsibility or requirement, or to established practice required to perform one? AND would a hiring manager for THIS specific role recognize it as something they assess?"
If either part is no, drop the concept and pick a different one that does fit.

Do NOT include concepts that belong to adjacent roles at the same company. (Example: for a BCI applications engineer building native mobile apps, do NOT include backend-infra concepts like rate limiting, credential rotation, audit logging of model calls, or LLM-proxy patterns — those are platform-engineering concerns, not applications-engineering ones.)

Bias toward DEPTH in the role's actual core areas. It is better to give a learner 6 deep, role-specific concepts than 10 shallow generically-senior ones.

Rules:

1. **This sub-skill has 4-10 concepts.** Concepts are atomic, checkable units of understanding — things you either grasp or don't. \`name\` is concise and specific ("Backpropagation through time", not "RNN stuff"). \`description\` is 1-2 sentences on what actually understanding it means.

2. **\`orderIndex\` is the LEARNING-PATH ORDER inside this sub-skill.** 0 is the first concept the learner should tackle. Order so FUNDAMENTALS come first and concepts that DEPEND on them come later. This is a real teach-in-this-order sequence, not arbitrary.

3. **\`tier\` classifies each concept as 'foundation' | 'intermediate' | 'advanced'**:
   - **foundation** — the prerequisite mental model a learner must hold before the rest of this sub-skill makes sense. There should be 1-3 of these per sub-skill, typically at low orderIndex.
   - **intermediate** — the core working knowledge of the sub-skill. Most concepts will live here.
   - **advanced** — material that meaningfully extends or specializes the sub-skill; not required to be functional, but a clear strength.

   Calibrate: a real sub-skill has a small foundation, a chunky intermediate body, and a few advanced topics. Don't label everything 'foundation' (the learner gets no progression) and don't label everything 'advanced' (the learner has nowhere to start). The first concept (orderIndex 0) MUST be tier='foundation' and must be a genuine, sensible starting point.

4. **Each concept has 2-3 resources.** Exactly one is the primary recommendation with \`priority: 1\`; the other 1-2 are alternatives with \`priority: 2+\`. Resources must be REAL and SPECIFIC: named books with author/edition, named courses, specific talks, specific YouTube series — not "watch some videos on X". If you don't know a real resource, narrow the concept rather than inventing one.

5. **Every resource MUST include a canonical \`url\`** — the page a learner would actually start from (publisher/author page for a book, playlist URL for a YouTube series, the course's own page, arXiv/DOI for a paper). Use https where available. NO Google search URLs, NO Wikipedia, NO generic homepages. If you can't confidently produce a canonical URL, swap to a resource you do know.

Checklist before emitting — fix any "no":
- [ ] Every concept traces to specific JD text or to established practice the JD's work demands
- [ ] No concepts belong to adjacent-role disciplines
- [ ] 4-10 concepts for this sub-skill
- [ ] orderIndex starts at 0 and goes fundamentals-first
- [ ] Every concept has a tier; concept at orderIndex 0 has tier='foundation'
- [ ] Mix of tiers reflects a real learning progression (not all-foundation, not all-advanced)
- [ ] Every concept has 2-3 resources, exactly one with priority=1
- [ ] Every resource is real and named, with a canonical URL`;

const ARTEFACT_SCHEMA = {
  type: "object" as const,
  required: ["type", "title", "description", "acceptanceCriteria"],
  properties: {
    type: {
      type: "string",
      enum: ["project", "writeup", "certificate", "contribution"],
    },
    title: { type: "string" },
    description: { type: "string" },
    acceptanceCriteria: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      description: "3-6 concrete, checkable 'done' bullets, single sentences.",
      items: { type: "string" },
    },
  },
};

const SKELETON_INPUT_SCHEMA = {
  type: "object" as const,
  required: [
    "roleNature",
    "structuralBlockers",
    "alternativeTargetBranches",
    "clusters",
  ],
  properties: {
    roleNature: {
      type: "string",
      enum: ["technical", "non_technical", "hybrid"],
      description:
        "Classify the TARGET ROLE from the JD before designing clusters: 'technical' (primarily building/engineering), 'non_technical' (primarily people/strategy/communication/operations), or 'hybrid' (a substantial mix). This MUST be consistent with the cluster mix you emit.",
    },
    structuralBlockers: {
      type: "array",
      description: "Specific blocker strings. Empty array if none.",
      items: { type: "string" },
    },
    alternativeTargetBranches: {
      type: "array",
      description: "Adjacent viable roles. Empty if no blockers.",
      items: {
        type: "object",
        required: ["role", "rationale", "tradeoffs"],
        properties: {
          role: { type: "string" },
          rationale: { type: "string" },
          tradeoffs: { type: "string" },
        },
      },
    },
    clusters: {
      type: "array",
      minItems: 4,
      maxItems: 7,
      description:
        "4-7 clusters whose TYPE MIX fits roleNature (technical role → majority technical/domain but still ≥1 soft/meta; non_technical role → majority soft/domain, technical clusters only where the role truly needs tools/data/systems literacy; hybrid → genuine both-sides balance). Always at least one type 'soft' and at least one type 'domain'. No concepts here.",
      items: {
        type: "object",
        required: [
          "name",
          "description",
          "type",
          "weight",
          "orderIndex",
          "subSkills",
          "suggestedArtefact",
        ],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          type: {
            type: "string",
            enum: ["technical", "domain", "soft", "meta"],
          },
          weight: { type: "integer", minimum: 1, maximum: 5 },
          orderIndex: { type: "integer", minimum: 0 },
          subSkills: {
            type: "array",
            minItems: 2,
            maxItems: 5,
            description:
              "2-5 sub-skills, ordered foundations-first via orderIndex (0 first).",
            items: {
              type: "object",
              required: [
                "name",
                "description",
                "orderIndex",
                "estimatedHours",
              ],
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                orderIndex: {
                  type: "integer",
                  minimum: 0,
                  description:
                    "Learning-path order within the cluster; 0 first, foundations-first.",
                },
                estimatedHours: { type: "integer", minimum: 0 },
              },
            },
          },
          suggestedArtefact: ARTEFACT_SCHEMA,
        },
      },
    },
  },
};

const CONCEPT_ITEM_SCHEMA = {
  type: "object" as const,
  required: [
    "name",
    "description",
    "orderIndex",
    "tier",
    "suggestedResources",
  ],
  properties: {
    name: {
      type: "string",
      description: "Concise and specific.",
    },
    description: {
      type: "string",
      description: "1-2 sentences on what understanding this concept means.",
    },
    orderIndex: {
      type: "integer",
      minimum: 0,
      description:
        "Learning-path order inside the sub-skill; 0 first, fundamentals-first.",
    },
    tier: {
      type: "string",
      enum: ["foundation", "intermediate", "advanced"],
      description:
        "Concept's place in the learning progression. The concept at orderIndex 0 MUST be 'foundation'. Calibrate the mix; don't make everything foundation or everything advanced.",
    },
    suggestedResources: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      description: "2-3 real, named resources. Exactly one with priority 1.",
      items: {
        type: "object",
        required: ["type", "title", "priority"],
        properties: {
          type: {
            type: "string",
            enum: ["course", "book", "video", "article", "project", "paper"],
          },
          title: { type: "string" },
          url: {
            type: "string",
            description:
              "Required. Canonical landing page (https where possible). No Google search URLs, Wikipedia, or generic homepages.",
          },
          author: { type: "string" },
          priority: { type: "integer", minimum: 1 },
        },
      },
    },
  },
};

const DETAIL_INPUT_SCHEMA = {
  type: "object" as const,
  required: ["concepts"],
  properties: {
    concepts: {
      type: "array",
      minItems: 4,
      maxItems: 10,
      description: "The 4-10 concepts for this one sub-skill.",
      items: CONCEPT_ITEM_SCHEMA,
    },
  },
};

// Internal stage schemas. The skeleton has clusters with sub-skills but no
// concepts; the detail returns concepts grouped by sub-skill.
const skeletonSubSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  orderIndex: z.number().int().nonnegative(),
  estimatedHours: z.number().int().nonnegative(),
});
const skeletonClusterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(["technical", "domain", "soft", "meta"]),
  weight: z.number().int().min(1).max(5),
  orderIndex: z.number().int().nonnegative(),
  subSkills: z.array(skeletonSubSkillSchema).min(2).max(5),
  suggestedArtefact: suggestedArtefactSchema,
});
const skeletonSchema = z
  .object({
    roleNature: z.enum(["technical", "non_technical", "hybrid"]),
    structuralBlockers: z.array(z.string().min(1)),
    alternativeTargetBranches: z.array(alternativeTargetBranchSchema),
    clusters: z.array(skeletonClusterSchema).min(4).max(7),
  })
  .refine(
    (s) => s.clusters.some((c) => c.type === "soft"),
    "Syllabus must include at least one cluster of type 'soft'.",
  )
  .refine(
    (s) => s.clusters.some((c) => c.type === "domain"),
    "Syllabus must include at least one cluster of type 'domain'.",
  );
type SyllabusSkeleton = z.infer<typeof skeletonSchema>;
type SkeletonCluster = z.infer<typeof skeletonClusterSchema>;

// The detail stage now resolves one sub-skill at a time, so each call returns
// just that sub-skill's concepts.
const subSkillConceptsSchema = z.object({
  concepts: z.array(conceptSchema).min(4).max(10),
});

type ChatMessage = Parameters<
  typeof grok.chat.completions.create
>[0]["messages"][number];
type ChatTool = NonNullable<
  Parameters<typeof grok.chat.completions.create>[0]["tools"]
>[number];

function tool(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
): ChatTool {
  return { type: "function", function: { name, description, parameters } };
}

type ToolCallResult = {
  id: string;
  name: string;
  arguments: string;
  finishReason: string | null;
};

async function callGrok(
  messages: ChatMessage[],
  tools: ChatTool[],
  toolName: string,
): Promise<ToolCallResult> {
  const stream = await grok.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: 16000,
    messages,
    tools,
    tool_choice: { type: "function", function: { name: toolName } },
    stream: true,
  });

  let id = "";
  let name = "";
  let args = "";
  let finishReason: string | null = null;

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (!choice) continue;
    const toolDeltas = choice.delta?.tool_calls;
    if (toolDeltas) {
      for (const tc of toolDeltas) {
        if (tc.id) id = tc.id;
        if (tc.function?.name) name = tc.function.name;
        if (tc.function?.arguments) args += tc.function.arguments;
      }
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  }

  return { id, name, arguments: args, finishReason };
}

// A transient mid-stream socket drop (undici `TypeError: terminated`) is a
// transport failure, not a bad request — retry it. Real failures bubble up.
function isTransientConnectionError(err: unknown): boolean {
  const cause = (err as { cause?: unknown } | null)?.cause;
  const text = [
    err instanceof Error ? err.message : String(err),
    cause instanceof Error ? cause.message : "",
  ]
    .join(" ")
    .toLowerCase();
  const code =
    (err as { code?: string } | null)?.code ??
    (cause as { code?: string } | null)?.code ??
    "";
  return (
    /terminated|econnreset|socket hang up|other side closed|und_err_socket|fetch failed/.test(
      text,
    ) || ["ECONNRESET", "UND_ERR_SOCKET", "ETIMEDOUT", "EPIPE"].includes(code)
  );
}

async function callGrokWithRetry(
  messages: ChatMessage[],
  tools: ChatTool[],
  toolName: string,
  maxAttempts = 2,
): Promise<ToolCallResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callGrok(messages, tools, toolName);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isTransientConnectionError(err)) throw err;
      const backoffMs = 750 * attempt;
      console.warn(
        `[generateSyllabus] transient connection error on attempt ${attempt}/${maxAttempts}; retrying in ${backoffMs}ms: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastErr;
}

function formatZodErrors(err: z.ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.length > 0 ? i.path.join(".") : "(root)";
      return `- ${path}: ${i.message}`;
    })
    .join("\n");
}

// Call a tool, validate against `schema`, and retry once with the validation
// errors fed back if the first attempt fails.
async function callAndParse<T>(
  label: string,
  messages: ChatMessage[],
  tools: ChatTool[],
  toolName: string,
  schema: z.ZodType<T>,
  retryReminder: string,
): Promise<T> {
  const first = await callGrokWithRetry(messages, tools, toolName);
  if (first.name !== toolName || first.arguments.length === 0) {
    throw new Error(
      `${label}: expected ${toolName} tool call; got finish_reason=${first.finishReason}, name=${first.name || "(none)"}`,
    );
  }

  const firstResult = schema.safeParse(JSON.parse(first.arguments));
  if (firstResult.success) return firstResult.data;

  console.warn(
    `[${label}] first attempt failed validation, retrying once:\n` +
      formatZodErrors(firstResult.error),
  );

  const retryMessages: ChatMessage[] = [
    ...messages,
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: first.id,
          type: "function",
          function: { name: first.name, arguments: first.arguments },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: first.id,
      content: `Your previous ${toolName} call failed Zod validation:\n${formatZodErrors(
        firstResult.error,
      )}\n\nFix every issue above and call ${toolName} again. ${retryReminder}`,
    },
  ];

  const second = await callGrokWithRetry(retryMessages, tools, toolName);
  if (second.name !== toolName || second.arguments.length === 0) {
    throw new Error(
      `${label} retry: expected ${toolName} tool call; got finish_reason=${second.finishReason}`,
    );
  }
  return schema.parse(JSON.parse(second.arguments));
}

function contextLines(input: GenerateSyllabusInput): string[] {
  return [
    `Target role: ${input.targetRole}`,
    input.targetCompany ? `Target company: ${input.targetCompany}` : null,
    "",
    "Job description:",
    input.jobDescription,
    "",
    "Learner's current skills and background:",
    input.currentSkills,
  ].filter((line): line is string => line !== null);
}

async function generateSkeleton(
  input: GenerateSyllabusInput,
): Promise<SyllabusSkeleton> {
  const messages: ChatMessage[] = [
    { role: "system", content: SKELETON_SYSTEM_PROMPT },
    { role: "user", content: contextLines(input).join("\n") },
  ];
  return callAndParse(
    "generateSkeleton",
    messages,
    [tool("emit_skeleton", "Emit the syllabus structure.", SKELETON_INPUT_SCHEMA)],
    "emit_skeleton",
    skeletonSchema,
    "Remember: set roleNature first and make the cluster type mix match it (non_technical roles must NOT be flooded with engineering clusters); 4-7 clusters traceable to JD text, ordered foundations-first via cluster orderIndex; at least one 'soft' and one 'domain'; each cluster 2-5 sub-skills with both orderIndex and estimatedHours; and a suggestedArtefact with 3-6 acceptanceCriteria.",
  );
}

type SkeletonSubSkill = z.infer<typeof skeletonSubSkillSchema>;

async function generateSubSkillConcepts(
  input: GenerateSyllabusInput,
  cluster: SkeletonCluster,
  subSkill: SkeletonSubSkill,
): Promise<z.infer<typeof conceptSchema>[]> {
  const userMessage = [
    ...contextLines(input),
    "",
    `Cluster: ${cluster.name} (type: ${cluster.type})`,
    `Cluster description: ${cluster.description}`,
    "",
    `Sub-skill: ${subSkill.name}`,
    `Sub-skill description: ${subSkill.description}`,
    "",
    "Generate the concepts + resources for THIS sub-skill.",
  ].join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: DETAIL_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  const { concepts } = await callAndParse(
    `generateSubSkillConcepts(${cluster.name} / ${subSkill.name})`,
    messages,
    [tool("emit_concepts", "Emit concepts for this sub-skill.", DETAIL_INPUT_SCHEMA)],
    "emit_concepts",
    subSkillConceptsSchema,
    "Remember: 4-10 concepts traceable to JD-relevant work; each has orderIndex (fundamentals-first), tier ('foundation' | 'intermediate' | 'advanced', with the orderIndex 0 concept being 'foundation'), and 2-3 resources (exactly one priority=1) with a canonical URL on every resource.",
  );
  return concepts;
}

export async function generateSyllabus(
  input: GenerateSyllabusInput,
): Promise<GeneratedSyllabus> {
  // Stage 1: structure.
  const skeleton = await generateSkeleton(input);

  // Stage 2: concepts + resources, one small call PER SUB-SKILL, all in
  // parallel. Per-sub-skill keeps each call bounded (4-10 concepts) so it can
  // never overflow max_tokens the way a whole-cluster call could.
  const clusters = await Promise.all(
    skeleton.clusters.map(async (cluster) => {
      const subSkills = await Promise.all(
        cluster.subSkills.map(async (ss) => ({
          ...ss,
          concepts: await generateSubSkillConcepts(input, cluster, ss),
        })),
      );
      return { ...cluster, subSkills };
    }),
  );

  // Final validation against the full schema — the caller's contract.
  return syllabusSchema.parse({
    roleNature: skeleton.roleNature,
    structuralBlockers: skeleton.structuralBlockers,
    alternativeTargetBranches: skeleton.alternativeTargetBranches,
    clusters,
  });
}
