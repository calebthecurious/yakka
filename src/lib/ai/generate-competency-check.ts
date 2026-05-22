import { z } from "zod";
import { grok, DEFAULT_MODEL } from "./client";

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
        "Emit the 5-question competency check for this concept. Must be called exactly once.",
      parameters: COMPETENCY_CHECK_INPUT_SCHEMA,
    },
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
  id: string;
  arguments: string | null;
  finishReason: string | null;
};

async function callGrok(messages: ChatMessage[]): Promise<ToolCallResult> {
  const response = await grok.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: 4000,
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

export async function generateCompetencyCheck(
  input: GenerateCompetencyCheckInput,
): Promise<GeneratedCompetencyCheck> {
  const messages: ChatMessage[] = [
    { role: "user", content: buildUserMessage(input) },
  ];

  const firstCall = await callGrok(messages);
  if (firstCall.arguments === null) {
    throw new Error(
      `Expected ${TOOL_NAME} tool call; got finish_reason=${firstCall.finishReason}`,
    );
  }

  const firstResult = competencyCheckSchema.safeParse(
    JSON.parse(firstCall.arguments),
  );
  if (firstResult.success) return firstResult.data;

  console.warn(
    "[generateCompetencyCheck] first attempt failed validation, retrying once:\n" +
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
      )}\n\nFix every issue above and call ${TOOL_NAME} again. Remember: exactly 5 questions, each with exactly 4 distinct options, a correctIndex in 0-3, and a one-sentence explanation.`,
    },
  ];

  const retryCall = await callGrok(retryMessages);
  if (retryCall.arguments === null) {
    throw new Error(
      `Retry: expected ${TOOL_NAME} tool call; got finish_reason=${retryCall.finishReason}`,
    );
  }

  return competencyCheckSchema.parse(JSON.parse(retryCall.arguments));
}
