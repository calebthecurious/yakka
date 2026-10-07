/**
 * build-landing-fixture — writes src/data/landing-record.json, the Constellation
 * payload the landing page (/) renders.
 *
 * WHY A BUILD STEP. The landing must show the real product on a real-shaped
 * record without touching the database on every request. So the dev fixture
 * (src/app/u/dev-constellation/fixture.ts) goes through the SAME code the
 * public profile uses — computeReadinessLedger → constellationData — here, at
 * build time, and the page imports the result as static JSON. The page derives
 * nothing: every tier, count, date and label in that file was produced by
 * src/lib/readiness/, which is the single-truth rule applied to a fixture.
 *
 * The companion test (build-landing-fixture.test.ts) regenerates the payload
 * and diffs it against the committed file, so the JSON cannot drift from the
 * ledger code: change the ledger or the fixture, and the test tells you to
 * rerun `npm run landing:fixture`.
 *
 * Usage: tsx scripts/build-landing-fixture.ts   (also runs before `next build`)
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureInput } from "../src/app/u/dev-constellation/fixture";
import {
  constellationData,
  type ConstellationData,
} from "../src/lib/readiness/constellation";
import { computeReadinessLedger } from "../src/lib/readiness/model";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Where the page reads from. Exported so the test diffs the same file. */
export const LANDING_RECORD_PATH = resolve(HERE, "../src/data/landing-record.json");

/** The payload, exactly as the ledger module projects the fixture. Pure. */
export function buildLandingRecord(): ConstellationData {
  const { input, labels } = fixtureInput();
  return constellationData(computeReadinessLedger(input), labels);
}

/** Stable serialisation: 2-space indent, trailing newline, LF. */
export function serializeLandingRecord(data: ConstellationData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function main(): void {
  const data = buildLandingRecord();
  writeFileSync(LANDING_RECORD_PATH, serializeLandingRecord(data), "utf8");
  console.log(
    `landing-record.json — ${data.totals.concepts} concepts, ${data.totals.verified} verified → ${LANDING_RECORD_PATH}`,
  );
}

const invokedDirectly =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
