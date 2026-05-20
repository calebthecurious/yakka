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

const SYSTEM_PROMPT = `You are a senior engineer and career strategist who has personally hired people into roles like the one being targeted. You've watched dozens of self-taught engineers either land these jobs or wash out in the loop. You know which knowledge gaps are fixable, which ones aren't, and which resources actually move the needle.

Your job is to produce a structured, brutally honest learning syllabus from a job description. Direct, no fluff. Name real resources. Flag real blockers.

Rules:

1. **Be honest about structural blockers.** \`structuralBlockers\` is an array of short, specific strings — one per blocker. Things like "Requires US work authorization; not addressable by self-study" or "Role demands 5+ years production ML experience; portfolio alone won't substitute at this company." Empty array if none exist. Do not invent blockers to seem rigorous, and do not paper over real ones.

2. **Propose alternative target branches when real blockers exist.** \`alternativeTargetBranches\` is an array of \`{role, rationale, tradeoffs}\` — 2-4 adjacent roles where the learner's actual profile is viable. \`tradeoffs\` is honest: what they give up by taking this branch vs. the original target (lower comp, different skill ceiling, longer detour, etc.). Empty array if no blockers.

3. **4-7 skill clusters total.** Weight each cluster 1-5 by importance to the actual job, not what's interesting to learn. \`orderIndex\` reflects a sensible learning sequence, foundations first.

4. **Every syllabus must include AT LEAST ONE cluster of type 'soft'.** Communication, collaboration, technical writing, presenting, interview-specific soft skills relevant to *this* role. Not generic "be a good teammate" — concrete things like "Writing engineering design docs that get approved" or "Pair-programming with a skeptical senior engineer."

5. **Every syllabus must include AT LEAST ONE cluster of type 'domain'.** Role-specific domain knowledge — the field-specific context a generalist engineer would lack. For a Neuralink role: neuroscience fundamentals, BCI signal processing, medical device regulatory context. For a Stripe role: payment networks, fraud, financial regulation. Generic "industry knowledge" is wrong.

6. **Classify each cluster's \`type\`:**
   - \`technical\` — engineering craft (languages, systems, tools)
   - \`domain\` — field-specific knowledge (per rule 5)
   - \`soft\` — interpersonal, communication, interview skills (per rule 4)
   - \`meta\` — learning-to-learn, productivity systems, research skills

7. **Each cluster has 2-5 sub-skills.** Estimate realistic hours for a self-taught learner starting from the candidate's actual current skills — not someone with a relevant degree. Real mastery of a sub-skill is usually 20-80 hours.

8. **Each sub-skill has 4-10 concepts.** Concepts are the atomic, checkable units of understanding — the things you either grasp or don't. \`name\` is concise and specific: "Swift Actors & Concurrency" not "Swift things". "Backpropagation through time" not "RNN stuff". "PID controller tuning" not "control theory". \`description\` is 1-2 sentences on what actually understanding this means — what you'd be able to do or explain. Order concepts by \`orderIndex\` reflecting how a learner should build them up.

9. **Each concept has 2-3 resources.** Exactly one is the primary recommendation with \`priority: 1\` — the single best resource for grasping this concept. The remaining 1-2 are alternatives with \`priority: 2\` or higher. Resources must be REAL and SPECIFIC: "3Blue1Brown's 'Essence of Linear Algebra' YouTube series" not "watch YouTube videos on linear algebra". "Sutton & Barto, *Reinforcement Learning: An Introduction* (2nd ed.), chapters 3-6" not "reinforcement learning textbook". Named courses, named books with author and edition, specific talks, specific YouTube channels and series. If you don't know a real resource for a concept, narrow the concept rather than inventing one.

10. **Every resource MUST include a \`url\` to the canonical landing page.** This is non-negotiable. Use the page where a learner would actually start — for a book, the publisher or author's page (e.g. \`http://incompleteideas.net/book/the-book-2nd.html\`); for a YouTube series, the playlist URL; for a course, the course's own page on Coursera/edX/MIT OCW/etc.; for a paper, its arXiv or DOI URL. Use \`https://\` where available. Do NOT use Google search URLs, Wikipedia, or generic homepages — those are the fallback the system uses when a real URL is missing, and you can do better. If you cannot confidently produce a canonical URL for a specific resource, pick a different resource you do know the URL for. Better to swap the resource than emit a bad guess.

11. **One concrete portfolio artefact per cluster.** Specific enough that a hiring manager for this exact role would recognize the relevance. "Replicate the closed-loop seizure detection benchmark from Cook et al. 2013 on CHB-MIT using PyTorch" beats "machine learning project". Pick the artefact type that fits: \`project\` (built thing), \`writeup\` (written analysis), \`certificate\` (verifiable credential), \`contribution\` (open-source PR or similar). For each artefact, also emit \`acceptanceCriteria\`: 3-6 concrete, checkable bullets that define "done." Each bullet is a single sentence stating what must be true. "Detector achieves AUC ≥ 0.85 on held-out test set" beats "model performs well." "Repo has a README with usage instructions and a 30-second demo gif" beats "documented." Avoid soft criteria like "code is clean."

12. **Resources and artefacts should ladder.** Foundations → applied work → demonstrable output.

13. **Tone for descriptions and rationales: direct.** No marketing language. No "you'll learn how to..." phrasing. State what the thing is.

Before you call \`emit_syllabus\`, verify against this checklist. If any item is "no," fix it before emitting:
- [ ] Exactly 4-7 clusters
- [ ] At least one cluster has type='soft'
- [ ] At least one cluster has type='domain'
- [ ] Every sub-skill has 4-10 concepts (not 3, not 11)
- [ ] Every concept has 2-3 resources
- [ ] Every concept has exactly one resource with priority=1
- [ ] Every resource is a real, named source (not "watch some videos on X")
- [ ] Every resource has a canonical URL (no Google search URLs, no Wikipedia, no generic homepages)

Output: call the \`emit_syllabus\` tool with the complete structured syllabus. Do not produce any other text.`;

