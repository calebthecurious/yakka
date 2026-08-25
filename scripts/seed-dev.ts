/**
 * Seed the LOCAL dev database with a fixture workspace.
 *
 *   npm run db:migrate:dev   # first
 *   npm run db:seed:dev      # idempotent — run as often as you like
 *
 * Targets only DEV_* env (scripts/dev-db.ts); refuses non-loopback hosts.
 *
 * Idempotency: every row has a FIXED uuid and is inserted with
 * `onConflictDoNothing` (profiles: upsert, so handle edits re-apply). Users are
 * looked up by email before creation. Running twice yields identical counts.
 *
 * Users are created through the Supabase Auth admin API (service role) rather
 * than a raw `auth.users` insert: GoTrue owns password hashing and the
 * identities row, and the `on_auth_user_created_create_profile` trigger from
 * migration 0005_auth then creates the profile exactly as it does in prod.
 * All three log in with FIXTURE_PASSWORD at /login (local stack only).
 *
 * Fixture users (all @fixture.local — the address never resolves):
 *   Fixture Fiona   fiona@fixture.local   ready syllabus, public profile,
 *                                         concepts in every evidence state,
 *                                         one verified artefact
 *   Fixture Fergus  fergus@fixture.local  syllabus wedged mid-'generating'
 *                                         with a stale claim clock (P3.1
 *                                         backstop drill)
 *   Fixture Fatima  fatima@fixture.local  no syllabus (empty-state user)
 *
 * Evidence states on Fiona's syllabus (see src/lib/readiness/model.ts):
 *   verified by passed check         Sampling and aliasing        score 5
 *   failed check (retake)            FIR and IIR filters          score 2
 *   evidence WITHOUT a check         FFT and spectral estimation  artefact only
 *   self-assessed only               Windowing functions          status=understood, no evidence
 *   attempted, not completed         Ring buffers and latency     check row, score null
 *   resource completed, no check     Epoching                     → take_check CTA
 *   untouched                        the rest
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { assertLoopback, connectDev, loadDevEnv } from "./dev-db";

const {
  profiles,
  syllabi,
  skillClusters,
  subSkills,
  concepts,
  resources,
  artefacts,
  competencyChecks,
  learningSessions,
  foundationItems,
} = schema;

/** Local-stack-only login password for the three fixture users. Not a secret:
 * the accounts exist only in the throwaway docker database. */
export const FIXTURE_PASSWORD = "fixture-pass-2026";

const USERS = [
  { key: "fiona", email: "fiona@fixture.local", displayName: "Fixture Fiona", handle: "fixture-fiona" },
  { key: "fergus", email: "fergus@fixture.local", displayName: "Fixture Fergus", handle: "fixture-fergus" },
  { key: "fatima", email: "fatima@fixture.local", displayName: "Fixture Fatima", handle: "fixture-fatima" },
] as const;
type UserKey = (typeof USERS)[number]["key"];

/* Fixed ids. The "f1x7" prefix marks them as fixtures in any query output. */
const ID = {
  syllabusReady: "f1f70000-0000-4000-8000-000000000001",
  syllabusWedged: "f1f70000-0000-4000-8000-000000000002",
  clusterSignal: "f1f70000-0000-4000-8000-000000000101",
  clusterRegulatory: "f1f70000-0000-4000-8000-000000000102",
  clusterComms: "f1f70000-0000-4000-8000-000000000103",
  clusterWedged: "f1f70000-0000-4000-8000-000000000104",
  subFiltering: "f1f70000-0000-4000-8000-000000000201",
  subStreaming: "f1f70000-0000-4000-8000-000000000202",
  subTga: "f1f70000-0000-4000-8000-000000000203",
  subClinicians: "f1f70000-0000-4000-8000-000000000204",
  subWedgedRunning: "f1f70000-0000-4000-8000-000000000205",
  subWedgedPending: "f1f70000-0000-4000-8000-000000000206",
  cSampling: "f1f70000-0000-4000-8000-000000000301",
  cFilters: "f1f70000-0000-4000-8000-000000000302",
  cFft: "f1f70000-0000-4000-8000-000000000303",
  cWindowing: "f1f70000-0000-4000-8000-000000000304",
  cArtefactRejection: "f1f70000-0000-4000-8000-000000000305",
  cEpoching: "f1f70000-0000-4000-8000-000000000306",
  cRingBuffers: "f1f70000-0000-4000-8000-000000000307",
  cBackpressure: "f1f70000-0000-4000-8000-000000000308",
  cTgaClass: "f1f70000-0000-4000-8000-000000000309",
  cEssentialPrinciples: "f1f70000-0000-4000-8000-000000000310",
  cExplaining: "f1f70000-0000-4000-8000-000000000311",
  artefactDemo: "f1f70000-0000-4000-8000-000000000401",
  checkSamplingPass: "f1f70000-0000-4000-8000-000000000501",
  checkFiltersFail: "f1f70000-0000-4000-8000-000000000502",
  checkTgaPass: "f1f70000-0000-4000-8000-000000000503",
  checkRingOpen: "f1f70000-0000-4000-8000-000000000504",
  sessionSampling: "f1f70000-0000-4000-8000-000000000601",
  sessionFilters: "f1f70000-0000-4000-8000-000000000602",
  foundationBaselineHave: "f1f70000-0000-4000-8000-000000000701",
  foundationBaselineNeed: "f1f70000-0000-4000-8000-000000000702",
  foundationLaunch: "f1f70000-0000-4000-8000-000000000703",
} as const;

