import { z } from "zod";
import { grok, DEFAULT_MODEL } from "./client";

export const gapStrengthSchema = z.object({
  requirement: z.string().min(1),
  evidence: z.string().min(1),
});

export const gapInProgressSchema = z.object({
  requirement: z.string().min(1),
  conceptId: z.string().min(1).nullable(),
  note: z.string().min(1),
});

export const gapNotStartedSchema = z.object({
  requirement: z.string().min(1),
  conceptId: z.string().min(1).nullable(),
  isSyllabusBlindSpot: z.boolean(),
  note: z.string().min(1),
});

export const softSkillGapSchema = z.object({
  skill: z.string().min(1),
  why: z.string().min(1),
  conceptId: z.string().min(1).nullable(),
});

export const signalRecommendationSchema = z.object({
  action: z.string().min(1),
  rationale: z.string().min(1),
  effort: z.enum(["low", "medium", "high"]),
});

export const gapReportSchema = z.object({
  strengths: z.array(gapStrengthSchema),
  gapsInProgress: z.array(gapInProgressSchema),
  gapsNotStarted: z.array(gapNotStartedSchema),
  softSkillGaps: z.array(softSkillGapSchema),
  signalRecommendations: z.array(signalRecommendationSchema).min(3).max(6),
});

export type GeneratedGapReport = z.infer<typeof gapReportSchema>;

export type GapReportConceptNode = {
  id: string;
  name: string;
  /** concept status: not_started | learning | understood | verified */
  status: string;
};

export type GapReportSubSkillNode = {
  name: string;
  /** sub-skill status: not_started | in_progress | verified */
  status: string;
  concepts: GapReportConceptNode[];
};

export type GapReportClusterNode = {
  name: string;
  /** cluster type: technical | domain | soft | meta */
  type: string;
  description: string;
  subSkills: GapReportSubSkillNode[];
};

export type GenerateGapReportInput = {
  resumeText: string;
  targetRole: string;
  targetCompany?: string | null;
  jobDescription: string;
  syllabusTree: GapReportClusterNode[];
};

const SYSTEM_PROMPT = `You are a brutally honest career coach performing a gap analysis between ONE person's resume and ONE specific target role. You produce a structured, categorical report by calling the \`emit_gap_report\` tool exactly once. Do not produce any other text.

You are given four things:
1. The target role (and possibly company).
2. The full job description (JD).
3. The person's resume, as RAW TEXT — it is an unstructured blob (sometimes mixed with their own freeform notes). You must parse it yourself: infer their skills, experience, seniority, and domains from it. Do not expect clean fields.
4. The learning syllabus they are following toward this role — a tree of clusters → sub-skills → concepts, each concept carrying an id and a status. Statuses tell you what they've actually progressed on.

YOUR JOB:

Step 1 — Extract requirements. Read the JD and pull out the concrete requirements of the role: hard skills, technologies, domain knowledge, responsibilities, qualifications, experience levels. Be specific ("design RESTful APIs under load", not "backend"). Merge near-duplicates. Don't pad the list with generic filler.

Step 2 — Classify EVERY requirement into exactly one of three buckets, by cross-referencing the resume evidence AND the syllabus concept coverage + status:

- strengths: the resume already genuinely evidences this requirement. \`evidence\` quotes or paraphrases the specific resume signal that proves it (a role, a project, a shipped thing) — not a vague assertion. If the resume only weakly implies it, it is NOT a strength.

- gapsInProgress: the resume does NOT yet evidence this, BUT the syllabus has a concept covering it AND that concept (or its sub-skill) shows progress (concept status learning/understood/verified, or sub-skill in_progress/verified). Set \`conceptId\` to the exact id of the most relevant covering concept. \`note\` says what's covered and what remains to close it.

- gapsNotStarted: the resume does NOT evidence this AND it is not in progress. Two sub-cases:
  - A concept DOES cover it but its status is not_started: set \`conceptId\` to that concept's exact id and \`isSyllabusBlindSpot\` = false.
  - NO concept anywhere in the syllabus covers it: set \`conceptId\` = null and \`isSyllabusBlindSpot\` = true. THIS IS THE MOST VALUABLE OUTPUT — it surfaces what the learning plan itself is missing. Hunt for these deliberately; do not assume the syllabus is complete.

CRITICAL on conceptId: only ever use an id that appears verbatim in the syllabus tree below, or null. Never invent an id. If unsure which concept covers a requirement, use null rather than guessing.

Step 3 — softSkillGaps: soft/professional skills the role clearly needs that the resume does not evidence. Be concrete and role-specific, never generic. Write "land a technical spec that survives senior review", not "communication". "Drive cross-team alignment when priorities conflict", not "teamwork". If a syllabus concept relates, set its conceptId; otherwise null.

Step 4 — signalRecommendations: 3 to 6 extra-curricular, credibility-building actions specific to THIS role and THIS person's current standing — things beyond the syllabus that build external signal. Name real, relevant targets where you can (specific open-source projects/tools the role uses, particular communities, the kind of talk or writeup that would land). Rate \`effort\` honestly as low/medium/high — do not call a conference talk "low effort".

HARD RULES:
- Do NOT produce any match percentage, score, or readiness rating. Categorical output only.
- Be honest and direct. If there is a structural blocker — a hard degree requirement they don't meet, a citizenship/security-clearance/geography constraint, a years-of-experience floor they're far from — say it plainly in the \`note\` of the relevant gap. Don't soften it and don't bury it.
- Ground everything in the actual inputs. Don't invent resume content or JD requirements that aren't there.`;

