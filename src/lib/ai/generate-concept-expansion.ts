import { z } from "zod";
import { grok, DEFAULT_MODEL } from "./client";

// ── Output contract ─────────────────────────────────────────────────────────
// Mins are intentionally below the "target" ranges in the prompt: the honesty
// constraint lets the model produce thinner output when it isn't confident,
// rather than fabricating depth. The prompt asks for the fuller ranges.
export const conceptExpansionContentSchema = z.object({
  definition: z.string().min(1),
  principles: z
    .array(
      z.object({ name: z.string().min(1), explanation: z.string().min(1) }),
    )
    .min(2)
    .max(6),
  keyTerms: z
    .array(z.object({ term: z.string().min(1), definition: z.string().min(1) }))
    .min(3)
    .max(12),
  prerequisiteConceptIds: z.array(z.string()),
  buildsOnConceptIds: z.array(z.string()),
  commonMisunderstandings: z
    .array(
      z.object({
        misconception: z.string().min(1),
        correction: z.string().min(1),
      }),
    )
    .min(1)
    .max(4),
  relationshipMapMermaid: z.string(),
});

export type ConceptExpansionContent = z.infer<
  typeof conceptExpansionContentSchema
>;

export type SiblingConcept = { id: string; name: string; description: string };

export type GenerateConceptExpansionInput = {
  conceptName: string;
  conceptDescription: string;
  clusterName: string;
  syllabusTargetRole: string;
  siblingConcepts: SiblingConcept[];
};

export type GeneratedConceptExpansion = {
  content: ConceptExpansionContent;
  model: string;
};

const SYSTEM_PROMPT = `You are an expert educator and a working senior practitioner in the domain of the concept you are given. You explain things the way a great mentor does: precise, honest, and broken into small chunks with distinct headers — never a wall of text, never padding.

You will be given a concept (name + description), the skill cluster it belongs to, the learner's target role, and a list of sibling concepts in the same cluster (each with an id, name, and description). Produce a "deeper understanding" expansion by calling \`emit_expansion\`. Do not produce any other text.

Rules:

1. **definition** — 2-3 sentences, plain language. What the concept actually is. No fluff.

2. **principles** — 3-6 DISTINCT sub-ideas, each a small chunk the learner can hold in their head. Give each a specific, distinct \`name\` and a 1-3 sentence \`explanation\`. Don't restate the definition.

3. **keyTerms** — 5-12 vocabulary items a fluent practitioner actually uses when discussing this, each with a crisp 1-2 sentence \`definition\`. Real domain vocabulary, not generic words.

4. **prerequisiteConceptIds** and **buildsOnConceptIds** — Use ONLY \`id\` values from the provided sibling concepts. \`prerequisiteConceptIds\`: siblings a learner should understand BEFORE this concept. \`buildsOnConceptIds\`: siblings that this concept ENABLES / leads into. If there are no clear relationships, return empty arrays. NEVER invent ids or use ids that aren't in the sibling list.

5. **commonMisunderstandings** — 2-4 SPECIFIC misconceptions or pitfalls genuine to THIS concept, each as a \`misconception\` (the wrong mental model a learner actually forms) and a \`correction\` (the accurate picture). Must be concrete and pedagogically useful — NOT generic filler like "people find this hard" or "it takes practice".

6. **relationshipMapMermaid** — a SHORT Mermaid \`graph TD\` (top-down) diagram showing this concept and its closest 3-6 related sibling concepts. 4-7 nodes MAXIMUM. Use simple node ids (n1, n2, ...) with the concept NAME in brackets, and labelled edges. Use ONLY sibling concept names (or this concept's name) as labels — no invented concepts. Example:
\`\`\`
graph TD
  n1["This Concept"]
  n2["Prerequisite Concept"]
  n2 -->|required for| n1
  n1 -->|enables| n3["Downstream Concept"]
\`\`\`
If you cannot form a meaningful small map from the siblings, return an empty string.

HONESTY CONSTRAINT (this overrides the target counts above): If you do not have strong, reliable knowledge of this concept's domain, produce SHORTER, more cautious output — fewer principles, fewer terms, fewer misunderstandings — rather than fabricating depth or inventing plausible-sounding specifics. Better thin and accurate than rich and wrong. Never invent terminology, relationships, or "facts" you are unsure of.`;

