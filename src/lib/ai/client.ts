import OpenAI from "openai";
import { env } from "@/lib/env";

export const DEFAULT_MODEL = "grok-4-latest";

const globalForGrok = globalThis as unknown as {
  grok?: OpenAI;
};

export const grok =
  globalForGrok.grok ??
  new OpenAI({
    apiKey: env.GROK_API_KEY,
    baseURL: "https://api.x.ai/v1",
  });

if (process.env.NODE_ENV !== "production") {
  globalForGrok.grok = grok;
}