const SYLLABUS_INPUT_SCHEMA = {
  type: "object" as const,
  required: ["structuralBlockers", "alternativeTargetBranches", "clusters"],
  properties: {
    structuralBlockers: {
      type: "array",
      description:
        "Short, specific strings naming each structural blocker. Empty array if none.",
      items: { type: "string" },
    },
    alternativeTargetBranches: {
      type: "array",
      description:
        "Adjacent roles viable for this learner's profile. Empty if no blockers.",
      items: {
        type: "object",
        required: ["role", "rationale", "tradeoffs"],
        properties: {
          role: { type: "string" },
          rationale: {
            type: "string",
            description: "Why this branch fits the learner's actual profile.",
          },
          tradeoffs: {
            type: "string",
            description:
              "What is given up by taking this branch vs the original target.",
          },
        },
      },
    },
    clusters: {
      type: "array",
      minItems: 4,
      maxItems: 7,
      description:
        "4-7 skill clusters. Must include at least one of type 'soft' and at least one of type 'domain'.",
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
            description:
              "technical (craft), domain (field knowledge), soft (interpersonal/interview), meta (learning-to-learn).",
          },
          weight: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            description: "Importance to the role, 1-5.",
          },
          orderIndex: {
            type: "integer",
            minimum: 0,
            description: "Sensible learning order, 0 first.",
          },
          subSkills: {
            type: "array",
            minItems: 2,
            maxItems: 5,
            items: {
              type: "object",
              required: ["name", "description", "estimatedHours", "concepts"],
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                estimatedHours: {
                  type: "integer",
                  minimum: 0,
                  description: "Realistic hours for a self-taught learner.",
                },
                concepts: {
                  type: "array",
                  minItems: 4,
                  maxItems: 10,
                  description:
                    "4-10 atomic, checkable units of understanding inside this sub-skill.",
                  items: {
                    type: "object",
                    required: [
                      "name",
                      "description",
                      "orderIndex",
                      "suggestedResources",
                    ],
                    properties: {
                      name: {
                        type: "string",
                        description:
                          "Concise and specific. 'Swift Actors & Concurrency' not 'Swift things'.",
                      },
                      description: {
                        type: "string",
                        description:
                          "1-2 sentences on what understanding this concept means.",
                      },
                      orderIndex: {
                        type: "integer",
                        minimum: 0,
                        description: "Order within the sub-skill, 0 first.",
                      },
                      suggestedResources: {
                        type: "array",
                        minItems: 2,
                        maxItems: 3,
                        description:
                          "2-3 real, named resources. Exactly one with priority 1.",
                        items: {
                          type: "object",
                          required: ["type", "title", "priority"],
                          properties: {
                            type: {
                              type: "string",
                              enum: [
                                "course",
                                "book",
                                "video",
                                "article",
                                "project",
                                "paper",
                              ],
                            },
                            title: {
                              type: "string",
                              description:
                                "Real, specific resource name including author/edition/series where applicable.",
                            },
                            url: {
                              type: "string",
                              description:
                                "Required. Canonical landing page for this resource (https URL where possible). For books, the publisher/author page; for YouTube series, the playlist URL; for courses, the course's own page on Coursera/edX/MIT OCW/etc; for papers, arXiv or DOI URL. No Google search URLs, no Wikipedia, no generic homepages. If you don't know a canonical URL, swap the resource for one you do know.",
                            },
                            author: { type: "string" },
                            priority: {
                              type: "integer",
                              minimum: 1,
                              description:
                                "1 = the single primary recommendation. 2+ = alternatives.",
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          suggestedArtefact: {
            type: "object",
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
                description:
                  "3-6 concrete, checkable 'done' bullets. Single sentences. Measurable where possible.",
                items: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

function buildUserMessage(input: GenerateSyllabusInput): string {
  return [
    `Target role: ${input.targetRole}`,
    input.targetCompany ? `Target company: ${input.targetCompany}` : null,
    "",
    "Job description:",
    input.jobDescription,
    "",
    "Learner's current skills and background:",
    input.currentSkills,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

type ChatMessage = Parameters<
  typeof grok.chat.completions.create
>[0]["messages"][number];

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "emit_syllabus",
      description:
        "Emit the structured personalised syllabus. Must be called exactly once.",
      parameters: SYLLABUS_INPUT_SCHEMA,
    },
  },
];

type ToolCallResult = {
  id: string;
  name: string;
  arguments: string;
  finishReason: string | null;
};

async function callGrok(messages: ChatMessage[]): Promise<ToolCallResult> {
  const stream = await grok.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: 16000,
    messages,
    tools: TOOLS,
    tool_choice: {
      type: "function",
      function: { name: "emit_syllabus" },
    },
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

function formatZodErrors(err: z.ZodError): string {
  return err.issues
    .map((i) => {
      const path = i.path.length > 0 ? i.path.join(".") : "(root)";
      return `- ${path}: ${i.message}`;
    })
    .join("\n");
}

export async function generateSyllabus(
  input: GenerateSyllabusInput,
): Promise<GeneratedSyllabus> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserMessage(input) },
  ];

  const firstCall = await callGrok(messages);

  if (firstCall.name !== "emit_syllabus" || firstCall.arguments.length === 0) {
    throw new Error(
      `Expected emit_syllabus tool call; got finish_reason=${firstCall.finishReason}, name=${firstCall.name || "(none)"}`,
    );
  }

  const firstParsed: unknown = JSON.parse(firstCall.arguments);
  const firstResult = syllabusSchema.safeParse(firstParsed);
  if (firstResult.success) return firstResult.data;

  console.warn(
    "[generateSyllabus] first attempt failed validation, retrying once:\n" +
      formatZodErrors(firstResult.error),
  );

  const retryMessages: ChatMessage[] = [
    ...messages,
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: firstCall.id,
          type: "function",
          function: {
            name: firstCall.name,
            arguments: firstCall.arguments,
          },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: firstCall.id,
      content: `Your previous emit_syllabus call failed Zod validation:\n${formatZodErrors(
        firstResult.error,
      )}\n\nFix every issue above and call emit_syllabus again with a corrected, complete syllabus. Pay particular attention to: (a) at least one cluster of type 'soft', (b) at least one cluster of type 'domain', (c) each concept must have 4-10 entries, (d) each concept must have 2-3 resources with exactly one priority=1 primary.`,
    },
  ];

  const retryCall = await callGrok(retryMessages);
  if (retryCall.name !== "emit_syllabus" || retryCall.arguments.length === 0) {
    throw new Error(
      `Retry: expected emit_syllabus tool call; got finish_reason=${retryCall.finishReason}, name=${retryCall.name || "(none)"}`,
    );
  }
  const retryParsed: unknown = JSON.parse(retryCall.arguments);
  return syllabusSchema.parse(retryParsed);
}
