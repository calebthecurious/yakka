/**
 * The migration plan: which files run, in what order, with what drizzle
 * bookkeeping. Shared by `scripts/migrate.ts` (applies over a connection) and
 * `scripts/emit-migration-sql.ts` (writes one pasteable .sql file).
 *
 * Both consumers MUST agree on order and hashes, or a database seeded by one
 * would be re-migrated by the other. Keeping the plan in one module is what
 * guarantees that.
 *
 * The out-of-band file: `0005_auth_ownership_rls.sql` is not in the Drizzle
 * journal — it was applied to the old prod out-of-band (see CLAUDE.md). 0012
 * alters `profiles`, which only that file creates, so it must run between 0004
 * and 0005_remarkable_proudstar. It is recorded with created_at = 0004.when + 1
 * so its position in the ordering is stable.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const MIGRATIONS_DIR = path.resolve("src/db/migrations");
export const OUT_OF_BAND = {
  tag: "0005_auth_ownership_rls",
  after: "0004_clever_scarecrow",
} as const;

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
  breakpoints: boolean;
}

export interface Migration {
  tag: string;
  createdAt: number;
  /** sha256 of the whole file — the same identity drizzle-kit records. */
  hash: string;
  statements: string[];
  outOfBand: boolean;
}

export function readMigration(tag: string, createdAt: number, outOfBand = false): Migration {
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

export function plan(): Migration[] {
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
