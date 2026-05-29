import { z } from "zod";
import { grok, DEFAULT_MODEL } from "./client";

export const conceptRelevanceContentSchema = z.object({
  point: z.string().min(1),
  explanation: z.string().min(1),
  evidence: z.string().min(1),
  effect: z.string().min(1),
  importance: z.enum(["core", "supporting", "peripheral"]),
});

export type ConceptRelevanceContent = z.infer<
  typeof conceptRelevanceContentSchema
>;

export type GenerateConceptRelevanceInput = {
  conceptName: string;
  conceptDescription: string;
  clusterName: string;
  targetRole: string;
  targetCompany: string | null;
  jobDescription: string;
};

export type GeneratedConceptRelevance = {
  content: ConceptRelevanceContent;
  model: string;
};

const SYSTEM_PROMPT = `You are a hiring-manager-grade career mentor. Your job is to explain — honestly and specifically — why a given concept matters for a given target role. You write tight, grounded relevance arguments using the PEEE structure: Point, Explanation, Evidence, Effect.

You will be given:
- A concept (name + description) and its parent skill cluster.
- The learner's target role (and optional target company).
- The actual job description text.

Produce a PEEE relevance argument by calling \`emit_relevance\`. Do not output any other text.

PEEE rules:

1. **point** — ONE specific, concrete sentence. State what the concept actually does for someone in this role, in plain working language. NOT "X is crucial for this role" or "X is foundational" — those are hype, not points. Good example: "Actors are how you keep a real-time BCI UI responsive without data races." Lead with mechanism or outcome, not adjectives.

2. **explanation** — 2-4 sentences of grounded reasoning about how this concept shows up day-to-day in the role. Concrete tasks, decisions, tradeoffs. Not motivational. Not generic education-speak.

3. **evidence** — Tie to the ACTUAL job description where possible. Quote or closely paraphrase the specific requirement this concept serves. If the JD does NOT explicitly mention or imply this concept's domain, say so plainly: "Not explicitly called out in the JD; this is established practice for [reason]." NEVER invent or stretch a JD requirement. Honest evidence beats fabricated hype.

4. **effect** — The concrete capability mastering this unlocks. What can the candidate DO in the role once they have it? Action-language: "ship", "debug", "design", "review", "decide". Not "understand" or "appreciate".

5. **importance** — Classify HONESTLY as one of:
   - **core**: directly required to perform the role's main responsibilities; absence would block hiring or be a clear weakness.
   - **supporting**: useful and expected at a senior level, but not the primary bar — strengthens the candidate without being a gate.
   - **peripheral**: foundational background, adjacent, or nice-to-have. Worth knowing but does not differentiate.

   CALIBRATION RULE: If you find yourself calling almost every concept 'core', you are inflating. A realistic syllabus has roughly: a handful of core concepts, more supporting ones, and several peripheral. Be willing to call a concept 'peripheral' when that is the truth — that is more useful to the learner than fake importance.

HARD CONSTRAINTS:
- BAN these words/phrases used as substance: "crucial", "essential", "vital", "game-changing", "world-class", "cutting-edge", "paramount", "indispensable". You may use them only if backed by a concrete specific reason in the same sentence. Default: don't use them.
- NEVER invent JD requirements. If a claim cannot be grounded in either the JD text or well-known industry practice for this role, do not make it.
- If the concept is genuinely marginal to the role, the PEEE must reflect that plainly. An honest "this is foundational background, not a differentiator" is more valuable than false importance.

Tone: a senior practitioner being level with a junior. Not a recruiter. Not a brochure.`;

const RELEVANCE_TOOL = {
  type: "function" as const,
  function: {
    name: "emit_relevance",
    description: "Emit the structured PEEE relevance argument.",
    parameters: {
      type: "object",
      required: ["point", "explanation", "evidence", "effect", "importance"],
      properties: {
        point: {
          type: "string",
          description:
            "One specific, concrete sentence stating what this concept does for the role. No hype words as substance.",
        },
        explanation: {
          type: "string",
          description:
            "2-4 sentences of grounded reasoning about how the concept shows up day-to-day in the role.",
        },
        evidence: {
          type: "string",
          description:
            "Tie to the actual JD where possible (quote/paraphrase). If the JD does not call it out, say so plainly and cite established industry practice. Never invent JD requirements.",
        },
        effect: {
          type: "string",
          description:
            "The concrete capability mastering this unlocks. Action-language verbs.",
        },
        importance: {
          type: "string",
          enum: ["core", "supporting", "peripheral"],
          description:
            "Honest classification of how central this concept is to the role. Most concepts in any syllabus are NOT core — calibrate.",
        },
      },
    },
  },
};

type ChatMessage = Parameters<
  typeof grok.chat.completions.create
>[0]["messages"][number];

function buildUserMessage(input: GenerateConceptRelevanceInput): string {
  const companyLine = input.targetCompany
    ? `Target company: ${input.targetCompany}`
    : "Target company: (not specified)";

  return [
    `Target role: ${input.targetRole}`,
    companyLine,
    "",
    `Skill cluster: ${input.clusterName}`,
    `Concept: ${input.conceptName}`,
    `Concept description: ${input.conceptDescription}`,
    "",
    "Job description (verbatim):",
    "<<<JD",
    input.jobDescription,
    "JD",
    "",
    "Produce a PEEE relevance argument for this concept. Honest importance classification. No hype words as substance. Do not invent JD requirements.",
  ].join("\n");
}

async function callRelevance(messages: ChatMessage[]): Promise<string> {
  const completion = await grok.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: 4000,
    messages,
    tools: [RELEVANCE_TOOL],
    tool_choice: { type: "function", function: { name: "emit_relevance" } },
  });

  const call = completion.choices[0]?.message?.tool_calls?.find(
    (tc) => tc.type === "function" && tc.function.name === "emit_relevance",
  );
  const args =
    call && call.type === "function" ? call.function.arguments : undefined;
  if (!args) {
    throw new Error(
      `generateConceptRelevance: model did not return an emit_relevance tool call (finish_reason=${completion.choices[0]?.finish_reason})`,
    );
  }
  return args;
}

function formatZodErrors(err: z.ZodError): string {
  return err.issues
    .map((i) => `- ${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("\n");
}

export async function generateConceptRelevance(
  input: GenerateConceptRelevanceInput,
): Promise<GeneratedConceptRelevance> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserMessage(input) },
  ];

  const firstArgs = await callRelevance(messages);
  let parsed = conceptRelevanceContentSchema.safeParse(JSON.parse(firstArgs));

  if (!parsed.success) {
    const retryMessages: ChatMessage[] = [
      ...messages,
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "retry",
            type: "function",
            function: { name: "emit_relevance", arguments: firstArgs },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "retry",
        content: `Your emit_relevance call failed validation:\n${formatZodErrors(
          parsed.error,
        )}\n\nFix every issue and call emit_relevance again.`,
      },
    ];
    const secondArgs = await callRelevance(retryMessages);
    parsed = conceptRelevanceContentSchema.safeParse(JSON.parse(secondArgs));
    if (!parsed.success) {
      throw new Error(
        `generateConceptRelevance: validation failed after retry:\n${formatZodErrors(parsed.error)}`,
      );
    }
  }

  return { content: parsed.data, model: DEFAULT_MODEL };
}
