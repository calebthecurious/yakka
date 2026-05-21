import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  GROK_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

type Env = z.infer<typeof EnvSchema>;
type EnvKey = keyof Env;

const EnvValueSchemas = {
  DATABASE_URL: EnvSchema.shape.DATABASE_URL,
  GROK_API_KEY: EnvSchema.shape.GROK_API_KEY,
  ANTHROPIC_API_KEY: EnvSchema.shape.ANTHROPIC_API_KEY,
  NEXT_PUBLIC_SUPABASE_URL: EnvSchema.shape.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: EnvSchema.shape.NEXT_PUBLIC_SUPABASE_ANON_KEY,
} satisfies { [K in EnvKey]: z.ZodType<Env[K]> };

function formatIssues(error: z.ZodError, fallbackPath?: string): string {
  return error.issues
    .map((i) => {
      const path = i.path.length > 0 ? i.path.join(".") : fallbackPath;
      return `  - ${path ?? "(root)"}: ${i.message}`;
    })
    .join("\n");
}

export function getEnv<K extends EnvKey>(key: K): Env[K] {
  const parsed = EnvValueSchemas[key].safeParse(process.env[key]);

  if (!parsed.success) {
    throw new Error(
      `Invalid environment variable ${key}:\n${formatIssues(parsed.error, key)}`,
    );
  }

  return parsed.data;
}
