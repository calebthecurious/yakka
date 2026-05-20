import OpenAI from "openai";
import { getEnv } from "@/lib/env";

export const DEFAULT_MODEL = "grok-4-latest";

const globalForGrok = globalThis as unknown as {
  grok?: OpenAI;
};

let grokInstance: OpenAI | undefined;

function createGrok() {
  const grok =
    globalForGrok.grok ??
    new OpenAI({
      apiKey: getEnv("GROK_API_KEY"),
      baseURL: "https://api.x.ai/v1",
    });

  if (process.env.NODE_ENV !== "production") {
    globalForGrok.grok = grok;
  }

  return grok;
}

function getGrok() {
  grokInstance ??= globalForGrok.grok ?? createGrok();
  return grokInstance;
}

export const grok = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    return Reflect.get(getGrok(), prop, receiver);
  },
});
