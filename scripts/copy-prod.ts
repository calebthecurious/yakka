/**
 * One-off carry-over: copy every row from the OLD Supabase project into the
 * NEW one (2026-08-25 project move, dzdfeundgibdiyvtajue → skksjylkquovwhgjbwxi).
 *
 *   OLD_DATABASE_URL=<old pooler uri> NEW_DATABASE_URL=<new pooler uri> \
 *     npx tsx scripts/copy-prod.ts [--dry-run]
 *
 * Preconditions: the NEW project already has the schema (npm run db:migrate
 * --env prod, typed PROD). Both URLs are passed as transient env vars for one
 * run and are never printed; only hosts, table names and row counts are.
 *
 * What it copies, in FK order:
 *   auth.users, auth.identities            (password hashes + Google identities,
 *                                           so existing users keep their logins
 *                                           and ids — every public FK points at
 *                                           auth.users.id)
 *   then the public tables in dependency order.
 *
 * How: for each table, the columns common to both sides (skipping GENERATED
 * columns such as auth.identities.email), `select *` from old, insert into
 * new in chunks with ON CONFLICT DO NOTHING — so the script is re-runnable.
 * `profiles` uses DO UPDATE because the auth.users trigger
 * (on_auth_user_created_create_profile) creates a stub profile first. Rows
 * travel as JSON through json_populate_recordset(null::table, $1), so Postgres
 * does all the typing (timestamps, enums, jsonb) — no client-side inference.
 *
 * Guards: NEW host must be the new project's pooler; OLD and NEW must differ;
 * NEW must have the schema; NEW public tables must be empty unless --force.
 */

import postgres from "postgres";

const NEW_PROJECT_REF = "skksjylkquovwhgjbwxi";
const CHUNK = 500;

/** FK order. auth first; public tables parent → child. */
const TABLES: { schema: string; table: string; upsert?: boolean }[] = [
  { schema: "auth", table: "users" },
  { schema: "auth", table: "identities" },
  { schema: "public", table: "profiles", upsert: true },
  { schema: "public", table: "syllabi" },
  { schema: "public", table: "skill_clusters" },
  { schema: "public", table: "sub_skills" },
  { schema: "public", table: "concepts" },
  { schema: "public", table: "resources" },
  { schema: "public", table: "learning_sessions" },
  { schema: "public", table: "retention_cards" },
  { schema: "public", table: "artefacts" },
  { schema: "public", table: "study_briefs" },
  { schema: "public", table: "competency_checks" },
  { schema: "public", table: "concept_expansions" },
  { schema: "public", table: "concept_relevances" },
  { schema: "public", table: "gap_reports" },
  { schema: "public", table: "company_insights" },
  { schema: "public", table: "foundation_items" },
];

type Sql = ReturnType<typeof postgres>;
type Row = Record<string, unknown>;
interface ColumnInfo {
  name: string;
  dataType: string;
}

