import { z } from "zod";
import { grok, DEFAULT_MODEL } from "./client";

/**
 * Company insight — RETRIEVE, DON'T RECALL.
 *
 * The single highest-risk failure mode for this product is the model
 * confidently inventing a company's internal stack/tools from training memory.
 * This module refuses to do that. The pipeline is two stages:
 *
 *   1. RESEARCH — one Grok call with xAI Live Search ON. The model issues real
 *      web/news searches and we capture the `citations` it actually retrieved.
 *      These URLs are the ONLY admissible sources.
 *
 *   2. STRUCTURE — a second call (no search) turns the findings into the typed
 *      shape, instructed to attribute every fact to a URL from the citation
 *      allow-list.
 *
 * Then we ENFORCE the guarantee in code, not just in the prompt: every
 * `verifiedFact` and every `techSignal` whose sourceUrl is not a member of the
 * real citation set is DROPPED. No source, no fact. If that empties the lists,
 * the caller renders an honest "limited public information" state rather than
 * fabricated detail.
 */

const FACT_SOURCE_TYPES = [
  "job_posting",
  "eng_blog",
  "paper",
  "talk",
  "github",
  "news",
] as const;

export const verifiedFactSchema = z.object({
  claim: z.string().min(1),
  // URL realness is enforced against the citation set, not by zod — a
  // syntactically valid URL the model invented is still a fabrication.
  sourceUrl: z.string().min(1),
  sourceType: z.enum(FACT_SOURCE_TYPES),
});

export const likelyInferenceSchema = z.object({
  inference: z.string().min(1),
  basedOn: z.string().min(1),
});

export const techSignalSchema = z.object({
  item: z.string().min(1),
  evidence: z.string().min(1),
  sourceUrl: z.string().min(1).nullable(),
});

export const alignmentNoteSchema = z.object({
  note: z.string().min(1),
  affectedClusterOrConcept: z.string().min(1),
});

export const companyInsightSchema = z.object({
  verifiedFacts: z.array(verifiedFactSchema),
  likelyInferences: z.array(likelyInferenceSchema),
  techSignals: z.array(techSignalSchema),
  alignmentNotes: z.array(alignmentNoteSchema),
});

export type GeneratedCompanyInsight = z.infer<typeof companyInsightSchema>;

export type GenerateCompanyInsightInput = {
  companyName: string;
  targetRole: string;
  jobDescription: string;
  /** Cluster/concept names so alignmentNotes can point at real syllabus parts. */
  syllabusOutline?: string;
};

export type CompanyInsightResult = {
  insight: GeneratedCompanyInsight;
  /** The real URLs retrieved by Live Search — the admissible source universe. */
  citations: string[];
  /** Claims/signals dropped because no retrieved source backed them. */
  droppedForNoSource: string[];
  model: string;
};

/**
 * xAI's server-side web search runs through the Agent Tools API on the
 * Responses endpoint (the older `search_parameters` Live Search is deprecated /
 * returns HTTP 410). Web search needs a tools-capable reasoning model.
 */
const SEARCH_MODEL = "grok-4.3";

// ── Grok / xAI typing helpers ───────────────────────────────────────────────
// The OpenAI SDK's types don't fully describe xAI's responses, so we describe
// just the slices we read.

type ChatMessage = Parameters<
  typeof grok.chat.completions.create
>[0]["messages"][number];

type GrokToolCall = {
  id: string;
  type: string;
  function?: { name: string; arguments: string };
};

type GrokCompletion = {
  choices: Array<{
    message?: {
      content?: string | null;
      tool_calls?: GrokToolCall[];
    };
    finish_reason?: string | null;
  }>;
};

/** The slice of the Responses API result we read for research + citations. */
type GrokResponsesResult = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{ url?: string; title?: string }>;
    }>;
  }>;
  /** xAI also surfaces every source it touched as a top-level list. */
  citations?: Array<string | { url?: string }>;
};

async function grokChatCreate(
  body: Record<string, unknown>,
): Promise<GrokCompletion> {
  const completion = await grok.chat.completions.create(
    body as unknown as Parameters<typeof grok.chat.completions.create>[0],
  );
  return completion as unknown as GrokCompletion;
}

type GrokResponses = {
  create: (body: Record<string, unknown>) => Promise<unknown>;
};

async function grokResponsesCreate(
  body: Record<string, unknown>,
): Promise<GrokResponsesResult> {
  const responses = (grok as unknown as { responses: GrokResponses }).responses;
  const result = await responses.create(body);
  return result as GrokResponsesResult;
}

// ── Stage 1: research with Live Search ────────────────────────────────────────

