import { z } from "zod";

const EnvSchema = z.object({
  GROK_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

type Env = z.infer<typeof EnvSchema>;
type EnvKey = keyof Env;

const EnvValueSchemas = {
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

/* ── Database URL (Amendment 2) ─────────────────────────────────────────────
 * There is deliberately NO variable named DATABASE_URL. Production credentials
 * live only in Vercel as PROD_DATABASE_URL; a local checkout holds only
 * DEV_DATABASE_URL, which must point at loopback (the docker Supabase stack).
 * Which one the app reads is decided by WHERE it runs, never by which file
 * happens to be loaded — so a local process cannot reach prod even in
 * principle, and a Vercel deployment cannot be pointed at someone's laptop. */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const UrlSchema = z.string().url();

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

export type DatabaseTarget = "PROD_DATABASE_URL" | "DEV_DATABASE_URL";

/** Which variable this runtime is allowed to read. Vercel (prod + preview) → PROD; anything else → DEV. */
export function databaseTargetFor(env: Readonly<Record<string, string | undefined>>): DatabaseTarget {
  return env.VERCEL === "1" ? "PROD_DATABASE_URL" : "DEV_DATABASE_URL";
}

/**
 * Resolve the connection string for this runtime. Pure over `env` so it is
 * unit-testable; the app calls it with process.env.
 */
export function resolveDatabaseUrl(env: Readonly<Record<string, string | undefined>>): string {
  const key = databaseTargetFor(env);
  const parsed = UrlSchema.safeParse(env[key]);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment variable ${key}:\n${formatIssues(parsed.error, key)}\n` +
        (key === "PROD_DATABASE_URL"
          ? "  PROD_DATABASE_URL must be set in Vercel Project Settings (Production and Preview)."
          : "  DEV_DATABASE_URL must be set in .env.local (run `supabase start`, then `supabase status -o env`)."),
    );
  }
  if (key === "DEV_DATABASE_URL") {
    const host = new URL(parsed.data).hostname;
    if (!isLoopbackHost(host)) {
      throw new Error(
        `DEV_DATABASE_URL points at "${host}", which is not loopback. Local processes may only use the local Supabase stack.`,
      );
    }
  }
  return parsed.data;
}

export function getDatabaseUrl(): string {
  return resolveDatabaseUrl(process.env);
}
