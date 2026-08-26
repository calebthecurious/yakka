/**
 * Apply the migration history to an EXPLICITLY NAMED database.
 *
 *   npm run db:migrate:dev        →  tsx scripts/migrate.ts --env dev
 *   npm run db:migrate            →  tsx scripts/migrate.ts --env prod
 *
 * There is no default target. `--env dev` resolves DEV_DATABASE_URL (loopback
 * only); `--env prod` resolves PROD_DATABASE_URL, which lives only in Vercel and
 * must be exported into the shell for the apply. Before anything is applied the script
 * prints the resolved host, database, pending migration files and the row
 * counts of the three largest tables. Any non-loopback host then requires an
 * interactive operator to type PROD; a non-TTY stdin fails BEFORE a socket is
 * opened, and there is no --yes bypass. Rules live in scripts/migrate-guard.ts
 * and are unit-tested.
 *
 * Why not `drizzle-kit migrate`? Two reasons:
 *  1. drizzle-kit has no target ceremony — that is how 0015 was once applied
 *     to prod from a local shell. drizzle.config.ts is now pinned to loopback.
 *  2. `0005_auth_ownership_rls.sql` lives outside the Drizzle journal — it was
 *     applied to prod out-of-band (see CLAUDE.md, memory: 0005 out-of-band).
 *     0012 alters `profiles`, which only 0005_auth creates, so it must run
 *     between 0004 and 0005_remarkable_proudstar. Drizzle's migrator cannot
 *     interleave a non-journal file, so we replay the journal ourselves.
 *
 * Bookkeeping is drizzle-compatible: the same `drizzle.__drizzle_migrations`
 * table, the same sha256-of-file hash, the same `created_at = journal.when`.
 * The out-of-band file is recorded with created_at = 0004.when + 1. Each file
 * is applied at most once (hash match ⇒ skip), so the script is idempotent.
 */

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parse } from "dotenv";
import postgres from "postgres";
import {
  CEREMONY_TOKEN,
  GuardError,
  assertInteractive,
  confirmationAccepted,
  parseEnvFlag,
  requiresCeremony,
  resolveTarget,
  type ResolvedTarget,
} from "./migrate-guard";
import { plan, type Migration } from "./migration-plan";

/* ── Target resolution ─────────────────────────────────────────────────── */

/**
 * DEV_DATABASE_URL may come from .env.local (it is loopback, at rest is fine).
 * PROD_DATABASE_URL is read from process.env ONLY — never from a file — so a
 * prod credential pasted into .env.local is inert here (Amendment 2).
 */
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

function connect(target: ResolvedTarget) {
  // `drop ... if exists` in the RLS migration emits a NOTICE per statement.
  return postgres(target.url, { prepare: false, max: 1, onnotice: () => {} });
}

type Sql = ReturnType<typeof connect>;

/* ── Preflight (read-only) ─────────────────────────────────────────────── */

async function appliedHashes(sql: Sql): Promise<Set<string>> {
  const exists = await sql<{ r: string | null }[]>`select to_regclass('drizzle.__drizzle_migrations') as r`;
  if (exists[0].r == null) return new Set();
  const rows = await sql<{ hash: string }[]>`select hash from drizzle.__drizzle_migrations`;
  return new Set(rows.map((r) => r.hash));
}

async function largestTables(sql: Sql): Promise<{ table: string; rows: number }[]> {
  const top = await sql<{ relname: string }[]>`
    select relname from pg_stat_user_tables
    where schemaname = 'public' order by n_live_tup desc, relname limit 3`;
  const out: { table: string; rows: number }[] = [];
  for (const t of top) {
    const r = await sql<{ n: number }[]>`select count(*)::int as n from ${sql("public." + t.relname)}`;
    out.push({ table: t.relname, rows: r[0].n });
  }
  return out;
}

function printPreflight(target: ResolvedTarget, pending: Migration[], tables: { table: string; rows: number }[]) {
  console.log("── preflight ──────────────────────────────────────────");
  console.log(`  env       ${target.env}   (from ${target.source})`);
  console.log(`  host      ${target.host}:${target.port}`);
  console.log(`  database  ${target.database}`);
  console.log(`  pending   ${pending.length === 0 ? "(none — up to date)" : ""}`);
  for (const m of pending) console.log(`            ${m.tag}.sql${m.outOfBand ? "  (out-of-band)" : ""}`);
  console.log("  largest tables");
  if (tables.length === 0) console.log("            (no user tables yet)");
  for (const t of tables) console.log(`            ${t.table.padEnd(22)} ${t.rows}`);
  console.log("───────────────────────────────────────────────────────");
}

/* ── Ceremony ──────────────────────────────────────────────────────────── */

async function ceremony(target: ResolvedTarget, pendingCount: number): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const typed = await rl.question(
      `Apply ${pendingCount} migration(s) to ${target.host}/${target.database}? Type ${CEREMONY_TOKEN} to continue: `,
    );
    if (!confirmationAccepted(typed)) {
      throw new GuardError(`Confirmation "${typed}" != ${CEREMONY_TOKEN}. Nothing applied.`);
    }
  } finally {
    rl.close();
  }
}

/* ── Apply (unchanged migration logic) ─────────────────────────────────── */

async function apply(sql: Sql, pending: Migration[]): Promise<void> {
  await sql`create schema if not exists drizzle`;
  await sql`create table if not exists drizzle.__drizzle_migrations (
    id serial primary key,
    hash text not null,
    created_at bigint
  )`;
  for (const m of pending) {
    const label = m.outOfBand ? `${m.tag} (out-of-band)` : m.tag;
    await sql.begin(async (tx) => {
      for (const stmt of m.statements) await tx.unsafe(stmt);
      await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${m.hash}, ${m.createdAt})`;
    });
    console.log(`  + ${label}  applied (${m.statements.length} statements)`);
  }
  const rows = await sql<{ n: number; latest: string }[]>`
    select count(*)::int as n, max(created_at)::text as latest from drizzle.__drizzle_migrations`;
  console.log(
    `\nmigration status: ${rows[0].n} recorded, ${pending.length} applied this run, latest created_at=${rows[0].latest}`,
  );
}

/* ── Main ──────────────────────────────────────────────────────────────── */

async function main() {
  const env = parseEnvFlag(process.argv.slice(2));
  const target = resolveTarget(env, loadVars());

  const needsCeremony = requiresCeremony(target.host);
  // Fail before opening a socket: a piped or CI stdin can never reach prod.
  if (needsCeremony) assertInteractive(process.stdin.isTTY);

  const sql = connect(target);
  try {
    const applied = await appliedHashes(sql);
    const all = plan();
    const pending = all.filter((m) => !applied.has(m.hash));
    for (const m of all) {
      if (applied.has(m.hash)) console.log(`  = ${m.tag}${m.outOfBand ? " (out-of-band)" : ""}  already applied`);
    }
    printPreflight(target, pending, await largestTables(sql));

    if (pending.length === 0) {
      console.log("nothing to apply.");
      return;
    }
    if (needsCeremony) await ceremony(target, pending.length);
    await apply(sql, pending);
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  if (err instanceof GuardError) {
    console.error(`refused: ${err.message}`);
  } else {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