const RESEARCH_SYSTEM_PROMPT = `You are a meticulous research analyst gathering PUBLIC information about a target company to help a job seeker prepare. You have live web and news search. Your only job in this step is to find and report what is genuinely, publicly documented — with the exact source URL for each finding.

NON-NEGOTIABLE HONESTY RULES:
- Report ONLY things you can tie to a specific page you actually retrieved via search. After every finding, put the exact source URL in brackets, e.g. "[https://example.com/careers/role]".
- DO NOT state any internal, proprietary, or non-public detail as fact. If you cannot find a public source for something, do not assert it. Absence of public information is itself honest, useful information — write "not publicly documented" rather than guessing.
- DO NOT invent tool names, internal system names, programming languages, frameworks, or stack details. If the company's own job postings list a language or tool, that is a real signal — cite the posting. If you are only inferring, label it explicitly as an inference.
- Never paste long passages. Paraphrase; quote at most a short phrase.

WHAT TO LOOK FOR, in priority order:
1. The company's own job postings / careers page — the richest legitimate signal for languages, frameworks, and tools they hire for.
2. The company's engineering blog, published papers, recorded public tech talks.
3. Their public GitHub organisation / open-source repositories.
4. Reputable news and official announcements.

Organise your findings under headings: VERIFIED FACTS (each with a URL and what kind of source it is), TECH SIGNALS (languages/tools/frameworks they demonstrably hire for or use publicly, each with a URL), REASONABLE INFERENCES (clearly labelled guesses from the public facts, with what they're based on — NO URL needed, but say "inference"), and GAPS (what you looked for but could NOT find publicly).

If you find very little, say so plainly. A short, honest report beats a padded one.`;

function buildResearchUserMessage(input: GenerateCompanyInsightInput): string {
  return [
    `Target company: ${input.companyName}`,
    `Role the person is targeting: ${input.targetRole}`,
    "",
    "Job description (for context on what matters):",
    "<<<JD",
    input.jobDescription.trim() || "(none provided)",
    "JD",
    "",
    `Research ${input.companyName} now. Find their careers/job postings, engineering content, public papers/talks, GitHub org, and reputable news. Report only what you can cite with a real URL you retrieved. Where you can't find something public, say so.`,
  ].join("\n");
}

function extractFindings(result: GrokResponsesResult): string {
  if (result.output_text && result.output_text.trim()) {
    return result.output_text;
  }
  // Fall back to concatenating text blocks across the output items.
  return (result.output ?? [])
    .flatMap((item) =>
      (item.content ?? [])
        .map((c) => c.text ?? "")
        .filter((t) => t.length > 0),
    )
    .join("\n");
}

function extractCitations(result: GrokResponsesResult): string[] {
  const urls = new Set<string>();

  // Top-level list of every source the agent touched.
  for (const c of result.citations ?? []) {
    const u = typeof c === "string" ? c : c?.url;
    if (u && u.trim()) urls.add(u.trim());
  }

  // Inline annotations on output_text content blocks.
  for (const item of result.output ?? []) {
    for (const content of item.content ?? []) {
      for (const ann of content.annotations ?? []) {
        if (ann.url && ann.url.trim()) urls.add(ann.url.trim());
      }
    }
  }

  return [...urls];
}

async function runResearch(input: GenerateCompanyInsightInput): Promise<{
  findings: string;
  citations: string[];
}> {
  const result = await grokResponsesCreate({
    model: SEARCH_MODEL,
    max_output_tokens: 6000,
    instructions: RESEARCH_SYSTEM_PROMPT,
    input: buildResearchUserMessage(input),
    tools: [{ type: "web_search" }],
  });

  return {
    findings: extractFindings(result),
    citations: extractCitations(result),
  };
}

// ── Stage 2: structure the findings ───────────────────────────────────────────

const STRUCTURE_TOOL_NAME = "emit_company_insight";

const STRUCTURE_SYSTEM_PROMPT = `You convert a research report about a company into a strict structured form by calling \`${STRUCTURE_TOOL_NAME}\` exactly once. Output no other text.

You are given (a) the research findings and (b) an ALLOWED SOURCES list of real URLs that were actually retrieved by search. These are the ONLY URLs you may use.

HARD RULES — the product's integrity depends on these:
- Every item in \`verifiedFacts\` MUST have a \`sourceUrl\` copied VERBATIM from the ALLOWED SOURCES list. No source, no fact. If a finding has no allowed URL, move it to \`likelyInferences\` (if it's reasonable) or drop it.
- Every item in \`techSignals\` MUST also have a \`sourceUrl\` from the ALLOWED SOURCES list — a language/tool/framework the company demonstrably hires for or uses publicly, with the evidence and the URL. If you can't source it, it is not a tech signal.
- Do NOT state any internal, proprietary, or non-public company detail as a verified fact. Do NOT invent tool/system/stack names. If it isn't in the findings with a real source, it doesn't go in verifiedFacts or techSignals.
- \`likelyInferences\` are explicitly informed guesses, NOT facts. Each must say what public observation it is \`basedOn\`. Never dress an inference up as certain.
- \`alignmentNotes\` say how these findings should sharpen the learner's syllabus. \`affectedClusterOrConcept\` should name a real cluster/concept from the provided outline when one fits, otherwise a short topic label. These are advisory only.
- It is correct and honest for lists to be SHORT or EMPTY when the public record is thin. Do not pad. An empty \`verifiedFacts\` is better than a fabricated one.
- sourceType must match the URL: job_posting | eng_blog | paper | talk | github | news.`;

