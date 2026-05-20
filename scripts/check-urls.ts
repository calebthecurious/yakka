import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

type Resource = { type: string; title: string; url?: string };

async function main() {
  const tmpDir = join(process.cwd(), "tmp");
  const files = (await readdir(tmpDir))
    .filter((f) => f.startsWith("syllabus-") && f.endsWith(".json"))
    .sort();
  const latest = files[files.length - 1];
  if (!latest) {
    console.error("no syllabus file");
    process.exit(1);
  }
  const raw = await readFile(join(tmpDir, latest), "utf8");
  const syllabus = JSON.parse(raw) as {
    clusters: {
      subSkills: { concepts: { suggestedResources: Resource[] }[] }[];
    }[];
  };
  const all: Resource[] = [];
  for (const c of syllabus.clusters)
    for (const s of c.subSkills)
      for (const cp of s.concepts)
        for (const r of cp.suggestedResources) all.push(r);

  const withUrl = all.filter((r) => r.url && r.url.length > 0);
  const withoutUrl = all.filter((r) => !r.url || r.url.length === 0);

  console.log(`file:        ${latest}`);
  console.log(`total:       ${all.length}`);
  console.log(
    `with url:    ${withUrl.length} (${Math.round((withUrl.length / all.length) * 100)}%)`,
  );
  console.log(`without url: ${withoutUrl.length}`);

  if (withoutUrl.length > 0) {
    console.log("\nmissing url:");
    for (const r of withoutUrl.slice(0, 10)) {
      console.log(`  - [${r.type}] ${r.title}`);
    }
  }
  console.log("\nsample URLs:");
  for (const r of withUrl.slice(0, 8)) {
    console.log(`  - [${r.type}] ${r.title}`);
    console.log(`        ${r.url}`);
  }
}
main();
