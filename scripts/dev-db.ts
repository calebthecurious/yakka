/**
 * Dev-database plumbing shared by `db:migrate:dev` and `db:seed:dev`.
 *
 * Reads ONLY `DEV_*` keys from `.env.local`. `DATABASE_URL` (prod) is never
 * consulted — it is not even copied into `process.env` — so these scripts
 * cannot be pointed at production by an env-file accident. On top of that,
 * the connection is refused unless the host is loopback.
 *
 * Local stack: `supabase start` (project_id "provency-dev", see
 * supabase/config.toml). Values come from `supabase status -o env`.
 */

import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import postgres from "postgres";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export interface DevEnv {
  DEV_DATABASE_URL: string;
  DEV_SUPABASE_URL: string;
  DEV_SUPABASE_ANON_KEY: string;
  DEV_SUPABASE_SERVICE_ROLE_KEY: string;
}

/** Load `.env.local`, returning only the DEV_* keys. Throws if any are missing. */
export function loadDevEnv(): DevEnv {
  let raw = "";
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    throw new Error(".env.local not found — run `supabase start` and record DEV_* values first.");
  }
  const parsed = parse(raw);
  const pick = (k: keyof DevEnv): string => {
    const v = process.env[k] ?? parsed[k];
    if (!v) {
      throw new Error(`${k} is not set in .env.local (see supabase status -o env)`);
    }
    return v;
  };
  return {
    DEV_DATABASE_URL: pick("DEV_DATABASE_URL"),
    DEV_SUPABASE_URL: pick("DEV_SUPABASE_URL"),
    DEV_SUPABASE_ANON_KEY: pick("DEV_SUPABASE_ANON_KEY"),
    DEV_SUPABASE_SERVICE_ROLE_KEY: pick("DEV_SUPABASE_SERVICE_ROLE_KEY"),
  };
}

/** Host of a connection URL, or throws if it is not loopback. */
export function assertLoopback(url: string, label: string): string {
  const host = new URL(url).hostname;
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `${label} points at "${host}", which is not loopback. Refusing: dev scripts may only target the local Supabase stack.`,
    );
  }
  return host;
}

/** A postgres-js client bound to the dev DB, after the loopback guard. */
export function connectDev(env: DevEnv) {
  const host = assertLoopback(env.DEV_DATABASE_URL, "DEV_DATABASE_URL");
  const port = new URL(env.DEV_DATABASE_URL).port || "5432";
  console.log(`dev db target: ${host}:${port}`);
  // `drop ... if exists` in the RLS migration emits a NOTICE per statement;
  // they are noise, not signal.
  return postgres(env.DEV_DATABASE_URL, { prepare: false, max: 1, onnotice: () => {} });
}