const STRUCTURE_INPUT_SCHEMA = {
  type: "object" as const,
  required: ["verifiedFacts", "likelyInferences", "techSignals", "alignmentNotes"],
  properties: {
    verifiedFacts: {
      type: "array",
      description:
        "Claims backed by a real retrieved source. Empty if the public record is thin. Each sourceUrl MUST come from ALLOWED SOURCES.",
      items: {
        type: "object",
        required: ["claim", "sourceUrl", "sourceType"],
        properties: {
          claim: {
            type: "string",
            description:
              "A specific publicly-documented fact, paraphrased. No internal/non-public detail.",
          },
          sourceUrl: {
            type: "string",
            description: "A URL copied verbatim from the ALLOWED SOURCES list.",
          },
          sourceType: {
            type: "string",
            enum: [...FACT_SOURCE_TYPES],
            description: "What kind of source this URL is.",
          },
        },
      },
    },
    likelyInferences: {
      type: "array",
      description:
        "Clearly-labelled informed guesses derived from public facts. NOT presented as certain.",
      items: {
        type: "object",
        required: ["inference", "basedOn"],
        properties: {
          inference: {
            type: "string",
            description: "The inference, framed as a reasonable guess (not a fact).",
          },
          basedOn: {
            type: "string",
            description: "The public observation(s) this inference is reasoning from.",
          },
        },
      },
    },
    techSignals: {
      type: "array",
      description:
        "Languages/tools/frameworks the company demonstrably hires for or uses publicly. Each sourceUrl MUST come from ALLOWED SOURCES.",
      items: {
        type: "object",
        required: ["item", "evidence", "sourceUrl"],
        properties: {
          item: {
            type: "string",
            description: "The language/tool/framework/practice.",
          },
          evidence: {
            type: "string",
            description: "What public source shows it (e.g. 'listed in their BCI firmware job posting').",
          },
          sourceUrl: {
            type: ["string", "null"],
            description:
              "A URL from ALLOWED SOURCES. If you cannot source it, this is not a tech signal — omit the whole item.",
          },
        },
      },
    },
    alignmentNotes: {
      type: "array",
      description:
        "Advisory notes on how these findings should sharpen the syllabus. Not auto-applied.",
      items: {
        type: "object",
        required: ["note", "affectedClusterOrConcept"],
        properties: {
          note: {
            type: "string",
            description: "How this finding should sharpen the learner's roadmap.",
          },
          affectedClusterOrConcept: {
            type: "string",
            description:
              "A real cluster/concept name from the outline when one fits, else a short topic label.",
          },
        },
      },
    },
  },
};

const STRUCTURE_TOOL = {
  type: "function" as const,
  function: {
    name: STRUCTURE_TOOL_NAME,
    description:
      "Emit the structured company insight. Call exactly once. Every verifiedFact and techSignal sourceUrl must come from the ALLOWED SOURCES list.",
    parameters: STRUCTURE_INPUT_SCHEMA,
  },
};

function buildStructureUserMessage(
  input: GenerateCompanyInsightInput,
  findings: string,
  citations: string[],
): string {
  const allowed =
    citations.length > 0
      ? citations.map((c, i) => `${i + 1}. ${c}`).join("\n")
      : "(none — no public sources were retrieved; verifiedFacts and techSignals must be empty)";

  return [
    `Company: ${input.companyName}`,
    `Target role: ${input.targetRole}`,
    "",
    "Syllabus outline (for alignmentNotes — name real clusters/concepts when they fit):",
    input.syllabusOutline?.trim() || "(no outline provided)",
    "",
    "ALLOWED SOURCES (the ONLY URLs you may use for verifiedFacts and techSignals):",
    allowed,
    "",
    "RESEARCH FINDINGS:",
    "<<<FINDINGS",
    findings.trim() || "(the research step returned nothing)",
    "FINDINGS",
    "",
    `Call ${STRUCTURE_TOOL_NAME} now. Remember: no source, no fact. Short or empty lists are fine and honest.`,
  ].join("\n");
}