const GAP_REPORT_INPUT_SCHEMA = {
  type: "object" as const,
  required: [
    "strengths",
    "gapsInProgress",
    "gapsNotStarted",
    "softSkillGaps",
    "signalRecommendations",
  ],
  properties: {
    strengths: {
      type: "array",
      description:
        "Requirements the resume already genuinely evidences. Empty array if none.",
      items: {
        type: "object",
        required: ["requirement", "evidence"],
        properties: {
          requirement: {
            type: "string",
            description: "The specific role requirement, in your own words.",
          },
          evidence: {
            type: "string",
            description:
              "The specific resume signal that proves it — a role, project, or shipped thing. Not a vague claim.",
          },
        },
      },
    },
    gapsInProgress: {
      type: "array",
      description:
        "Requirements not yet evidenced by the resume but covered by a syllabus concept the person has progressed on.",
      items: {
        type: "object",
        required: ["requirement", "conceptId", "note"],
        properties: {
          requirement: { type: "string" },
          conceptId: {
            type: ["string", "null"],
            description:
              "Exact id of the most relevant covering concept from the syllabus tree, or null. Never invented.",
          },
          note: {
            type: "string",
            description: "What's covered and what remains to close the gap.",
          },
        },
      },
    },
    gapsNotStarted: {
      type: "array",
      description:
        "Requirements not evidenced and not in progress. Set isSyllabusBlindSpot=true when NO concept covers the requirement.",
      items: {
        type: "object",
        required: ["requirement", "conceptId", "isSyllabusBlindSpot", "note"],
        properties: {
          requirement: { type: "string" },
          conceptId: {
            type: ["string", "null"],
            description:
              "Exact id of a covering not_started concept, or null when nothing in the syllabus covers it.",
          },
          isSyllabusBlindSpot: {
            type: "boolean",
            description:
              "true when NO concept anywhere in the syllabus covers this requirement — the plan's own blind spot.",
          },
          note: {
            type: "string",
            description:
              "What the gap is. State any structural blocker (degree, geography, YOE floor) plainly here.",
          },
        },
      },
    },
    softSkillGaps: {
      type: "array",
      description:
        "Role-specific soft skills the resume doesn't evidence. Concrete, never generic.",
      items: {
        type: "object",
        required: ["skill", "why", "conceptId"],
        properties: {
          skill: {
            type: "string",
            description:
              "Concrete, role-specific soft skill ('land a spec that survives senior review', not 'communication').",
          },
          why: {
            type: "string",
            description: "Why this role needs it and why the resume doesn't show it.",
          },
          conceptId: {
            type: ["string", "null"],
            description: "Related syllabus concept id, or null.",
          },
        },
      },
    },
    signalRecommendations: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      description:
        "3-6 credibility-building actions specific to this role and person, beyond the syllabus.",
      items: {
        type: "object",
        required: ["action", "rationale", "effort"],
        properties: {
          action: {
            type: "string",
            description:
              "A specific action — name real projects/communities/venues where possible.",
          },
          rationale: {
            type: "string",
            description: "Why it builds the right signal for this role.",
          },
          effort: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Honest effort rating.",
          },
        },
      },
    },
  },
};

