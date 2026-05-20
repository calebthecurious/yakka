import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const postgres = (await import("postgres")).default;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const sql = postgres(url, { prepare: false });

  console.log("[reset] checking current state...");
  const tables = await sql<{ tablename: string; schemaname: string }[]>`
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('public', 'drizzle')
    ORDER BY schemaname, tablename
  `;
  console.log(
    "[reset] tables before:",
    tables.length === 0 ? "(none)" : tables.map((t) => `${t.schemaname}.${t.tablename}`).join(", "),
  );

  console.log("[reset] dropping public + drizzle schemas...");
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await sql.unsafe("CREATE SCHEMA public");
  await sql.unsafe("GRANT ALL ON SCHEMA public TO public");
  await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");

  console.log("[reset] done. Run `npx drizzle-kit migrate` next.");
  await sql.end();
}

main().catch((err) => {
  console.error("[reset] failed:", err);
  process.exit(1);
});
