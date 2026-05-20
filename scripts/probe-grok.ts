import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { default: OpenAI } = await import("openai");
  const grok = new OpenAI({
    apiKey: process.env.GROK_API_KEY,
    baseURL: "https://api.x.ai/v1",
  });

  console.log("[probe] tiny request to grok-4-latest...");
  const t0 = Date.now();
  try {
    const r = await grok.chat.completions.create({
      model: "grok-4-latest",
      max_tokens: 50,
      messages: [{ role: "user", content: "Reply with exactly: pong" }],
    });
    console.log(`[probe] ok in ${Date.now() - t0}ms`);
    console.log("[probe] reply:", r.choices[0]?.message?.content);
  } catch (err) {
    console.error(`[probe] failed in ${Date.now() - t0}ms`);
    console.error("[probe] error:", err);
  }
}
main();
