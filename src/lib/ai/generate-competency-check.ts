import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { anthropic, SONNET_MODEL } from "./client";

export const competencyQuestionSchema = z
  .object({
    question: z.string().min(1),
    options: z.array(z.string().min(1)).length(4),
    correctIndex: z.number().int().min(0).max(3),
    explanation: z.string().min(1),
  })
  .refine((q) => new Set(q.options).size === q.options.length, {
    message: "Options must be distinct.",
  });

export const competencyCheckSchema = z.object({
  questions: z.array(competencyQuestionSchema).length(5),
});

export type GeneratedCompetencyCheck = z.infer<typeof competencyCheckSchema>;

export type GenerateCompetencyCheckInput = {
  conceptName: string;
  conceptDescription: string;
  resourceTitles: string[];
};

const SYSTEM_PROMPT = `You write short competency checks that test whether a learner genuinely understands a concept — across everything they've studied, not from any single resource. You will be given a concept (name + description) and the titles of the resources the learner has been working through, for context only. Produce exactly 5 multiple-choice questions by calling the \`emit_competency_check\` tool. Do not produce any other text.

What a good question looks like:

- **Tests understanding, not recall.** Favour application, reasoning, prediction, and "why" over definition-matching or trivia. Good: "A system does X under condition Y — what will happen and why?" Bad: "Which year was X introduced?" or "What does the acronym X stand for?"
- **Standalone.** Each question must be answerable from understanding the concept itself, not from having read one specific resource. Do not reference "the book", "the lecture", "the author", or any specific resource. The resource titles are background for calibrating difficulty and scope only.
- **One unambiguously correct option.** Exactly 4 options. Exactly one is correct. The other 3 are plausible distractors that a learner with a shaky grasp might pick — common misconceptions, near-misses, or right-idea-wrong-detail. Avoid joke options and obvious throwaways.
- **\`correctIndex\`** is the 0-based index (0-3) of the correct option in the \`options\` array. Vary which position is correct across the 5 questions; do not always make it the same index.
- **\`explanation\`** is ONE sentence stating why the correct answer is right (and, where it sharpens understanding, why the tempting distractor is wrong). It should teach, not just assert.

Scope the difficulty to the concept's description. Keep options similar in length and specificity so length isn't a tell. Make the 5 questions cover different facets of the concept rather than rephrasing one idea five times.`;

const COMPETENCY_CHECK_INPUT_SCHEMA = {
  type: "object" as const,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      description:
        "Exactly 5 multiple-choice questions testing genuine understanding of the concept.",
      items: {
        type: "object",
        required: ["question", "options", "correctIndex", "explanation"],
        properties: {
          question: {
            type: "string",
            description:
              "An application/reasoning question about the concept. No reference to any specific resource.",
          },
          options: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            description:
              "Exactly 4 distinct answer options; one correct, three plausible distractors.",
            items: { type: "string" },
          },
          correctIndex: {
            type: "integer",
            minimum: 0,
            maximum: 3,
            description: "0-based index of the correct option. Vary across questions.",
          },
          explanation: {
            type: "string",
            description:
              "One sentence on why the correct answer is right (ideally why a distractor is wrong).",
          },
        },
      },
    },
  },
};

const TOOL_NAME = "emit_competency_check";

const TOOLS: Anthropic.Tool[] = [
  {
    name: TOOL_NAME,
    description:
      "Emit the 5-question competency check for this concept. Must be called exactly once.",
    input_schema: COMPETENCY_CHECK_INPUT_SCHEMA,
  },
];

function buildUserMessage(input: GenerateCompetencyCheckInput): string {
  const titles =
    input.resourceTitles.length > 0
      ? input.resourceTitles.map((t) => `- ${t}`).join("\n")
      : "(none recorded)";
  return [
    "Concept",
    `- Name: ${input.conceptName}`,
    `- Description: ${input.conceptDescription}`,
    "",
    "Resources the learner has been studying (for difficulty/scope context only — do not reference them in questions):",
    titles,
    "",
    "Write 5 multiple-choice questions testing genuine understanding of this concept.",
  ].join("\n");
}

type ToolCallResult = {
  toolUseId: string;
  input: unknown;
  hadToolUse: boolean;
  stopReason: string | null;
};

async function callSonnet(
  messages: Anthropic.MessageParam[],
): Promise<ToolCallResult> {
  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages,
    tools: TOOLS,
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === TOOL_NAME,
  );

  return {
    toolUseId: toolUse?.id ?? "",
    input: toolUse?.input ?? null,
    hadToolUse: Boolean(toolUse),
    stopReason: response.stop_reason,
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

export async function generateCompetencyCheck(
  input: GenerateCompetencyCheckInput,
): Promise<GeneratedCompetencyCheck> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserMessage(input) },
  ];

  const firstCall = await callSonnet(messages);
  if (!firstCall.hadToolUse) {
    throw new Error(
      `Expected ${TOOL_NAME} tool call; got stop_reason=${firstCall.stopReason}`,
    );
  }

  const firstResult = competencyCheckSchema.safeParse(firstCall.input);
  if (firstResult.success) return firstResult.data;

  console.warn(
    "[generateCompetencyCheck] first attempt failed validation, retrying once:\n" +
      formatZodErrors(firstResult.error),
  );

  const retryMessages: Anthropic.MessageParam[] = [
    ...messages,
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: firstCall.toolUseId,
          name: TOOL_NAME,
          input: firstCall.input,
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: firstCall.toolUseId,
          is_error: true,
          content: `Your previous ${TOOL_NAME} call failed validation:\n${formatZodErrors(
            firstResult.error,
          )}\n\nFix every issue above and call ${TOOL_NAME} again. Remember: exactly 5 questions, each with exactly 4 distinct options, a correctIndex in 0-3, and a one-sentence explanation.`,
        },
      ],
    },
  ];

  const retryCall = await callSonnet(retryMessages);
  if (!retryCall.hadToolUse) {
    throw new Error(
      `Retry: expected ${TOOL_NAME} tool call; got stop_reason=${retryCall.stopReason}`,
    );
  }

  return competencyCheckSchema.parse(retryCall.input);
}
