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

Produce the STRUCTURE of a learning syllabus from a job description by calling \`emit_skeleton\`. You are NOT writing concepts or resources yet — only blockers, alternative branches, and the cluster / sub-skill scaffold. Do not produce any other text.

Rules:

1. **Structural blockers.** \`structuralBlockers\`: short, specific strings, one per blocker (e.g. "Requires US work authorization; not addressable by self-study"). Empty array if none. Don't invent blockers; don't paper over real ones.

2. **Alternative branches.** \`alternativeTargetBranches\`: 2-4 \`{role, rationale, tradeoffs}\` for adjacent roles viable for this learner's actual profile, with honest tradeoffs. Empty array if no real blockers.

3. **4-7 clusters.** Weight each 1-5 by importance to the actual job. \`orderIndex\` reflects a sensible learning order, foundations first.

4. **At least one cluster of type 'soft'** — concrete communication/collaboration/interview skills for THIS role (e.g. "Writing engineering design docs that get approved"), not generic "be a good teammate".

5. **At least one cluster of type 'domain'** — role-specific field knowledge a generalist would lack (e.g. for Neuralink: neuroscience fundamentals, BCI signal processing). Not generic "industry knowledge".

6. **Classify each cluster's \`type\`:** technical (craft), domain (field knowledge), soft (interpersonal/interview), meta (learning-to-learn).

7. **Each cluster has 2-5 sub-skills.** For each: a specific \`name\`, a 1-2 sentence \`description\` of what mastering it means, and realistic \`estimatedHours\` for a self-taught learner starting from the candidate's actual current skills (usually 20-80 hours per sub-skill). Do NOT include concepts — those come later.

8. **One concrete portfolio artefact per cluster**, specific enough that a hiring manager for this exact role would recognize the relevance. Pick the type that fits: project, writeup, certificate, contribution. Include \`acceptanceCriteria\`: 3-6 concrete, checkable, single-sentence "done" bullets, measurable where possible ("Detector achieves AUC ≥ 0.85 on held-out test set"), not soft ones like "code is clean".

Checklist before emitting — fix any "no":
- [ ] 4-7 clusters
- [ ] At least one cluster type='soft'
- [ ] At least one cluster type='domain'
- [ ] Every cluster has 2-5 sub-skills, each with estimatedHours
- [ ] Every cluster has a suggestedArtefact with 3-6 acceptanceCriteria`;

