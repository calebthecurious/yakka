import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const t = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
  `;
  console.log("public tables:", t.map((r) => r.tablename).join(", ") || "(none)");
  await sql.end();
}
main();
