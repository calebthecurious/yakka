import { z } from "zod";
import { grok, DEFAULT_MODEL } from "./client";

/**
 * Foundations & launching point generator.
 *
 * Produces two distinct things, NOT to be confused with concept tier:
 *  - assumedBaselines: what the syllabus's first concepts ASSUME you already
 *    know (true prerequisites — knowledge to GET to the starting line). 3-7.
 *  - launchSteps: the ordered, genuine FIRST steps INTO the syllabus, linking
 *    to existing foundation-tier concepts by exact id where they fit.
 *
 * Personalised by résumé when available, but it NEVER auto-marks a baseline as
 * met — it only records a `resumeSignal` hint for the user to confirm.
 */

const RESOURCE_TYPES = [
  "course",
  "book",
  "video",
  "article",
  "project",
  "paper",
] as const;

export const foundationResourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1).nullable(),
  type: z.enum(RESOURCE_TYPES),
});

export const assumedBaselineSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  suggestedResources: z.array(foundationResourceSchema),
  // Why the résumé suggests they may already meet this. null = no résumé /
  // no signal. Advisory only — does NOT set userStatus.
  resumeSignal: z.string().min(1).nullable(),
});

export const launchStepSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  // Exact id of a foundation concept from the tree, or null. Never invented.
  linkedConceptId: z.string().min(1).nullable(),
  suggestedResources: z.array(foundationResourceSchema),
});

export const foundationsSchema = z.object({
  assumedBaselines: z.array(assumedBaselineSchema).min(3).max(7),
  launchSteps: z.array(launchStepSchema).min(3).max(8),
});

export type GeneratedFoundations = z.infer<typeof foundationsSchema>;

export type FoundationConceptNode = {
  id: string;
  name: string;
  /** concept tier: foundation | intermediate | advanced */
  tier: string;
};

export type FoundationSubSkillNode = {
  name: string;
  concepts: FoundationConceptNode[];
};

export type FoundationClusterNode = {
  name: string;
  /** cluster type: technical | domain | soft | meta */
  type: string;
  subSkills: FoundationSubSkillNode[];
};

export type GenerateFoundationsInput = {
  targetRole: string;
  targetCompany?: string | null;
  jobDescription: string;
  roleNature: "technical" | "non_technical" | "hybrid";
  userResumeText?: string;
  syllabusTree: FoundationClusterNode[];
};

export type GeneratedFoundationsResult = {
  foundations: GeneratedFoundations;
  model: string;
};

const SYSTEM_PROMPT = `You design the ON-RAMP to a personalised learning syllabus. Your output is the very first thing a learner sees, and it must REDUCE overwhelm and answer "where do I start?" with total clarity. You call \`emit_foundations\` exactly once and output nothing else.

You are given the target role, the job description, the learner's role-nature classification, optionally their résumé (raw text), and the syllabus as a tree of clusters → sub-skills → concepts, each concept tagged with a tier (foundation/intermediate/advanced) and an id.

Produce TWO things:

1. assumedBaselines (3-7 items) — the competencies the syllabus ASSUMES the learner ALREADY HAS before concept 1 makes sense. These are PREREQUISITES TO BEGIN — they are NOT taught by any concept in the syllabus. Be specific and honest about what someone must already be comfortable with. For a technical role that might be: general programming fluency in some language, comfort on the command line, basic linear algebra. For a non-technical role it might be: comfort writing clearly for a professional audience, basic spreadsheet literacy. Each item gets a short description of what "having it" actually means, and 0-3 suggestedResources that would get someone TO the starting line if they lack it.

2. launchSteps (3-8 items, ORDERED) — the genuine first things to DO, in sequence, to get moving inside this syllabus. Draw on existing foundation-tier concepts: when a launch step corresponds to a real foundation concept in the tree, set linkedConceptId to that concept's EXACT id from the tree. When a step is an action that has no matching concept (e.g. "set up your dev environment", "skim the whole syllabus to see the shape of the journey"), set linkedConceptId to null and, if useful, add a suggestedResource.
   - THE FIRST launch step MUST be a single, concrete, unambiguous action the learner can take in the next 30 minutes. No "familiarise yourself with the field" vagueness. Something like "Do X" where X is unmistakable. Make step 1 feel small and doable.

PERSONALISATION (only if a résumé is provided):
- Calibrate the baselines to THIS person. Do not tell an experienced engineer to learn what a variable is. Raise the floor to match demonstrated experience.
- For each baseline the résumé suggests they likely already meet, set resumeSignal to a short, specific note citing the evidence (e.g. "Your résumé shows 4 years of Python at Acme — you almost certainly clear this"). Otherwise set resumeSignal to null.
- CRITICAL: never assume on their behalf. resumeSignal is a HINT; the learner still confirms via their own self-assessment. Do not phrase it as settled fact.
- If no résumé is provided, set every resumeSignal to null.

CRITICAL on linkedConceptId: only ever use an id that appears verbatim in the tree, or null. Never invent an id.

HONESTY:
- Do NOT pad. If the résumé indicates the learner already clears most baselines, keep the baseline list lean and make the resumeSignal notes say so plainly — the point is to send them confidently to step 1, not to invent busywork.
- Better a short, honest on-ramp than a bloated one. Encouraging and clear, never condescending.
- You are guiding, not gating. Nothing here blocks later learning.`;