function hostOf(url: string): string {
  return new URL(url).hostname;
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set (pass it as a transient env var for this run).`);
  return v;
}

async function columns(sql: Sql, schema: string, table: string): Promise<ColumnInfo[]> {
  const rows = await sql<{ column_name: string; data_type: string; is_generated: string }[]>`
    select column_name, data_type, is_generated
    from information_schema.columns
    where table_schema = ${schema} and table_name = ${table}
    order by ordinal_position`;
  return rows
    .filter((r) => r.is_generated !== "ALWAYS")
    .map((r) => ({ name: r.column_name, dataType: r.data_type }));
}

async function count(sql: Sql, schema: string, table: string): Promise<number> {
  const r = await sql<{ n: number }[]>`select count(*)::int as n from ${sql(schema + "." + table)}`;
  return r[0].n;
}

async function copyTable(
  oldDb: Sql,
  newDb: Sql,
  spec: (typeof TABLES)[number],
  dryRun: boolean,
): Promise<{ table: string; old: number; before: number; after: number }> {
  const label = `${spec.schema}.${spec.table}`;
  const oldCols = await columns(oldDb, spec.schema, spec.table);
  const newCols = await columns(newDb, spec.schema, spec.table);
  const newNames = new Set(newCols.map((c) => c.name));
  const common = oldCols.filter((c) => newNames.has(c.name));
  const missing = oldCols.filter((c) => !newNames.has(c.name)).map((c) => c.name);
  if (missing.length) console.log(`  ! ${label}: columns only in OLD, skipped: ${missing.join(", ")}`);

  const oldCount = await count(oldDb, spec.schema, spec.table);
  const before = await count(newDb, spec.schema, spec.table);
  if (dryRun) return { table: label, old: oldCount, before, after: before };

  const names = common.map((c) => c.name);
  const quoted = names.map((n) => `"${n}"`).join(", ");
  const target = `${spec.schema}.${spec.table}`;
  const onConflict = spec.upsert
    ? `on conflict (id) do update set ${names
        .filter((n) => n !== "id")
        .map((n) => `"${n}" = excluded."${n}"`)
        .join(", ")}`
    : "on conflict do nothing";
  const rows = await oldDb<Row[]>`select ${oldDb(names)} from ${oldDb(target)}`;
  for (let i = 0; i < rows.length; i += CHUNK) {
    // json_populate_recordset does the type work: timestamps, enums, jsonb and
    // uuid[] all come back exactly as they were, with no client-side inference.
    //
    // The parameter is bound as TEXT, then cast to json server-side. Binding it
    // as `$1::json` makes the server describe the parameter as json, and
    // postgres.js then runs its json serializer over the already-stringified
    // value — a second JSON.stringify — so Postgres receives a JSON *string*
    // and fails with "cannot call json_populate_recordset on a scalar".
    await newDb.unsafe(
      `insert into ${target} (${quoted})
       select ${quoted} from json_populate_recordset(null::${target}, $1::text::json)
       ${onConflict}`,
      [JSON.stringify(rows.slice(i, i + CHUNK))],
    );
  }
  const after = await count(newDb, spec.schema, spec.table);
  return { table: label, old: oldCount, before, after };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const oldUrl = requireEnv("OLD_DATABASE_URL");
  const newUrl = requireEnv("NEW_DATABASE_URL");

  const oldHost = hostOf(oldUrl);
  const newHost = hostOf(newUrl);
  const newUser = new URL(newUrl).username;
  if (!newUser.endsWith(NEW_PROJECT_REF)) {
    throw new Error(`NEW_DATABASE_URL user "${newUser}" is not the new project (${NEW_PROJECT_REF}). Refusing.`);
  }
  if (oldUrl === newUrl) throw new Error("OLD and NEW are the same URL. Refusing.");
  console.log(`old: ${oldHost}\nnew: ${newHost}${dryRun ? "\n(dry run — no writes)" : ""}`);

  const oldDb = postgres(oldUrl, { prepare: false, max: 1, connect_timeout: 20, onnotice: () => {} });
  const newDb = postgres(newUrl, { prepare: false, max: 1, connect_timeout: 20, onnotice: () => {} });
  try {
    const journal = await newDb<{ r: string | null }[]>`select to_regclass('drizzle.__drizzle_migrations') as r`;
    if (!journal[0].r) throw new Error("NEW project has no schema yet. Run `npm run db:migrate` (--env prod) first.");
    const populated = await count(newDb, "public", "syllabi");
    if (populated > 0 && !force && !dryRun) {
      throw new Error(`NEW project already has ${populated} syllabi. Re-run with --force to upsert on top.`);
    }

    const results = [];
    for (const spec of TABLES) {
      let r: Awaited<ReturnType<typeof copyTable>>;
      try {
        r = await copyTable(oldDb, newDb, spec, dryRun);
      } catch (err: unknown) {
        // Name the table so a mid-run failure is diagnosable from the output
        // alone. Earlier tables are already committed (one statement per
        // chunk, no wrapping transaction); the re-run is safe because every
        // insert is ON CONFLICT DO NOTHING / DO UPDATE.
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`while copying ${spec.schema}.${spec.table}: ${msg}`);
      }
      results.push(r);
      const ok = r.after === r.old ? "✓" : dryRun ? " " : "!";
      console.log(`  ${ok} ${r.table.padEnd(28)} old=${String(r.old).padStart(6)}  new before=${String(r.before).padStart(6)}  after=${String(r.after).padStart(6)}`);
    }
    const mismatched = results.filter((r) => !dryRun && r.after !== r.old);
    console.log(
      mismatched.length
        ? `\n${mismatched.length} table(s) do not match — inspect before pushing.`
        : dryRun
          ? "\ndry run complete."
          : "\nall tables match old counts.",
    );
    if (mismatched.length) process.exitCode = 2;
  } finally {
    await Promise.all([oldDb.end(), newDb.end()]);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
