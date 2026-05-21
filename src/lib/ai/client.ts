import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "@/lib/env";

export const DEFAULT_MODEL = "grok-4-latest";
export const SONNET_MODEL = "claude-sonnet-4-5";

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

const globalForAnthropic = globalThis as unknown as {
  anthropic?: Anthropic;
};

let anthropicInstance: Anthropic | undefined;

function createAnthropic() {
  const client =
    globalForAnthropic.anthropic ??
    new Anthropic({ apiKey: getEnv("ANTHROPIC_API_KEY") });

  if (process.env.NODE_ENV !== "production") {
    globalForAnthropic.anthropic = client;
  }

  return client;
}

function getAnthropic() {
  anthropicInstance ??= globalForAnthropic.anthropic ?? createAnthropic();
  return anthropicInstance;
}

export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop, receiver) {
    return Reflect.get(getAnthropic(), prop, receiver);
  },
});
