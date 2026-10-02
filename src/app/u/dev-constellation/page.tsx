import { notFound } from "next/navigation";
import { Constellation } from "@/components/profile/constellation";
import { constellationData } from "@/lib/readiness/constellation";
import { computeReadinessLedger } from "@/lib/readiness/model";
import { fixtureInput } from "./fixture";

/**
 * Dev-only preview of the Constellation on a labelled fixture. Exists so the
 * map can be judged by eye without a database; 404s in production. Not a
 * profile, not a record — the banner says so.
 */
export default function ConstellationPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const { input, labels } = fixtureInput();
  const full = constellationData(computeReadinessLedger(input), labels);

  // A sparse record: one cluster, nothing verified yet.
  const sparse = constellationData(
    computeReadinessLedger({
      ...input,
      clusters: input.clusters.slice(0, 1),
      concepts: input.concepts
        .filter((c) => c.clusterId === "sig")
        .slice(0, 6)
        .map((c) => ({ ...c, status: c.id === "sampling" ? "learning" : "not_started" })),
      competencyChecks: [],
      artefacts: [],
    }),
    labels,
  );

  // No syllabus at all.
  const empty = constellationData(
    computeReadinessLedger({
      clusters: [],
      concepts: [],
      competencyChecks: [],
      artefacts: [],
      foundationItems: [],
    }),
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-5 py-14 sm:px-6">
      <div className="border-border/60 text-muted-foreground rounded-lg border border-dashed px-4 py-2 text-xs">
        Dev fixture preview — not a real profile. Every number and label is
        derived by the ledger module from a labelled fixture input.
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          Full record · {full.totals.concepts} concepts
        </h2>
        <Constellation data={full} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          Sparse record · nothing verified yet
        </h2>
        <Constellation data={sparse} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          Empty · no syllabus
        </h2>
        <Constellation data={empty} />
      </section>
    </main>
  );
}
