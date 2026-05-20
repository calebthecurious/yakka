import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const id = process.argv[2];
  if (!id) {
    console.error("usage: tsx scripts/inspect-syllabus.ts <id>");
    process.exit(1);
  }
  const rows = await sql<
    { target_role: string; target_company: string | null; jd_head: string }[]
  >`
    SELECT target_role, target_company,
           LEFT(job_description_text, 400) AS jd_head
    FROM syllabi
    WHERE id = ${id}
  `;
  if (rows.length === 0) {
    console.log("(no syllabus with that id)");
  } else {
    const r = rows[0];
    console.log("target_role:", r.target_role);
    console.log("target_company:", r.target_company);
    console.log("---jd (first 400 chars)---");
    console.log(r.jd_head);
  }
  await sql.end();
}
main();