const EXPANSION_TOOL = {
  type: "function" as const,
  function: {
    name: "emit_expansion",
    description: "Emit the structured deeper-understanding expansion.",
    parameters: {
      type: "object",
      required: [
        "definition",
        "principles",
        "keyTerms",
        "prerequisiteConceptIds",
        "buildsOnConceptIds",
        "commonMisunderstandings",
        "relationshipMapMermaid",
      ],
      properties: {
        definition: {
          type: "string",
          description: "2-3 plain-language sentences: what it is.",
        },
        principles: {
          type: "array",
          minItems: 2,
          maxItems: 6,
          items: {
            type: "object",
            required: ["name", "explanation"],
            properties: {
              name: { type: "string" },
              explanation: { type: "string" },
            },
          },
        },
        keyTerms: {
          type: "array",
          minItems: 3,
          maxItems: 12,
          items: {
            type: "object",
            required: ["term", "definition"],
            properties: {
              term: { type: "string" },
              definition: { type: "string" },
            },
          },
        },
        prerequisiteConceptIds: {
          type: "array",
          description:
            "Sibling concept ids to understand first. Only ids from the provided siblings. Empty if none.",
          items: { type: "string" },
        },
        buildsOnConceptIds: {
          type: "array",
          description:
            "Sibling concept ids this concept enables. Only ids from the provided siblings. Empty if none.",
          items: { type: "string" },
        },
        commonMisunderstandings: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            required: ["misconception", "correction"],
            properties: {
              misconception: { type: "string" },
              correction: { type: "string" },
            },
          },
        },
        relationshipMapMermaid: {
          type: "string",
          description:
            "A short Mermaid `graph TD` (4-7 nodes) using only sibling names, or an empty string.",
        },
      },
    },
  },
};

type ChatMessage = Parameters<
  typeof grok.chat.completions.create
>[0]["messages"][number];

function buildUserMessage(input: GenerateConceptExpansionInput): string {
  const siblings =
    input.siblingConcepts.length > 0
      ? input.siblingConcepts
          .map(
            (s) => `- id: ${s.id}\n  name: ${s.name}\n  description: ${s.description}`,
          )
          .join("\n")
      : "(none — this cluster has no other concepts; return empty prerequisite/builds-on arrays)";

  return [
    `Target role: ${input.syllabusTargetRole}`,
    `Skill cluster: ${input.clusterName}`,
    "",
    `Concept: ${input.conceptName}`,
    `Concept description: ${input.conceptDescription}`,
    "",
    "Sibling concepts in the same cluster (use these exact ids for prerequisite/builds-on relationships):",
    siblings,
  ].join("\n");
}

async function callExpansion(messages: ChatMessage[]): Promise<string> {
  const completion = await grok.chat.completions.create({
    model: DEFAULT_MODEL,
    max_tokens: 8000,
    messages,
    tools: [EXPANSION_TOOL],
    tool_choice: { type: "function", function: { name: "emit_expansion" } },
  });

  const call = completion.choices[0]?.message?.tool_calls?.find(
    (tc) => tc.type === "function" && tc.function.name === "emit_expansion",
  );
  const args =
    call && call.type === "function" ? call.function.arguments : undefined;
  if (!args) {
    throw new Error(
      `generateConceptExpansion: model did not return an emit_expansion tool call (finish_reason=${completion.choices[0]?.finish_reason})`,
    );
  }
  return args;
}

function formatZodErrors(err: z.ZodError): string {
  return err.issues
    .map((i) => `- ${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("\n");
}

export async function generateConceptExpansion(
  input: GenerateConceptExpansionInput,
): Promise<GeneratedConceptExpansion> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserMessage(input) },
  ];

  const firstArgs = await callExpansion(messages);
  let parsed = conceptExpansionContentSchema.safeParse(JSON.parse(firstArgs));

  // One validation retry, feeding the errors back, before giving up.
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
            function: { name: "emit_expansion", arguments: firstArgs },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "retry",
        content: `Your emit_expansion call failed validation:\n${formatZodErrors(
          parsed.error,
        )}\n\nFix every issue and call emit_expansion again.`,
      },
    ];
    const secondArgs = await callExpansion(retryMessages);
    parsed = conceptExpansionContentSchema.safeParse(JSON.parse(secondArgs));
    if (!parsed.success) {
      throw new Error(
        `generateConceptExpansion: validation failed after retry:\n${formatZodErrors(parsed.error)}`,
      );
    }
  }

  // Defensive: the model can hallucinate ids. Keep only real sibling ids, and
  // drop the concept's own id if it slipped in.
  const validIds = new Set(input.siblingConcepts.map((s) => s.id));
  const content: ConceptExpansionContent = {
    ...parsed.data,
    prerequisiteConceptIds: parsed.data.prerequisiteConceptIds.filter((id) =>
      validIds.has(id),
    ),
    buildsOnConceptIds: parsed.data.buildsOnConceptIds.filter((id) =>
      validIds.has(id),
    ),
    relationshipMapMermaid: parsed.data.relationshipMapMermaid.trim(),
  };

  return { content, model: DEFAULT_MODEL };
}
