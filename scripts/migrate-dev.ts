/**
 * Apply the full migration history to the LOCAL dev database.
 *
 *   npm run db:migrate:dev
 *
 * Why not `drizzle-kit migrate`? Two reasons:
 *  1. drizzle.config.ts reads DATABASE_URL (prod). This script reads only
 *     DEV_DATABASE_URL (scripts/dev-db.ts) and refuses non-loopback hosts.
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

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { connectDev, loadDevEnv } from "./dev-db";

const MIGRATIONS_DIR = path.resolve("src/db/migrations");
const OUT_OF_BAND = { tag: "0005_auth_ownership_rls", after: "0004_clever_scarecrow" };

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
  breakpoints: boolean;
}
interface Migration {
  tag: string;
  createdAt: number;
  hash: string;
  statements: string[];
  outOfBand: boolean;
}

function readMigration(tag: string, createdAt: number, outOfBand = false): Migration {
  const sqlText = readFileSync(path.join(MIGRATIONS_DIR, `${tag}.sql`), "utf8");
  return {
    tag,
    createdAt,
    outOfBand,
    hash: createHash("sha256").update(sqlText).digest("hex"),
    statements: sqlText
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  };
}

function plan(): Migration[] {
  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { entries: JournalEntry[] };
  const out: Migration[] = [];
  for (const e of journal.entries) {
    out.push(readMigration(e.tag, e.when));
    if (e.tag === OUT_OF_BAND.after) {
      out.push(readMigration(OUT_OF_BAND.tag, e.when + 1, true));
    }
  }
  return out;
}

async function main() {
  const env = loadDevEnv();
  const sql = connectDev(env);
  try {
    await sql`create schema if not exists drizzle`;
    await sql`create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )`;
    const applied = new Set(
      (await sql<{ hash: string }[]>`select hash from drizzle.__drizzle_migrations`).map(
        (r) => r.hash,
      ),
    );

    let ran = 0;
    for (const m of plan()) {
      const label = m.outOfBand ? `${m.tag} (out-of-band)` : m.tag;
      if (applied.has(m.hash)) {
        console.log(`  = ${label}  already applied`);
        continue;
      }
      await sql.begin(async (tx) => {
        for (const stmt of m.statements) await tx.unsafe(stmt);
        await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${m.hash}, ${m.createdAt})`;
      });
      ran += 1;
      console.log(`  + ${label}  applied (${m.statements.length} statements)`);
    }

    const rows = await sql<{ n: number; latest: string }[]>`
      select count(*)::int as n, max(created_at)::text as latest from drizzle.__drizzle_migrations`;
    console.log(
      `\nmigration status: ${rows[0].n} recorded, ${ran} applied this run, latest created_at=${rows[0].latest}`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