function formatZodErrors(err: z.ZodError): string {
  return err.issues
    .map((i) => `- ${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("\n");
}

async function callStructure(messages: ChatMessage[]): Promise<string> {
  const completion = await grokChatCreate({
    model: DEFAULT_MODEL,
    max_tokens: 6000,
    messages,
    tools: [STRUCTURE_TOOL],
    tool_choice: { type: "function", function: { name: STRUCTURE_TOOL_NAME } },
  });

  const call = completion.choices[0]?.message?.tool_calls?.find(
    (tc) => tc.type === "function" && tc.function?.name === STRUCTURE_TOOL_NAME,
  );
  const args = call?.function?.arguments;
  if (!args) {
    throw new Error(
      `generateCompanyInsight: model did not return an ${STRUCTURE_TOOL_NAME} tool call (finish_reason=${completion.choices[0]?.finish_reason})`,
    );
  }
  return args;
}

// ── Citation enforcement ──────────────────────────────────────────────────────

/**
 * Canonicalise a URL for set membership: lowercase host, strip fragment and
 * trailing slash. Returns null for anything that isn't a real http(s) URL.
 */
function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    let path = url.pathname.replace(/\/+$/, "");
    if (path === "") path = "/";
    return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
  } catch {
    return null;
  }
}

/**
 * The structural honesty guarantee. Keep only verifiedFacts / techSignals whose
 * sourceUrl maps to a URL that was ACTUALLY retrieved by Live Search; rewrite
 * each kept URL to the canonical retrieved form. Everything else is dropped.
 */
function enforceCitations(
  insight: GeneratedCompanyInsight,
  citations: string[],
): { cleaned: GeneratedCompanyInsight; dropped: string[] } {
  const canonicalByNormalized = new Map<string, string>();
  for (const c of citations) {
    const norm = normalizeUrl(c);
    if (norm && !canonicalByNormalized.has(norm)) {
      canonicalByNormalized.set(norm, c.trim());
    }
  }

  const dropped: string[] = [];

  const resolve = (sourceUrl: string | null): string | null => {
    if (!sourceUrl) return null;
    const norm = normalizeUrl(sourceUrl);
    if (!norm) return null;
    return canonicalByNormalized.get(norm) ?? null;
  };

  const verifiedFacts = insight.verifiedFacts.flatMap((f) => {
    const resolved = resolve(f.sourceUrl);
    if (!resolved) {
      dropped.push(`fact: "${f.claim}" (source not in retrieved set: ${f.sourceUrl})`);
      return [];
    }
    return [{ ...f, sourceUrl: resolved }];
  });

  const techSignals = insight.techSignals.flatMap((t) => {
    const resolved = resolve(t.sourceUrl);
    if (!resolved) {
      dropped.push(`tech signal: "${t.item}" (source not in retrieved set: ${t.sourceUrl ?? "null"})`);
      return [];
    }
    return [{ ...t, sourceUrl: resolved }];
  });

  return {
    cleaned: {
      verifiedFacts,
      techSignals,
      likelyInferences: insight.likelyInferences,
      alignmentNotes: insight.alignmentNotes,
    },
    dropped,
  };
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function generateCompanyInsight(
  input: GenerateCompanyInsightInput,
): Promise<CompanyInsightResult> {
  const { findings, citations } = await runResearch(input);

  const messages: ChatMessage[] = [
    { role: "system", content: STRUCTURE_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildStructureUserMessage(input, findings, citations),
    },
  ];

  const firstArgs = await callStructure(messages);
  let parsed = companyInsightSchema.safeParse(JSON.parse(firstArgs));

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
            function: { name: STRUCTURE_TOOL_NAME, arguments: firstArgs },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "retry",
        content: `Your ${STRUCTURE_TOOL_NAME} call failed validation:\n${formatZodErrors(
          parsed.error,
        )}\n\nFix every issue and call ${STRUCTURE_TOOL_NAME} again.`,
      },
    ];
    const secondArgs = await callStructure(retryMessages);
    parsed = companyInsightSchema.safeParse(JSON.parse(secondArgs));
    if (!parsed.success) {
      throw new Error(
        `generateCompanyInsight: validation failed after retry:\n${formatZodErrors(parsed.error)}`,
      );
    }
  }

  const { cleaned, dropped } = enforceCitations(parsed.data, citations);

  if (dropped.length > 0) {
    console.warn(
      `[generateCompanyInsight] dropped ${dropped.length} unsourced item(s) for "${input.companyName}":\n` +
        dropped.map((d) => `  - ${d}`).join("\n"),
    );
  }

  return {
    insight: cleaned,
    citations,
    droppedForNoSource: dropped,
    model: DEFAULT_MODEL,
  };
}
