/**
 * Read-only connectivity + migration-state check for one EXPLICITLY NAMED
 * database.
 *
 *   npm run db:check:dev   →  tsx scripts/db-check.ts --env dev
 *   npm run db:check       →  tsx scripts/db-check.ts --env prod
 *
 * Answers "does this runtime's database credential still authenticate, and is
 * the schema where the journal says it is?" without the apply ceremony. Nothing
 * here can write: every statement runs inside READ ONLY transactions.
 *
 * Target resolution is shared with scripts/migrate.ts (scripts/migrate-guard.ts):
 *   dev  → DEV_DATABASE_URL from .env.local, loopback only.
 *   prod → PROD_DATABASE_URL from process.env ONLY (Amendment 2). Export it into
 *          the shell for the duration. `vercel env pull` cannot reveal a
 *          sensitive value (it writes ""), so take the string from the Supabase
 *          dashboard (Connect → Transaction pooler, port 6543).
 *
 * Why this exists: on 2026-10-04/05 every database-backed page on prod 500'd
 * because Vercel's PROD_DATABASE_URL carried a password that had since been
 * reset (Postgres 28P01). The failure was only visible in Vercel runtime logs.
 * This script makes "is the credential valid" a one-line, exit-coded question.
 *
 * Exit codes: 0 connected, schema up to date · 2 connected, migrations pending
 *             1 could not connect / authentication failed / misconfigured.
 * Never prints the URL — host, port and database only.
 */

import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import postgres from "postgres";
import { GuardError, parseEnvFlag, resolveTarget, type ResolvedTarget } from "./migrate-guard";
import { plan } from "./migration-plan";

/* ── Target resolution (identical to scripts/migrate.ts) ───────────────── */

function loadVars(): Record<string, string | undefined> {
  let fileVars: Record<string, string> = {};
  try {
    fileVars = parse(readFileSync(".env.local", "utf8"));
  } catch {
    /* no .env.local — process.env must carry everything */
  }
  return {
    DEV_DATABASE_URL: process.env.DEV_DATABASE_URL ?? fileVars.DEV_DATABASE_URL,
    PROD_DATABASE_URL: process.env.PROD_DATABASE_URL,
  };
}

/* ── Read-only probes ──────────────────────────────────────────────────── */

type Sql = ReturnType<typeof postgres>;

interface Identity {
  usr: string;
  server: string;
}

interface Counts {
  profiles: number | null;
  syllabi: number | null;
}

async function identity(sql: Sql): Promise<Identity> {
  return sql.begin(async (tx) => {
    await tx`set transaction read only`;
    const [row] = await tx<{ usr: string; version: string }[]>`select current_user as usr, version() as version`;
    return { usr: row.usr, server: row.version.split(" ").slice(0, 2).join(" ") };
  });
}

async function appliedHashes(sql: Sql): Promise<Set<string>> {
  return sql.begin(async (tx) => {
    await tx`set transaction read only`;
    const [exists] = await tx<{ r: string | null }[]>`select to_regclass('drizzle.__drizzle_migrations')::text as r`;
    if (exists.r == null) return new Set<string>();
    const rows = await tx<{ hash: string }[]>`select hash from drizzle.__drizzle_migrations`;
    return new Set(rows.map((r) => r.hash));
  });
}

async function counts(sql: Sql): Promise<Counts> {
  return sql.begin(async (tx) => {
    await tx`set transaction read only`;
    const [reg] = await tx<{ p: string | null; s: string | null }[]>`
      select to_regclass('public.profiles')::text as p, to_regclass('public.syllabi')::text as s`;
    const out: Counts = { profiles: null, syllabi: null };
    if (reg.p != null) out.profiles = (await tx<{ n: number }[]>`select count(*)::int as n from profiles`)[0].n;
    if (reg.s != null) out.syllabi = (await tx<{ n: number }[]>`select count(*)::int as n from syllabi`)[0].n;
    return out;
  });
}