/** Deterministic resource ids: concept index + slot. */
function resourceId(conceptIdx: number, slot: number): string {
  return `f1f70000-0000-4000-8000-000000008${String(conceptIdx).padStart(2, "0")}${slot}`;
}

const DAYS = 24 * 60 * 60 * 1000;
const NOW = new Date();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAYS);
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 60 * 60 * 1000);

const FIXTURE_MODEL = "fixture-seed";

const QUESTIONS = [
  {
    question: "What is the Nyquist rate for a signal band-limited to 100 Hz?",
    options: ["50 Hz", "100 Hz", "200 Hz", "400 Hz"],
    correctIndex: 2,
    explanation: "Sampling must be at least twice the highest frequency component.",
  },
];

interface GoTrueUser {
  id: string;
  email?: string;
}

/** Minimal GoTrue admin client. supabase-js is avoided on purpose: on Node 20
 * its realtime module throws at construction without a WebSocket global, and a
 * seed script has no use for realtime anyway. */
function gotrueAdmin(env: ReturnType<typeof loadDevEnv>) {
  const base = `${env.DEV_SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users`;
  const headers = {
    apikey: env.DEV_SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.DEV_SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
  return {
    async list(): Promise<GoTrueUser[]> {
      const res = await fetch(`${base}?per_page=1000`, { headers });
      if (!res.ok) throw new Error(`GoTrue list users: ${res.status} ${await res.text()}`);
      const body = (await res.json()) as { users: GoTrueUser[] };
      return body.users;
    },
    async create(input: {
      email: string;
      password: string;
      user_metadata: Record<string, string>;
    }): Promise<GoTrueUser> {
      const res = await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...input, email_confirm: true }),
      });
      if (!res.ok) throw new Error(`GoTrue create user: ${res.status} ${await res.text()}`);
      return (await res.json()) as GoTrueUser;
    },
  };
}

async function ensureUsers(env: ReturnType<typeof loadDevEnv>): Promise<Record<UserKey, string>> {
  assertLoopback(env.DEV_SUPABASE_URL, "DEV_SUPABASE_URL");
  const admin = gotrueAdmin(env);
  const byEmail = new Map((await admin.list()).map((u) => [u.email?.toLowerCase(), u.id]));

  const ids = {} as Record<UserKey, string>;
  for (const u of USERS) {
    const existing = byEmail.get(u.email);
    if (existing) {
      ids[u.key] = existing;
      console.log(`  = user ${u.email}  exists`);
      continue;
    }
    const created = await admin.create({
      email: u.email,
      password: FIXTURE_PASSWORD,
      user_metadata: { display_name: u.displayName },
    });
    ids[u.key] = created.id;
    console.log(`  + user ${u.email}  created`);
  }
  return ids;
}