const DETAIL_SYSTEM_PROMPT = `${PERSONA}

You are filling in ONE cluster of an already-designed syllabus. You will be given the target role/JD/current-skills for context, the cluster (name, type, description), and its sub-skills (name + description). For EACH sub-skill, produce its concepts by calling \`emit_concepts\`. Return one entry per sub-skill, in the SAME ORDER you were given, echoing each sub-skill's \`name\`. Do not produce any other text.

Rules:

1. **Each sub-skill has 4-10 concepts.** Concepts are atomic, checkable units of understanding — things you either grasp or don't. \`name\` is concise and specific ("Backpropagation through time", not "RNN stuff"). \`description\` is 1-2 sentences on what actually understanding it means. Order by \`orderIndex\` (0 first) reflecting how a learner builds them up.

2. **Each concept has 2-3 resources.** Exactly one is the primary recommendation with \`priority: 1\`; the other 1-2 are alternatives with \`priority: 2+\`. Resources must be REAL and SPECIFIC: named books with author/edition, named courses, specific talks, specific YouTube series — not "watch some videos on X". If you don't know a real resource, narrow the concept rather than inventing one.

3. **Every resource MUST include a canonical \`url\`** — the page a learner would actually start from (publisher/author page for a book, playlist URL for a YouTube series, the course's own page, arXiv/DOI for a paper). Use https where available. NO Google search URLs, NO Wikipedia, NO generic homepages. If you can't confidently produce a canonical URL, swap to a resource you do know.

Checklist before emitting — fix any "no":
- [ ] One entry per sub-skill given, names echoed, same order
- [ ] Every sub-skill has 4-10 concepts
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
  required: ["structuralBlockers", "alternativeTargetBranches", "clusters"],
  properties: {
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
        "4-7 clusters. At least one type 'soft' and at least one type 'domain'. No concepts here.",
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
            items: {
              type: "object",
              required: ["name", "description", "estimatedHours"],
              properties: {
                name: { type: "string" },
                description: { type: "string" },
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
  required: ["name", "description", "orderIndex", "suggestedResources"],
  properties: {
    name: {
      type: "string",
      description: "Concise and specific.",
    },
    description: {
      type: "string",
      description: "1-2 sentences on what understanding this concept means.",
    },
    orderIndex: { type: "integer", minimum: 0 },
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
  required: ["subSkills"],
  properties: {
    subSkills: {
      type: "array",
      description:
        "One entry per sub-skill you were given, in the same order, echoing each name.",
      items: {
        type: "object",
        required: ["name", "concepts"],
        properties: {
          name: {
            type: "string",
            description: "Echo the sub-skill name you were given.",
          },
          concepts: {
            type: "array",
            minItems: 4,
            maxItems: 10,
            items: CONCEPT_ITEM_SCHEMA,
          },
        },
      },
    },
  },
};

// Internal stage schemas. The skeleton has clusters with sub-skills but no
// concepts; the detail returns concepts grouped by sub-skill.
const skeletonSubSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
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

const detailSubSkillSchema = z.object({
  name: z.string().min(1),
  concepts: z.array(conceptSchema).min(4).max(10),
});
type ClusterDetail = { subSkills: z.infer<typeof detailSubSkillSchema>[] };

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
    "Remember: 4-7 clusters, at least one 'soft' and one 'domain', each cluster 2-5 sub-skills with estimatedHours, and a suggestedArtefact with 3-6 acceptanceCriteria.",
  );
}

async function generateClusterDetail(
  input: GenerateSyllabusInput,
  cluster: SkeletonCluster,
): Promise<ClusterDetail> {
  const expected = cluster.subSkills.length;
  // Enforce exactly one entry per sub-skill so the assembly never leaves a
  // sub-skill with empty concepts; a wrong count triggers the retry.
  const schema = z.object({
    subSkills: z.array(detailSubSkillSchema).length(expected),
  });

  const subSkillList = cluster.subSkills
    .map((s, i) => `${i + 1}. ${s.name} — ${s.description}`)
    .join("\n");

  const userMessage = [
    ...contextLines(input),
    "",
    `Cluster: ${cluster.name} (type: ${cluster.type})`,
    `Cluster description: ${cluster.description}`,
    "",
    "Generate concepts + resources for each of these sub-skills, in this order:",
    subSkillList,
  ].join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: DETAIL_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  return callAndParse(
    `generateClusterDetail(${cluster.name})`,
    messages,
    [tool("emit_concepts", "Emit concepts for each sub-skill.", DETAIL_INPUT_SCHEMA)],
    "emit_concepts",
    schema,
    `Remember: return EXACTLY ${expected} sub-skill entries — one per sub-skill in the given order, name echoed — each with 4-10 concepts, and 2-3 resources per concept with exactly one priority=1 and a canonical URL on every resource.`,
  );
}

export async function generateSyllabus(
  input: GenerateSyllabusInput,
): Promise<GeneratedSyllabus> {
  // Stage 1: structure.
  const skeleton = await generateSkeleton(input);

  // Stage 2: concepts + resources, one small call per cluster, in parallel.
  const details = await Promise.all(
    skeleton.clusters.map((cluster) => generateClusterDetail(input, cluster)),
  );

  // Assemble: merge each cluster's detail back onto its sub-skills (by order,
  // falling back to name match).
  const clusters = skeleton.clusters.map((cluster, ci) => {
    const detail = details[ci];
    const subSkills = cluster.subSkills.map((ss, si) => {
      const match =
        detail.subSkills[si]?.name === ss.name
          ? detail.subSkills[si]
          : detail.subSkills.find((d) => d.name === ss.name) ??
            detail.subSkills[si];
      return { ...ss, concepts: match?.concepts ?? [] };
    });
    return { ...cluster, subSkills };
  });

  // Final validation against the full schema — the caller's contract.
  return syllabusSchema.parse({
    structuralBlockers: skeleton.structuralBlockers,
    alternativeTargetBranches: skeleton.alternativeTargetBranches,
    clusters,
  });
}
