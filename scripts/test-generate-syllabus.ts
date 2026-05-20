import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

config({ path: ".env.local" });

async function main() {
  const { generateSyllabus } = await import("@/lib/ai/generate-syllabus");

  const input = {
    targetRole: "Software Engineer, BCI Applications",
    targetCompany: "Neuralink",
    jobDescription: `You will design and build the application-layer software that
turns implant signals into user-facing capabilities. Work closely with neuroscientists,
signal processing engineers, and clinical operators to ship features that go from
research bench to participant use. You will own real-time decoding pipelines, calibration
flows, and the UX through which participants control devices with their thoughts. We
move fast: weekly participant sessions, daily integration with hardware, and the
expectation that you can pick up neuroscience and signal processing context as needed.

Required: production software engineering experience; comfort with low-latency systems;
ability to read primary neuroscience and signal processing papers and turn them into
working code; high ownership; willingness to relocate to Austin/Fremont.`,
    currentSkills: `Self-taught full-stack developer with a business background (Bachelor of
Business in Marketing & Entrepreneurship). Strongest in Next.js, TypeScript, React, and
modern frontend tooling. Comfortable in Python for scripting and ML prototyping. Active
work building agentic AI tooling: LLM orchestration, tool-use design, RAG, evals,
prompt iteration. No formal CS degree; no production experience with signal processing,
real-time systems, or neuroscience.`,
  };

  console.log("[test] generating syllabus for:", input.targetRole, "@", input.targetCompany);
  const startedAt = Date.now();

  const syllabus = await generateSyllabus(input);

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[test] generated in ${elapsedSec}s`);

  const tmpDir = join(process.cwd(), "tmp");
  await mkdir(tmpDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(tmpDir, `syllabus-${timestamp}.json`);
  await writeFile(outPath, JSON.stringify(syllabus, null, 2), "utf8");

  console.log(`[test] wrote ${outPath}`);

  const clusterTypes = syllabus.clusters.map((c) => c.type);
  const conceptCount = syllabus.clusters.reduce(
    (sum, c) =>
      sum + c.subSkills.reduce((s, sk) => s + sk.concepts.length, 0),
    0,
  );
  const resourceCount = syllabus.clusters.reduce(
    (sum, c) =>
      sum +
      c.subSkills.reduce(
        (s, sk) =>
          s + sk.concepts.reduce((r, co) => r + co.suggestedResources.length, 0),
        0,
      ),
    0,
  );

  console.log("\n[test] shape summary:");
  console.log(`  clusters:           ${syllabus.clusters.length}`);
  console.log(`  cluster types:      ${clusterTypes.join(", ")}`);
  console.log(`  sub-skills:         ${syllabus.clusters.reduce((s, c) => s + c.subSkills.length, 0)}`);
  console.log(`  concepts:           ${conceptCount}`);
  console.log(`  resources:          ${resourceCount}`);
  console.log(`  blockers:           ${syllabus.structuralBlockers.length}`);
  console.log(`  alt branches:       ${syllabus.alternativeTargetBranches.length}`);
  console.log(`  has 'soft' cluster: ${clusterTypes.includes("soft")}`);
  console.log(`  has 'domain' cluster: ${clusterTypes.includes("domain")}`);
}

main().catch((err) => {
  console.error("[test] failed:", err);
  process.exit(1);
});
