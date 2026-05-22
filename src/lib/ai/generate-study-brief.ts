import { z } from "zod";
import { grok, DEFAULT_MODEL } from "./client";

export const studyBriefLocationSchema = z.object({
  label: z.string().min(1),
  detail: z.string().min(1),
});

export const studyBriefCheckQuestionSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const studyBriefSchema = z.object({
  keyPoints: z.array(z.string().min(1)).min(4).max(7),
  application: z.string().min(1),
  locations: z.array(studyBriefLocationSchema),
  checkQuestions: z.array(studyBriefCheckQuestionSchema).min(3).max(5),
  aiConfidence: z.enum(["high", "low"]),
});

export type GeneratedStudyBrief = z.infer<typeof studyBriefSchema>;

export type GenerateStudyBriefInput = {
  conceptName: string;
  conceptDescription: string;
  resourceTitle: string;
  resourceType: string;
  resourceUrl?: string | null;
  resourceAuthor?: string | null;
};

const SYSTEM_PROMPT = `You are a study guide whose single job is to help a learner extract what ONE SPECIFIC resource teaches about ONE SPECIFIC concept. You are not summarising the whole resource, and you are not teaching the concept from scratch — you are the bridge between the two: "when you go to THIS resource, here is what to extract about THIS concept, and how to know you got it."

You will be given the concept (name + description) and the resource (title, type, optional author and URL). Produce a structured study brief by calling the \`emit_study_brief\` tool. Do not produce any other text.

Honesty rule — the most important rule:

You must NOT fabricate. If you do not genuinely recognise the specific named resource, you set \`aiConfidence\` to "low". Inventing plausible-sounding chapter numbers, section titles, page ranges, or video timestamps for a resource you don't actually know is the single worst thing you can do — it sends the learner hunting for content that doesn't exist and destroys their trust. Never do it.

- \`aiConfidence\`: "high" only when you actually recognise this specific resource (this exact book, course, lecture, paper, video, or article) and can speak to how it treats the concept. "low" when you do not recognise the specific named resource — you only know its type and title.

Fields:

- \`keyPoints\`: 4 to 7 points. Each is specifically about how THIS resource treats THIS concept — the angle it takes, the framing it uses, the worked examples or notation it leans on, the things it emphasises or skips. This is NOT a generic summary of the whole resource, and NOT a generic explanation of the concept. When \`aiConfidence\` is "low", frame the points around what a resource of this TYPE typically offers for this concept and what to look for while consuming it (e.g. "As a video lecture, watch for a worked derivation — pause and reproduce it yourself") — never assert specific content you cannot verify.

- \`application\`: one concrete paragraph on how to apply this concept in practice — what the learner can actually do or build once they understand it. Concrete, not motivational. This is about the concept; it is safe to write even at low confidence.

- \`locations\`: best-guess pointers into the resource — chapter names, section titles, approximate video timestamps, page ranges — ONLY for a resource you genuinely recognise. Each entry is {label, detail}: label is the pointer ("Chapter 4", "~12:30", "Section 2.3", "pp. 88-104"); detail says what's there ("covers actors and isolation"). If you cannot reasonably know the resource's structure, return an EMPTY array. Do not invent specific timestamps, chapter numbers, section titles, or page numbers you are not confident about. When \`aiConfidence\` is "low", \`locations\` MUST be an empty array.

- \`checkQuestions\`: 3 to 5 questions that test genuine understanding of THIS concept — not recall of the resource, not trivia. Each needs a model answer good enough to grade against. Favour "explain why", "what breaks if", "how would you" over "what is the definition of". These are about the concept and are safe at any confidence level.

Set \`aiConfidence\` honestly, then make every other field consistent with it.`;

const STUDY_BRIEF_INPUT_SCHEMA = {
  type: "object" as const,
  required: [
    "keyPoints",
    "application",
    "locations",
    "checkQuestions",
    "aiConfidence",
  ],
  properties: {
    keyPoints: {
      type: "array",
      minItems: 4,
      maxItems: 7,
      description:
        "4-7 points on how THIS resource treats THIS concept (not a generic resource summary). At low confidence, frame around what a resource of this type typically offers and what to look for.",
      items: { type: "string" },
    },
    application: {
      type: "string",
      description:
        "One concrete paragraph on how to apply this concept in practice.",
    },
    locations: {
      type: "array",
      description:
        "Best-guess pointers into the resource (chapters, sections, timestamps, page ranges). EMPTY array if you cannot reasonably know the structure or confidence is low. Never invent pointers.",
      items: {
        type: "object",
        required: ["label", "detail"],
        properties: {
          label: {
            type: "string",
            description:
              "The pointer itself: 'Chapter 4', '~12:30', 'Section 2.3', 'pp. 88-104'.",
          },
          detail: {
            type: "string",
            description: "What is covered there, in relation to this concept.",
          },
        },
      },
    },
    checkQuestions: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      description:
        "3-5 questions testing genuine understanding of THIS concept, each with a model answer.",
      items: {
        type: "object",
        required: ["question", "answer"],
        properties: {
          question: { type: "string" },
          answer: {
            type: "string",
            description: "Model answer, good enough to grade against.",
          },
        },
      },
    },
    aiConfidence: {
      type: "string",
      enum: ["high", "low"],
      description:
        "'high' only if you genuinely recognise this specific named resource. 'low' otherwise — and then locations MUST be empty and keyPoints/application must not assert specific resource content.",
    },
  },
};

const TOOL_NAME = "emit_study_brief";

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
        "Emit the structured study brief for this resource + concept pair. Must be called exactly once.",
      parameters: STUDY_BRIEF_INPUT_SCHEMA,
    },
  },
];

function buildUserMessage(input: GenerateStudyBriefInput): string {
  return [
    "Concept",
    `- Name: ${input.conceptName}`,
    `- Description: ${input.conceptDescription}`,
    "",
    "Resource",
    `- Title: ${input.resourceTitle}`,
    `- Type: ${input.resourceType}`,
    `- Author: ${input.resourceAuthor?.trim() || "(unknown)"}`,
    `- URL: ${input.resourceUrl?.trim() || "(none provided)"}`,
    "",
    "Produce the study brief for this concept as taught by this specific resource. If you do not recognise this specific resource, set aiConfidence to 'low' and do not fabricate its structure or content.",
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

export async function generateStudyBrief(
  input: GenerateStudyBriefInput,
): Promise<GeneratedStudyBrief> {
  const messages: ChatMessage[] = [
    { role: "user", content: buildUserMessage(input) },
  ];

  const firstCall = await callGrok(messages);
  if (firstCall.arguments === null) {
    throw new Error(
      `Expected ${TOOL_NAME} tool call; got finish_reason=${firstCall.finishReason}`,
    );
  }

  const firstResult = studyBriefSchema.safeParse(JSON.parse(firstCall.arguments));
  if (firstResult.success) return firstResult.data;

  console.warn(
    "[generateStudyBrief] first attempt failed validation, retrying once:\n" +
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
      )}\n\nFix every issue above and call ${TOOL_NAME} again. Remember: keyPoints must have 4-7 entries, checkQuestions 3-5 entries, and if aiConfidence is 'low', locations must be an empty array.`,
    },
  ];

  const retryCall = await callGrok(retryMessages);
  if (retryCall.arguments === null) {
    throw new Error(
      `Retry: expected ${TOOL_NAME} tool call; got finish_reason=${retryCall.finishReason}`,
    );
  }

  return studyBriefSchema.parse(JSON.parse(retryCall.arguments));
}
