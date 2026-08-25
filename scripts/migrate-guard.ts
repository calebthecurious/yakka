/**
 * Target-resolution and ceremony rules for scripts/migrate.ts.
 *
 * Pure functions, no I/O: every decision that can send DDL to the wrong
 * database is made here so it can be unit-tested (scripts/migrate-guard.test.ts).
 *
 * Rules (P2.2a):
 *  - `--env dev|prod` is mandatory. No flag, or any other value, is a usage
 *    error — there is no default target.
 *  - dev  → DEV_DATABASE_URL, and the host MUST be loopback.
 *  - prod → PROD_DATABASE_URL. Falls back to DATABASE_URL with a loud
 *    deprecation warning (P2.2b renames the variable; the fallback is a bridge).
 *  - Any non-loopback host demands ceremony: an interactive operator typing
 *    the literal token PROD. Non-interactive stdin is a hard failure and there
 *    is deliberately no --yes / env-var bypass.
 */

export type TargetEnv = "dev" | "prod";

export const USAGE =
  "usage: tsx scripts/migrate.ts --env dev|prod\n" +
  "  dev   applies to DEV_DATABASE_URL (must be loopback)\n" +
  "  prod  applies to PROD_DATABASE_URL and requires typing PROD interactively";

export const CEREMONY_TOKEN = "PROD";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export class GuardError extends Error {}

/** `--env dev` or `--env=prod` → the env; anything else throws USAGE. */
export function parseEnvFlag(argv: readonly string[]): TargetEnv {
  let value: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--env") value = argv[i + 1];
    else if (a.startsWith("--env=")) value = a.slice("--env=".length);
  }
  if (value === "dev" || value === "prod") return value;
  throw new GuardError(
    value === undefined ? `--env is required.\n${USAGE}` : `--env must be dev or prod, got "${value}".\n${USAGE}`,
  );
}

export interface ResolvedTarget {
  env: TargetEnv;
  url: string;
  /** Which variable supplied the URL. */
  source: "DEV_DATABASE_URL" | "PROD_DATABASE_URL" | "DATABASE_URL";
  host: string;
  port: string;
  database: string;
  /** Non-empty when a deprecated fallback was used. Caller must print it loudly. */
  warning: string | null;
}

export function isLoopback(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

/** Host / port / db name from a postgres URL — never the password. */
export function describeUrl(url: string): { host: string; port: string; database: string } {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || "5432",
    database: u.pathname.replace(/^\//, "") || "postgres",
  };
}

/**
 * Resolve the connection URL for `env` from a plain variables map (process.env
 * merged with .env.local by the caller). Throws GuardError on any misconfig.
 */
export function resolveTarget(env: TargetEnv, vars: Readonly<Record<string, string | undefined>>): ResolvedTarget {
  if (env === "dev") {
    const url = vars.DEV_DATABASE_URL;
    if (!url) throw new GuardError("DEV_DATABASE_URL is not set (see supabase status -o env).");
    const d = describeUrl(url);
    if (!isLoopback(d.host)) {
      throw new GuardError(
        `--env dev but DEV_DATABASE_URL points at "${d.host}", which is not loopback. Refusing.`,
      );
    }
    return { env, url, source: "DEV_DATABASE_URL", ...d, warning: null };
  }

  if (vars.PROD_DATABASE_URL) {
    const url = vars.PROD_DATABASE_URL;
    return { env, url, source: "PROD_DATABASE_URL", ...describeUrl(url), warning: null };
  }
  if (vars.DATABASE_URL) {
    const url = vars.DATABASE_URL;
    return {
      env,
      url,
      source: "DATABASE_URL",
      ...describeUrl(url),
      warning:
        "DEPRECATED: --env prod resolved from DATABASE_URL. Rename it to PROD_DATABASE_URL (P2.2b); this fallback will be removed.",
    };
  }
  throw new GuardError("--env prod but neither PROD_DATABASE_URL nor DATABASE_URL is set.");
}

/** Ceremony is required for every host that is not loopback — regardless of --env. */
export function requiresCeremony(host: string): boolean {
  return !isLoopback(host);
}

/**
 * Non-interactive stdin cannot perform the ceremony. Called BEFORE connecting
 * so a CI job or piped shell fails without ever opening a socket to prod.
 */
export function assertInteractive(stdinIsTTY: boolean | undefined): void {
  if (!stdinIsTTY) {
    throw new GuardError(
      "Non-loopback target and stdin is not a TTY. Prod applies require an interactive operator typing PROD; there is no --yes bypass.",
    );
  }
}

/** The typed confirmation must be exactly the token — no case folding, no trimming beyond the newline. */
export function confirmationAccepted(typed: string): boolean {
  return typed.replace(/\r?\n$/, "") === CEREMONY_TOKEN;
}