/* ── Diagnosis for the common failure shapes ───────────────────────────── */

function errorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function diagnose(err: unknown, target: ResolvedTarget): string {
  const code = errorCode(err);
  const message = err instanceof Error ? err.message : String(err);
  switch (code) {
    case "28P01":
      return (
        `password authentication failed for ${target.host} — the credential in ${target.source} is stale ` +
        `(most likely the Supabase database password was reset). Set the current pooler string where this ` +
        `runtime reads it (Vercel Project Settings → PROD_DATABASE_URL, then redeploy) and run this check again.`
      );
    case "XX000":
      return `${message} — the pooler rejected the tenant/user. Check the user is "postgres.<project-ref>" and the ref matches NEXT_PUBLIC_SUPABASE_URL.`;
    case "ENOTFOUND":
      return `${target.host} did not resolve. The direct db.<ref>.supabase.co host is IPv6-only; use the pooler host aws-0-<region>.pooler.supabase.com.`;
    case "ECONNREFUSED":
      return target.env === "dev"
        ? `${target.host}:${target.port} refused the connection — is the local stack running? (\`supabase start\`)`
        : `${target.host}:${target.port} refused the connection.`;
    case "CONNECT_TIMEOUT":
      return `${target.host}:${target.port} timed out — the host may be unreachable from this network (the direct host is IPv6-only) or the project paused.`;
    default:
      return message;
  }
}

/* ── Main ──────────────────────────────────────────────────────────────── */

let reported = false;

async function main(): Promise<number> {
  const env = parseEnvFlag(process.argv.slice(2));
  const target = resolveTarget(env, loadVars());

  console.log("── db:check (read-only) ───────────────────────────────");
  console.log(`  env       ${target.env}   (from ${target.source})`);
  console.log(`  host      ${target.host}:${target.port}`);
  console.log(`  database  ${target.database}`);

  const sql = postgres(target.url, { prepare: false, max: 1, connect_timeout: 20, onnotice: () => {} });
  const t0 = Date.now();
  try {
    const who = await identity(sql);
    console.log(`  connected ${Date.now() - t0}ms as ${who.usr} · ${who.server}`);

    const applied = await appliedHashes(sql);
    const all = plan();
    const pending = all.filter((m) => !applied.has(m.hash));
    const outOfBand = all.filter((m) => m.outOfBand).length;
    console.log(
      `  schema    ${applied.size} recorded · ${all.length - pending.length}/${all.length} journal files applied` +
        `${outOfBand > 0 ? ` (incl. ${outOfBand} out-of-band)` : ""} · ${pending.length} pending`,
    );
    for (const m of pending) console.log(`            pending  ${m.tag}.sql`);

    const c = await counts(sql);
    const fmt = (n: number | null) => (n == null ? "(no table)" : String(n));
    console.log(`  rows      profiles ${fmt(c.profiles)} · syllabi ${fmt(c.syllabi)}`);
    console.log("───────────────────────────────────────────────────────");
    if (pending.length > 0) {
      console.log(`DB CHECK: connected, ${pending.length} migration(s) pending — run db:migrate${env === "dev" ? ":dev" : ""}.`);
      return 2;
    }
    console.log("DB CHECK OK: credential valid, schema up to date.");
    return 0;
  } catch (err) {
    console.log("───────────────────────────────────────────────────────");
    reported = true;
    console.error(`DB CHECK FAILED (${target.source}): ${diagnose(err, target)}`);
    return 1;
  } finally {
    await sql.end({ timeout: 3 });
  }
}

// Supavisor can send a second ErrorResponse after a failed auth ("Authentication
// credentials are invalid…"), which postgres.js surfaces as an unhandled
// rejection after our catch has already reported. Keep the exit clean.
process.on("unhandledRejection", (err: unknown) => {
  if (!reported) console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    if (err instanceof GuardError) console.error(`refused: ${err.message}`);
    else console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