async function main() {
  const env = loadDevEnv();
  const client = connectDev(env);
  const db = drizzle(client, { schema });

  try {
    console.log("users (auth admin API):");
    const uid = await ensureUsers(env);

    // Profiles are created by the 0005_auth trigger; upsert the fixture fields.
    for (const u of USERS) {
      await db
        .insert(profiles)
        .values({ id: uid[u.key], handle: u.handle, displayName: u.displayName })
        .onConflictDoUpdate({
          target: profiles.id,
          set: { handle: u.handle, displayName: u.displayName },
        });
    }
    await db
      .update(profiles)
      .set({
        headline: "Fixture profile — self-taught signal-processing learner (seed data, not a real person)",
        githubUrl: "https://example.com/fixture-fiona",
      })
      .where(sql`${profiles.id} = ${uid.fiona}`);

    /* ── Fiona: READY syllabus, featured on her public profile ──────────── */
    await db
      .insert(syllabi)
      .values([
        {
          id: ID.syllabusReady,
          userId: uid.fiona,
          targetRole: "Neurotech Signal Processing Engineer (fixture)",
          targetCompany: "Fixture Neuro Pty Ltd",
          roleNature: "technical",
          isFeaturedOnProfile: true,
          jobDescriptionText:
            "FIXTURE JOB DESCRIPTION. Build real-time EEG signal pipelines: filtering, artefact rejection, spectral features, streaming inference. Familiarity with TGA medical device classification. Communicate results to clinicians.",
          metadata: {
            structuralBlockers: [],
            alternativeTargetBranches: [],
            currentSkills: "FIXTURE RESUME: 2 years Python, some TypeScript, hobby EEG projects.",
          },
          status: "ready",
          skeletonStatus: "complete",
          createdAt: daysAgo(30),
          updatedAt: daysAgo(1),
        },
        /* ── Fergus: WEDGED mid-generation. Skeleton done, one sub-skill unit
         * has been 'running' for 3h (stale claim clock) and one is still
         * pending. updated_at is equally stale. This is the P3.1 backstop
         * drill fixture: a healthy worker should reclaim + finish it. */
        {
          id: ID.syllabusWedged,
          userId: uid.fergus,
          targetRole: "Clinical Data Engineer (fixture, wedged)",
          targetCompany: "Fixture Health Co",
          roleNature: "hybrid",
          jobDescriptionText:
            "FIXTURE JOB DESCRIPTION. This syllabus is deliberately stuck in 'generating' for backstop testing.",
          status: "generating",
          skeletonStatus: "complete",
          createdAt: hoursAgo(4),
          updatedAt: hoursAgo(3),
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(skillClusters)
      .values([
        {
          id: ID.clusterSignal,
          syllabusId: ID.syllabusReady,
          name: "Signal Processing Fundamentals",
          description: "Filtering, spectral analysis and real-time handling of physiological signals.",
          orderIndex: 0,
          weight: 5,
          type: "technical",
          isArtefactBearing: true,
          suggestedArtefact: {
            type: "project",
            title: "Real-time EEG streaming inference demo",
            description: "Replay a PhysioNet EEG recording as a live stream, filter and classify in flight, visualise in the browser.",
            acceptanceCriteria: [
              "Streams a PhysioNet EDF at real-time rate",
              "Applies a band-pass filter with <50 ms added latency",
              "Renders signal + model output in the browser",
            ],
          },
          artefactTarget: {
            title: "Real-time EEG streaming inference demo",
            description: "A working streaming pipeline with tests.",
            employerValue: "Shows the candidate can ingest, process and visualise physiological data in real time — the daily work of the role.",
            demonstratesConceptIds: [ID.cSampling, ID.cFft, ID.cRingBuffers],
          },
          artefactStatus: "complete",
        },
        {
          id: ID.clusterRegulatory,
          syllabusId: ID.syllabusReady,
          name: "Medical Device Regulation (AU)",
          description: "TGA classification and essential principles for software as a medical device.",
          orderIndex: 1,
          weight: 3,
          type: "domain",
          isArtefactBearing: false,
          artefactStatus: "complete",
        },
        {
          id: ID.clusterComms,
          syllabusId: ID.syllabusReady,
          name: "Clinical Communication",
          description: "Explaining signal-derived findings to clinicians without overclaiming.",
          orderIndex: 2,
          weight: 2,
          type: "soft",
          isArtefactBearing: false,
          artefactStatus: "complete",
        },
        {
          id: ID.clusterWedged,
          syllabusId: ID.syllabusWedged,
          name: "Clinical Data Pipelines",
          description: "Fixture cluster on a wedged syllabus.",
          orderIndex: 0,
          weight: 3,
          type: "technical",
          isArtefactBearing: true,
          artefactStatus: "pending",
        },
      ])
      .onConflictDoNothing();

    await db
      .insert(subSkills)
      .values([
        { id: ID.subFiltering, clusterId: ID.clusterSignal, name: "Filtering and Spectral Analysis", description: "Digital filters, FFT and windowing for EEG.", orderIndex: 0, estimatedHours: 20, generationStatus: "complete" },
        { id: ID.subStreaming, clusterId: ID.clusterSignal, name: "Real-time Streaming", description: "Buffers, latency budgets and backpressure.", orderIndex: 1, estimatedHours: 15, generationStatus: "complete" },
        { id: ID.subTga, clusterId: ID.clusterRegulatory, name: "TGA Essentials", description: "Classification rules and essential principles.", orderIndex: 0, estimatedHours: 8, generationStatus: "complete" },
        { id: ID.subClinicians, clusterId: ID.clusterComms, name: "Talking to Clinicians", description: "Framing uncertainty honestly.", orderIndex: 0, estimatedHours: 4, generationStatus: "complete" },
        // Wedged: claimed 3h ago and never settled; plus one never claimed.
        { id: ID.subWedgedRunning, clusterId: ID.clusterWedged, name: "Ingestion (stuck running)", description: "Fixture unit wedged in 'running'.", orderIndex: 0, estimatedHours: 10, generationStatus: "running", generationAttempts: 1, generationStartedAt: hoursAgo(3) },
        { id: ID.subWedgedPending, clusterId: ID.clusterWedged, name: "Validation (never started)", description: "Fixture unit still pending.", orderIndex: 1, estimatedHours: 10, generationStatus: "pending" },
      ])
      .onConflictDoNothing();

    const conceptRows = [
      { id: ID.cSampling, subSkillId: ID.subFiltering, name: "Sampling and aliasing", description: "Nyquist, aliasing and anti-alias filtering.", orderIndex: 0, tier: "foundation", status: "verified" },
      { id: ID.cFilters, subSkillId: ID.subFiltering, name: "FIR and IIR filters", description: "Designing and applying digital filters to EEG.", orderIndex: 1, tier: "intermediate", status: "learning" },
      { id: ID.cFft, subSkillId: ID.subFiltering, name: "FFT and spectral estimation", description: "Power spectra and band power features.", orderIndex: 2, tier: "intermediate", status: "not_started" },
      { id: ID.cWindowing, subSkillId: ID.subFiltering, name: "Windowing functions", description: "Hann, Hamming and leakage trade-offs.", orderIndex: 3, tier: "intermediate", status: "understood" },
      { id: ID.cArtefactRejection, subSkillId: ID.subFiltering, name: "Artefact rejection", description: "Eye-blink and muscle artefact handling.", orderIndex: 4, tier: "advanced", status: "not_started" },
      { id: ID.cEpoching, subSkillId: ID.subFiltering, name: "Epoching", description: "Segmenting continuous signal into analysis windows.", orderIndex: 5, tier: "foundation", status: "not_started" },
      { id: ID.cRingBuffers, subSkillId: ID.subStreaming, name: "Ring buffers and latency", description: "Fixed-size buffers and latency accounting.", orderIndex: 0, tier: "intermediate", status: "learning" },
      { id: ID.cBackpressure, subSkillId: ID.subStreaming, name: "Stream backpressure", description: "What to drop when the consumer is slow.", orderIndex: 1, tier: "advanced", status: "not_started" },
      { id: ID.cTgaClass, subSkillId: ID.subTga, name: "TGA classification rules", description: "Classifying software as a medical device.", orderIndex: 0, tier: "foundation", status: "verified" },
      { id: ID.cEssentialPrinciples, subSkillId: ID.subTga, name: "Essential principles", description: "Safety and performance principles.", orderIndex: 1, tier: "intermediate", status: "not_started" },
      { id: ID.cExplaining, subSkillId: ID.subClinicians, name: "Explaining signal results to clinicians", description: "Uncertainty, limits, and what the model does not show.", orderIndex: 0, tier: "intermediate", status: "not_started" },
    ] as const;
    await db.insert(concepts).values([...conceptRows]).onConflictDoNothing();

    // One AI-suggested primary resource per concept. Only Epoching's is
    // completed (→ take_check CTA); the rest are planned (→ study CTA).
    await db
      .insert(resources)
      .values(
        conceptRows.map((c, i) => ({
          id: resourceId(i, 1),
          conceptId: c.id,
          type: "article" as const,
          title: `Fixture reading: ${c.name}`,
          url: null,
          author: "Fixture Author",
          priority: 1,
          addedByUser: false,
          status: c.id === ID.cEpoching ? ("completed" as const) : ("planned" as const),
          completedAt: c.id === ID.cEpoching ? daysAgo(3) : null,
        })),
      )
      .onConflictDoNothing();

    await db
      .insert(competencyChecks)
      .values([
        { id: ID.checkSamplingPass, conceptId: ID.cSampling, questions: QUESTIONS, score: 5, completedAt: daysAgo(10), createdAt: daysAgo(10) },
        { id: ID.checkFiltersFail, conceptId: ID.cFilters, questions: QUESTIONS, score: 2, completedAt: daysAgo(5), createdAt: daysAgo(5) },
        { id: ID.checkTgaPass, conceptId: ID.cTgaClass, questions: QUESTIONS, score: 4, completedAt: daysAgo(7), createdAt: daysAgo(7) },
        // Attempted, never completed: no score, no completedAt.
        { id: ID.checkRingOpen, conceptId: ID.cRingBuffers, questions: QUESTIONS, score: null, completedAt: null, createdAt: daysAgo(1) },
      ])
      .onConflictDoNothing();

    // The one VERIFIED artefact. Demonstrates FFT (which has NO check —
    // evidence-without-check) and Ring buffers; Sampling is also listed but is
    // already verified by its check.
    await db
      .insert(artefacts)
      .values({
        id: ID.artefactDemo,
        subSkillId: ID.subFiltering,
        type: "project",
        title: "Real-time EEG streaming inference demo (fixture)",
        url: "https://example.com/fixture-fiona/eeg-stream-demo",
        evidenceUrl: "https://example.com/fixture-fiona/eeg-stream-demo#readme",
        description: "FIXTURE. Replays a PhysioNet recording as a live stream and classifies in flight.",
        reflection: "FIXTURE reflection: latency budget was the hard part.",
        acceptanceCriteria: [
          { text: "Streams a PhysioNet EDF at real-time rate", done: true },
          { text: "Applies a band-pass filter with <50 ms added latency", done: true },
          { text: "Renders signal + model output in the browser", done: true },
        ],
        progressLog: [
          { at: daysAgo(12).toISOString(), note: "Streaming loop working." },
          { at: daysAgo(8).toISOString(), note: "Browser view done; verified." },
        ],
        demonstratedConceptIds: [ID.cSampling, ID.cFft, ID.cRingBuffers],
        verifiedAt: daysAgo(8),
        createdAt: daysAgo(14),
        updatedAt: daysAgo(8),
      })
      .onConflictDoNothing();

    await db
      .insert(learningSessions)
      .values([
        { id: ID.sessionSampling, conceptId: ID.cSampling, durationMinutes: 45, notesMarkdown: "FIXTURE notes: Nyquist is 2× the highest component.", createdAt: daysAgo(11) },
        { id: ID.sessionFilters, conceptId: ID.cFilters, durationMinutes: 30, notesMarkdown: "FIXTURE notes: IIR phase distortion caught me out.", createdAt: daysAgo(6) },
      ])
      .onConflictDoNothing();

    await db
      .insert(foundationItems)
      .values([
        { id: ID.foundationBaselineHave, syllabusId: ID.syllabusReady, type: "assumed_baseline", title: "Python fluency", description: "Comfortable with numpy and async I/O.", sequenceIndex: 0, userStatus: "have_it", resumeSignal: "Resume lists 2 years of Python.", model: FIXTURE_MODEL },
        { id: ID.foundationBaselineNeed, syllabusId: ID.syllabusReady, type: "assumed_baseline", title: "Linear algebra basics", description: "Vectors, matrices, projections.", sequenceIndex: 1, userStatus: "need_it", model: FIXTURE_MODEL },
        { id: ID.foundationLaunch, syllabusId: ID.syllabusReady, type: "launch_step", title: "Start with sampling theory", description: "The foundation-tier concept everything else builds on.", sequenceIndex: 0, linkedConceptId: ID.cSampling, userStatus: "unset", model: FIXTURE_MODEL },
      ])
      .onConflictDoNothing();

    /* ── Row counts (the idempotency evidence) ────────────────────────── */
    const tables = [
      "profiles", "syllabi", "skill_clusters", "sub_skills", "concepts", "resources",
      "artefacts", "competency_checks", "learning_sessions", "foundation_items",
    ];
    console.log("\nrow counts:");
    const authCount = await client<{ n: number }[]>`select count(*)::int as n from auth.users`;
    console.log(`  ${"auth.users".padEnd(20)} ${authCount[0].n}`);
    for (const t of tables) {
      const r = await client<{ n: number }[]>`select count(*)::int as n from ${client(t)}`;
      console.log(`  ${t.padEnd(20)} ${r[0].n}`);
    }
    console.log(`\nfixture login: <any fixture email> / ${FIXTURE_PASSWORD}`);
    console.log(`public profile: /u/fixture-fiona   ready syllabus: /syllabi/${ID.syllabusReady}`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
