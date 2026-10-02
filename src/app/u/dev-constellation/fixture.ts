/**
 * Fixture for the dev-only Constellation preview. NOT a real record — a
 * labelled, deterministic input that exercises every tier and both evidence
 * kinds at a realistic size, so the map can be judged without a database.
 * Mirrors the shape the seed script gives Fixture Fiona, scaled up.
 */

import type { ReadinessInput } from "@/lib/readiness/model";
import type { ConstellationLabels } from "@/lib/readiness/constellation";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000);

/** v = artefact-verified, c = check-passed, s = self-assessed, l = learning, n = not started */
type Kind = "v" | "c" | "s" | "l" | "n";

type Spec = {
  cluster: string;
  clusterName: string;
  weight: number;
  bearing: boolean;
  subSkills: { id: string; concepts: [string, string, Kind][] }[];
};

const SPEC: Spec[] = [
  {
    cluster: "sig",
    clusterName: "Signal processing",
    weight: 5,
    bearing: true,
    subSkills: [
      {
        id: "sig-1",
        concepts: [
          ["sampling", "Sampling and aliasing", "c"],
          ["fir", "FIR and IIR filters", "v"],
          ["notch", "Notch and line-noise removal", "v"],
          ["artefact", "Artefact rejection", "c"],
          ["epoch", "Epoching", "v"],
          ["reref", "Re-referencing", "s"],
        ],
      },
      {
        id: "sig-2",
        concepts: [
          ["fft", "FFT and spectral estimation", "v"],
          ["welch", "Welch's method", "c"],
          ["bands", "Canonical frequency bands", "s"],
          ["tfr", "Time-frequency representations", "l"],
          ["hilbert", "Hilbert transform", "n"],
          ["coh", "Coherence", "n"],
        ],
      },
    ],
  },
  {
    cluster: "ml",
    clusterName: "Decoding and classification",
    weight: 4,
    bearing: true,
    subSkills: [
      {
        id: "ml-1",
        concepts: [
          ["csp", "Common spatial patterns", "v"],
          ["lda", "LDA", "c"],
          ["shrink", "Covariance shrinkage", "c"],
          ["riemann", "Riemannian geometry", "l"],
          ["cv", "Subject-wise cross-validation", "v"],
          ["leak", "Data leakage", "s"],
        ],
      },
      {
        id: "ml-2",
        concepts: [
          ["calib", "Calibration drift", "l"],
          ["transfer", "Transfer learning", "n"],
          ["online", "Online adaptation", "n"],
          ["metrics", "Chance level and significance", "c"],
        ],
      },
    ],
  },
  {
    cluster: "rt",
    clusterName: "Real-time systems",
    weight: 4,
    bearing: true,
    subSkills: [
      {
        id: "rt-1",
        concepts: [
          ["ring", "Ring buffers and latency", "l"],
          ["ws", "WebSocket streaming", "v"],
          ["backpressure", "Backpressure", "s"],
          ["jitter", "Timing jitter", "n"],
          ["rtos", "RTOS basics", "n"],
        ],
      },
    ],
  },
  {
    cluster: "reg",
    clusterName: "Regulatory and clinical",
    weight: 3,
    bearing: false,
    subSkills: [
      {
        id: "reg-1",
        concepts: [
          ["tga", "TGA device classification", "c"],
          ["iec", "IEC 62304", "s"],
          ["risk", "ISO 14971 risk management", "l"],
          ["clin", "Communicating with clinicians", "n"],
          ["privacy", "Health data privacy", "n"],
          ["qms", "Quality management systems", "n"],
        ],
      },
    ],
  },
  {
    cluster: "eng",
    clusterName: "Engineering practice",
    weight: 2,
    bearing: false,
    subSkills: [
      {
        id: "eng-1",
        concepts: [
          ["tests", "Testing scientific code", "c"],
          ["repro", "Reproducible pipelines", "c"],
          ["ci", "Continuous integration", "s"],
          ["docs", "Technical writing", "n"],
        ],
      },
    ],
  },
];

export function fixtureInput(): { input: ReadinessInput; labels: ConstellationLabels } {
  const input: ReadinessInput = {
    clusters: [],
    concepts: [],
    competencyChecks: [],
    artefacts: [],
    foundationItems: [],
  };
  const conceptNames: Record<string, string> = {};
  const clusterNames: Record<string, string> = {};
  const artefactMeta: Record<string, { title: string; url: string }> = {};

  let t = 0;
  for (const c of SPEC) {
    input.clusters.push({ id: c.cluster, weight: c.weight, isArtefactBearing: c.bearing });
    clusterNames[c.cluster] = c.clusterName;
    const demonstrated: string[] = [];
    for (const s of c.subSkills) {
      for (const [id, name, kind] of s.concepts) {
        conceptNames[id] = name;
        const status =
          kind === "v" || kind === "c" || kind === "s"
            ? "understood"
            : kind === "l"
              ? "learning"
              : "not_started";
        input.concepts.push({ id, clusterId: c.cluster, subSkillId: s.id, status });
        t += 1;
        if (kind === "c") {
          input.competencyChecks.push({
            conceptId: id,
            score: 4 + (t % 2),
            completedAt: day(20 + t * 6),
          });
        }
        if (kind === "v") {
          demonstrated.push(id);
          // Some verified concepts also carry a passed check, so rungs 3 and 2 co-exist.
          if (t % 3 === 0) {
            input.competencyChecks.push({ conceptId: id, score: 5, completedAt: day(60 + t * 5) });
          }
        }
        if (kind === "s") {
          // A failed attempt: attempted, not evidence.
          input.competencyChecks.push({ conceptId: id, score: 2, completedAt: day(30 + t * 4) });
        }
      }
    }
    if (c.bearing) {
      const aid = `${c.cluster}-artefact`;
      const title = `${c.clusterName} — working demo`;
      input.artefacts.push({
        id: aid,
        clusterId: c.cluster,
        verifiedAt: day(40 + t * 3),
        demonstratedConceptIds: demonstrated,
        title,
        type: "project",
      });
      artefactMeta[aid] = { title, url: `https://github.com/example/${c.cluster}-demo` };
    }
  }
  // One pending artefact so the unverified-artefact path is exercised too.
  input.artefacts.push({
    id: "eng-draft",
    clusterId: "eng",
    verifiedAt: null,
    demonstratedConceptIds: ["ci"],
    title: "CI writeup (draft)",
    type: "writeup",
  });

  return {
    input,
    labels: { concepts: conceptNames, clusters: clusterNames, artefacts: artefactMeta },
  };
}