const FOUNDATIONS_INPUT_SCHEMA = {
  type: "object" as const,
  required: ["assumedBaselines", "launchSteps"],
  properties: {
    assumedBaselines: {
      type: "array",
      minItems: 3,
      maxItems: 7,
      description:
        "3-7 prerequisites the syllabus assumes the learner already has BEFORE concept 1. Not taught by any concept.",
      items: {
        type: "object",
        required: ["title", "description", "suggestedResources", "resumeSignal"],
        properties: {
          title: {
            type: "string",
            description: "The assumed competency, short and specific.",
          },
          description: {
            type: "string",
            description: "What 'having it' concretely means for this syllabus.",
          },
          suggestedResources: {
            type: "array",
            description:
              "0-3 resources to reach the starting line if the learner lacks this. May be empty.",
            items: {
              type: "object",
              required: ["title", "url", "type"],
              properties: {
                title: { type: "string" },
                url: {
                  type: ["string", "null"],
                  description: "A real URL if you have one, else null.",
                },
                type: {
                  type: "string",
                  enum: [...RESOURCE_TYPES],
                },
              },
            },
          },
          resumeSignal: {
            type: ["string", "null"],
            description:
              "Short note citing résumé evidence that they likely already meet this, or null. A hint, never settled fact. null if no résumé.",
          },
        },
      },
    },
    launchSteps: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      description:
        "Ordered first steps INTO the syllabus. Step 1 must be concrete and unambiguous.",
      items: {
        type: "object",
        required: ["title", "description", "linkedConceptId", "suggestedResources"],
        properties: {
          title: {
            type: "string",
            description: "The step as a clear action.",
          },
          description: {
            type: "string",
            description: "What to do and why it's the right next move.",
          },
          linkedConceptId: {
            type: ["string", "null"],
            description:
              "Exact id of a matching foundation concept from the tree, or null. Never invented.",
          },
          suggestedResources: {
            type: "array",
            description: "Optional resources for steps with no linked concept.",
            items: {
              type: "object",
              required: ["title", "url", "type"],
              properties: {
                title: { type: "string" },
                url: { type: ["string", "null"] },
                type: { type: "string", enum: [...RESOURCE_TYPES] },
              },
            },
          },
        },
      },
    },
  },
};

const TOOL_NAME = "emit_foundations";

type ChatMessage = Parameters<
  typeof grok.chat.completions.create
>[0]["messages"][number];
type ChatTool = NonNullable<
  Parameters<typeof grok.chat.completions.create>[0]["tools"]
>[number];

const TOOLS: ChatTool[] = [
  {
    type: "function",
    function: {
      name: TOOL_NAME,
      description:
        "Emit the syllabus on-ramp: assumed baselines + ordered launch steps. Call exactly once.",
      parameters: FOUNDATIONS_INPUT_SCHEMA,
    },
  },
];