const TOOL_NAME = "emit_gap_report";

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
        "Emit the structured, categorical gap analysis report. Must be called exactly once.",
      parameters: GAP_REPORT_INPUT_SCHEMA,
    },
  },
];

function renderSyllabusTree(tree: GapReportClusterNode[]): string {
  if (tree.length === 0) return "(the syllabus has no clusters)";
  return tree
    .map((cluster) => {
      const subs = cluster.subSkills
        .map((sub) => {
          const concepts = sub.concepts
            .map((c) => `      - concept id=${c.id} [${c.status}] ${c.name}`)
            .join("\n");
          return [
            `    • sub-skill [${sub.status}] ${sub.name}`,
            concepts || "      (no concepts)",
          ].join("\n");
        })
        .join("\n");
      return [
        `- cluster (${cluster.type}) ${cluster.name}: ${cluster.description}`,
        subs || "    (no sub-skills)",
      ].join("\n");
    })
    .join("\n");
}

function buildUserMessage(input: GenerateGapReportInput): string {
  return [
    "TARGET ROLE",
    `- Role: ${input.targetRole}`,
    `- Company: ${input.targetCompany?.trim() || "(not specified)"}`,
    "",
    "JOB DESCRIPTION",
    input.jobDescription.trim(),
    "",
    "RESUME (raw text — parse skills, experience, seniority, and domains yourself)",
    input.resumeText.trim() || "(empty — treat every requirement as unevidenced)",
    "",
    "SYLLABUS TREE (use these exact concept ids when referencing a covering concept; statuses show progress)",
    renderSyllabusTree(input.syllabusTree),
    "",
    "Produce the gap analysis by calling emit_gap_report. Classify every JD requirement, and deliberately surface requirements no concept covers as gapsNotStarted with isSyllabusBlindSpot=true.",
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
    max_tokens: 8000,
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
    .map((i) => {
      const path = i.path.length > 0 ? i.path.join(".") : "(root)";
      return `- ${path}: ${i.message}`;
    })
    .join("\n");
}

export async function generateGapReport(
  input: GenerateGapReportInput,
): Promise<GeneratedGapReport> {
  const messages: ChatMessage[] = [
    { role: "user", content: buildUserMessage(input) },
  ];

  const firstCall = await callGrok(messages);
  if (firstCall.arguments === null) {
    throw new Error(
      `Expected ${TOOL_NAME} tool call; got finish_reason=${firstCall.finishReason}`,
    );
  }

  const firstResult = gapReportSchema.safeParse(JSON.parse(firstCall.arguments));
  if (firstResult.success) return firstResult.data;

  console.warn(
    "[generateGapReport] first attempt failed validation, retrying once:\n" +
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
          function: { name: TOOL_NAME, arguments: firstCall.arguments },
        },
      ],
    },
    {
      role: "tool",
      tool_call_id: firstCall.id,
      content: `Your previous ${TOOL_NAME} call failed validation:\n${formatZodErrors(
        firstResult.error,
      )}\n\nFix every issue above and call ${TOOL_NAME} again. Remember: signalRecommendations must have 3-6 entries, every conceptId must be either an exact id from the syllabus tree or null, and effort must be low/medium/high.`,
    },
  ];

  const retryCall = await callGrok(retryMessages);
  if (retryCall.arguments === null) {
    throw new Error(
      `Retry: expected ${TOOL_NAME} tool call; got finish_reason=${retryCall.finishReason}`,
    );
  }

  return gapReportSchema.parse(JSON.parse(retryCall.arguments));
}