function renderTree(tree: FoundationClusterNode[]): string {
  if (tree.length === 0) return "(the syllabus has no clusters)";
  return tree
    .map((cluster) => {
      const subs = cluster.subSkills
        .map((sub) => {
          const concepts = sub.concepts
            .map(
              (c) =>
                `      - concept id=${c.id} [${c.tier}] ${c.name}`,
            )
            .join("\n");
          return [`    • sub-skill ${sub.name}`, concepts || "      (no concepts)"].join(
            "\n",
          );
        })
        .join("\n");
      return [`- cluster (${cluster.type}) ${cluster.name}`, subs || "    (no sub-skills)"].join(
        "\n",
      );
    })
    .join("\n");
}

function buildUserMessage(input: GenerateFoundationsInput): string {
  const resume = input.userResumeText?.trim();
  return [
    "TARGET ROLE",
    `- Role: ${input.targetRole}`,
    `- Company: ${input.targetCompany?.trim() || "(not specified)"}`,
    `- Role nature: ${input.roleNature}`,
    "",
    "JOB DESCRIPTION",
    input.jobDescription.trim() || "(none provided)",
    "",
    "LEARNER RÉSUMÉ (raw text — calibrate baselines to this; set resumeSignal where evidence supports it)",
    resume && resume.length > 0
      ? resume
      : "(no résumé on file — set every resumeSignal to null and assume a general starting point)",
    "",
    "SYLLABUS TREE (use these exact concept ids when linking a launch step; tiers shown in brackets)",
    renderTree(input.syllabusTree),
    "",
    `Produce the on-ramp by calling ${TOOL_NAME}. Remember: assumedBaselines are PREREQUISITES (not taught here); launchSteps are the ordered first steps INTO the syllabus, with step 1 concrete and unambiguous. Be honest, don't pad.`,
  ].join("\n");
}

type ToolCallResult = {
  id: string;
  arguments: string | null;
  finishReason: string | null;
};

async function callGrok(messages: ChatMessage[]): Promise<ToolCallResult> {
  const response = await grok.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: 6000,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    tools: TOOLS,
    tool_choice: { type: "function", function: { name: TOOL_NAME } },
  });

  const choice = response.choices[0];
  const toolCall = choice?.message?.tool_calls?.find(
    (tc) => tc.type === "function" && tc.function.name === TOOL_NAME,
  );

  return {
    id: toolCall?.id ?? "",
    arguments:
      toolCall && toolCall.type === "function"
        ? toolCall.function.arguments
        : null,
    finishReason: choice?.finish_reason ?? null,
  };
}

function formatZodErrors(err: z.ZodError): string {
  return err.issues
    .map((i) => `- ${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("\n");
}

export async function generateFoundations(
  input: GenerateFoundationsInput,
): Promise<GeneratedFoundationsResult> {
  const messages: ChatMessage[] = [
    { role: "user", content: buildUserMessage(input) },
  ];

  const firstCall = await callGrok(messages);
  if (firstCall.arguments === null) {
    throw new Error(
      `Expected ${TOOL_NAME} tool call; got finish_reason=${firstCall.finishReason}`,
    );
  }

  const firstResult = foundationsSchema.safeParse(JSON.parse(firstCall.arguments));
  if (firstResult.success) {
    return { foundations: firstResult.data, model: DEFAULT_MODEL };
  }

  const retryMessages: ChatMessage[] = [
    ...messages,
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: firstCall.id || "retry",
          type: "function",
          function: { name: TOOL_NAME, arguments: firstCall.arguments },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: firstCall.id || "retry",
      content: `Your ${TOOL_NAME} call failed validation:\n${formatZodErrors(
        firstResult.error,
      )}\n\nFix every issue above and call ${TOOL_NAME} again. Remember: assumedBaselines 3-7, launchSteps 3-8 ordered, every linkedConceptId must be an exact concept id from the tree or null.`,
    },
  ];

  const retryCall = await callGrok(retryMessages);
  if (retryCall.arguments === null) {
    throw new Error(
      `Retry: expected ${TOOL_NAME} tool call; got finish_reason=${retryCall.finishReason}`,
    );
  }

  return {
    foundations: foundationsSchema.parse(JSON.parse(retryCall.arguments)),
    model: DEFAULT_MODEL,
  };
}
