/**
 * Metrics script v2 (Upgrade Plan 8.3 → Plan v2 A8.3 "the seven numbers",
 * plus the W-4 wedge lines). READ-ONLY. SQL + printing, no dashboard.
 *
 *   npm run metrics:dev                     rolling: last 7 days, as of now
 *   npm run metrics                         same, against prod
 *   tsx scripts/metrics.ts --env prod --month 2026-09
 *                                           month mode: window = that month,
 *                                           cumulative numbers as of its end
 *   npm run metrics:snapshot                prod, previous month, writes
 *                                           metrics/YYYY-MM.json (commit it)
 *   tsx scripts/metrics.ts --env prod --snapshot --backfill 2026-05..2026-09
 *                                           one snapshot file per month
 *
 * Target resolution is the migrate script's (scripts/migrate-guard.ts):
 * `--env dev` → DEV_DATABASE_URL (loopback only); `--env prod` →
 * PROD_DATABASE_URL from process.env ONLY. Every query runs inside one
 * transaction SET READ ONLY, so this script cannot write to the database
 * even by accident. The connection string is never printed.
 *
 * Honesty rules:
 *  - A number whose source table/column does not exist on the target yet
 *    (e.g. prod before migrations 0016/0017) renders "not yet instrumented —
 *    migration NNNN pending on this database", never 0.
 *  - MRR (Stripe, A8) and displacement events (S-5) render "not yet
 *    instrumented" until those exist.
 *  - Workspace VISITS are not recorded anywhere; "active" means an evidence
 *    event or a logged learning session.
 *  - "activated" is users with a syllabus currently in status 'ready' that
 *    was created before the window end — status is not historical, so a
 *    backfilled month reads today's status for rows that existed then.
 *
 * Definitions (hand-countable; the W-4 DoD is a side-by-side count):
 *  signup        a row in public.profiles (cumulative as of window end)
 *  activated     a user with ≥1 syllabus in status 'ready' created before window end
 *  evidence event a competency check completed at ≥ PASS_BAR, or an artefact
 *                with verified_at set — the ledger's two sources
 *  active        a user with an evidence event OR a logged learning session in the window
 *  shared externally  a profile with ≥1 non-owner view event carrying a
 *                referrer host or a utm_source (cumulative and in-window)
 *  W4 return     current_role workspaces ≥28 days old at window end whose user
 *                had activity in days 22–28 after creation (metrics-lib.ts)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import postgres from "postgres";
import { parseEnvFlag, resolveTarget } from "./migrate-guard";
import { PASS_BAR } from "../src/lib/readiness/model";
import {
  DAY_MS,
  WEEK_DAYS,
  cohortLine,
  fmtMetric,
  monthBounds,
  monthRange,
  previousMonth,
  week4Cohort,
  type Activity,
  type MetricsSnapshot,
  type Workspace,
} from "./metrics-lib";

const SNAPSHOT_DIR = path.resolve("metrics");

function loadVars(): Record<string, string | undefined> {
  let fileVars: Record<string, string> = {};
  try {
    fileVars = parse(readFileSync(".env.local", "utf8"));
  } catch {
    /* no .env.local */
  }
  return {
    DEV_DATABASE_URL: process.env.DEV_DATABASE_URL ?? fileVars.DEV_DATABASE_URL,
    PROD_DATABASE_URL: process.env.PROD_DATABASE_URL, // never from a file
  };
}

function flag(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  if (i === -1) return null;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : "";
}

type Row<T> = T[];
type Sql = ReturnType<typeof postgres>;

interface Window {
  label: string;
  from: string; // ISO, inclusive
  to: string; // ISO, exclusive
}

/** Compute every number for one window. Read-only. */
async function compute(sql: Sql, env: "dev" | "prod", w: Window, nowIso: string): Promise<MetricsSnapshot> {
  const from = new Date(w.from);
  const to = new Date(w.to);
  // Cohort "as of": a month still in progress is judged at now, not at its
  // end — otherwise a 3-day-old workspace reads as 29 days old on the 3rd.
  const asOf = w.to < nowIso ? w.to : nowIso;
  const snap: MetricsSnapshot = {
    schema: 1,
    month: w.label,
    window: { from: w.from, to: w.to },
    env,
    generatedAt: new Date().toISOString(),
    cumulative: { signups: 0, activated: 0, profilesSharedExternally: 0, currentRoleWorkspaces: 0 },
    inWindow: {
      evidenceEvents: 0,
      activeUsers: 0,
      profilesSharedExternally: 0,
      currentRoleWorkspacesCreated: 0,
      currentRoleActiveUsers: 0,
    },
    week4Return: { eligible: 0, returned: 0, ratePct: null },
    mrr: { notInstrumented: "Stripe (A8 billing not built)" },
    displacementEvents: { notInstrumented: "S-5 not built" },
  };

  await sql.begin(async (tx) => {
    await tx`set transaction read only`;

    // What does this database have? (prod before the G3 batch lacks both.)
    const [{ pve }] = await tx<Row<{ pve: string | null }>>`select to_regclass('public.profile_view_events')::text as pve`;
    const hasEvents = pve != null;
    const [{ n: hasPurposeN }] = await tx<Row<{ n: number }>>`
      select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='syllabi' and column_name='purpose'`;
    const hasPurpose = hasPurposeN > 0;

    // ── cumulative as of window end ─────────────────────────────────────
    const [{ signups }] = await tx<Row<{ signups: number }>>`select count(*)::int as signups from profiles where created_at < ${to}`;
    const [{ activated }] = await tx<Row<{ activated: number }>>`
      select count(distinct user_id)::int as activated from syllabi where status = 'ready' and user_id is not null and created_at < ${to}`;
    snap.cumulative.signups = signups;
    snap.cumulative.activated = activated;

    // ── activity (all time ≤ window end; filtered per use) ──────────────
    const passedChecks = await tx<Row<{ user_id: string; at: Date }>>`
      select s.user_id, cc.completed_at as at
      from competency_checks cc
      join concepts k on k.id = cc.concept_id
      join sub_skills ss on ss.id = k.sub_skill_id
      join skill_clusters c on c.id = ss.cluster_id
      join syllabi s on s.id = c.syllabus_id
      where cc.completed_at is not null and cc.completed_at < ${to} and cc.score >= ${PASS_BAR} and s.user_id is not null`;
    const verifiedArtefacts = await tx<Row<{ user_id: string; at: Date }>>`
      select s.user_id, a.verified_at as at
      from artefacts a
      join sub_skills ss on ss.id = a.sub_skill_id
      join skill_clusters c on c.id = ss.cluster_id
      join syllabi s on s.id = c.syllabus_id
      where a.verified_at is not null and a.verified_at < ${to} and s.user_id is not null`;
    const sessions = await tx<Row<{ user_id: string; at: Date }>>`
      select s.user_id, ls.created_at as at
      from learning_sessions ls
      join concepts k on k.id = ls.concept_id
      join sub_skills ss on ss.id = k.sub_skill_id
      join skill_clusters c on c.id = ss.cluster_id
      join syllabi s on s.id = c.syllabus_id
      where ls.created_at < ${to} and s.user_id is not null`;
    const toIso = (r: { user_id: string; at: Date }): Activity => ({ userId: r.user_id, at: new Date(r.at).toISOString() });
    const evidence = [...passedChecks, ...verifiedArtefacts].map(toIso);
    const activity = [...evidence, ...sessions.map(toIso)];
    const inWin = (a: Activity) => Date.parse(a.at) >= from.getTime() && Date.parse(a.at) < to.getTime();
    snap.inWindow.evidenceEvents = evidence.filter(inWin).length;
    const activeUsers = new Set(activity.filter(inWin).map((a) => a.userId));
    snap.inWindow.activeUsers = activeUsers.size;

    // ── shared externally (needs 0016) ──────────────────────────────────
    if (hasEvents) {
      const [{ shared, shared_in }] = await tx<Row<{ shared: number; shared_in: number }>>`
        select count(distinct profile_id) filter (where created_at < ${to})::int as shared,
               count(distinct profile_id) filter (where created_at >= ${from} and created_at < ${to})::int as shared_in
        from profile_view_events
        where is_owner = false and (referrer_host is not null or utm_source is not null)`;
      snap.cumulative.profilesSharedExternally = shared;
      snap.inWindow.profilesSharedExternally = shared_in;
    } else {
      const why = { notInstrumented: "migration 0016 (profile_view_events) pending on this database" };
      snap.cumulative.profilesSharedExternally = why;
      snap.inWindow.profilesSharedExternally = why;
    }

    // ── W-4 wedge lines (need 0017) ─────────────────────────────────────
    if (hasPurpose) {
      const raw = await tx<Row<{ id: string; user_id: string | null; created_at: Date }>>`
        select id, user_id, created_at from syllabi where purpose = 'current_role' and created_at < ${to} order by created_at`;
      const workspaces: Workspace[] = raw.map((r) => ({
        syllabusId: r.id,
        userId: r.user_id,
        createdAt: new Date(r.created_at).toISOString(),
      }));
      snap.cumulative.currentRoleWorkspaces = workspaces.length;
      snap.inWindow.currentRoleWorkspacesCreated = workspaces.filter((x) => Date.parse(x.createdAt) >= from.getTime()).length;
      const crUsers = new Set(workspaces.map((x) => x.userId).filter((u): u is string => u != null));
      snap.inWindow.currentRoleActiveUsers = [...activeUsers].filter((u) => crUsers.has(u)).length;
      const c = week4Cohort(workspaces, activity, asOf);
      snap.week4Return = { eligible: c.eligible, returned: c.returned, ratePct: c.ratePct };
      (snap as MetricsSnapshot & { _cohortLine?: string })._cohortLine = cohortLine(c);
    } else {
      const why = { notInstrumented: "migration 0017 (syllabi.purpose) pending on this database" };
      snap.cumulative.currentRoleWorkspaces = why;
      snap.inWindow.currentRoleWorkspacesCreated = why;
      snap.inWindow.currentRoleActiveUsers = why;
      snap.week4Return = why;
    }
  });
  return snap;
}

function print(snap: MetricsSnapshot, rolling: boolean) {
  const rows: Array<[string, string]> = [
    [rolling ? "signups (profiles, to date)" : "signups (profiles, cumulative at month end)", fmtMetric(snap.cumulative.signups)],
    ["activated (≥1 ready syllabus)", fmtMetric(snap.cumulative.activated)],
    [`evidence events in window (passed checks + verified artefacts)`, fmtMetric(snap.inWindow.evidenceEvents)],
    [`active users in window (evidence or logged session)`, fmtMetric(snap.inWindow.activeUsers)],
    ["profiles shared externally (cumulative / in window)", `${fmtMetric(snap.cumulative.profilesSharedExternally)} / ${fmtMetric(snap.inWindow.profilesSharedExternally)}`],
    ["MRR (candidate + employer)", fmtMetric(snap.mrr)],
    ["displacement events", fmtMetric(snap.displacementEvents)],
    ["current_role workspaces (cumulative / created in window)", `${fmtMetric(snap.cumulative.currentRoleWorkspaces)} / ${fmtMetric(snap.inWindow.currentRoleWorkspacesCreated)}`],
    ["current_role users active in window", fmtMetric(snap.inWindow.currentRoleActiveUsers)],
    ["workspace visits", "not yet instrumented — not recorded; profile_view_events covers public-profile views only"],
    [
      "week-4 return (current_role cohort, as of window end)",
      "notInstrumented" in snap.week4Return
        ? fmtMetric(snap.week4Return)
        : ((snap as MetricsSnapshot & { _cohortLine?: string })._cohortLine ?? ""),
    ],
  ];
  const width = Math.max(...rows.map(([k]) => k.length));
  for (const [k, v] of rows) console.log(`${k.padEnd(width)}  ${v}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const env = parseEnvFlag(argv);
  const target = resolveTarget(env, loadVars());
  const sql = postgres(target.url, { prepare: false, max: 1, onnotice: () => {} });
  const nowIso = new Date().toISOString();

  const snapshot = argv.includes("--snapshot");
  const backfill = flag(argv, "--backfill"); // "YYYY-MM..YYYY-MM"
  const month = flag(argv, "--month"); // "YYYY-MM"

  let windows: Window[];
  let rolling = false;
  if (backfill) {
    const [a, b] = backfill.split("..");
    const months = monthRange(a, b ?? a);
    if (months.length === 0) throw new Error(`--backfill wants YYYY-MM..YYYY-MM, got "${backfill}"`);
    windows = months.map((m) => monthBounds(m)!).map((b) => ({ label: b.label, from: b.from, to: b.to }));
  } else if (month != null || snapshot) {
    const m = month && month.length > 0 ? month : previousMonth(nowIso);
    const b = monthBounds(m);
    if (!b) throw new Error(`--month wants YYYY-MM, got "${m}"`);
    windows = [{ label: b.label, from: b.from, to: b.to }];
  } else {
    rolling = true;
    const to = new Date(nowIso);
    const from = new Date(to.getTime() - WEEK_DAYS * DAY_MS);
    windows = [{ label: `rolling-${WEEK_DAYS}d`, from: from.toISOString(), to: to.toISOString() }];
  }

  console.log(`metrics · env=${env} · host=${target.host} · ${rolling ? `rolling ${WEEK_DAYS}d as of ${nowIso}` : `month mode`}`);
  console.log("read-only transaction; nothing is written to the database\n");

  for (const w of windows) {
    const snap = await compute(sql, env, w, nowIso);
    if (!rolling) console.log(`── ${w.label}  [${w.from} … ${w.to})`);
    print(snap, rolling);
    if (snapshot) {
      mkdirSync(SNAPSHOT_DIR, { recursive: true });
      const file = path.join(SNAPSHOT_DIR, `${w.label}.json`);
      const { _cohortLine: _drop, ...clean } = snap as MetricsSnapshot & { _cohortLine?: string };
      void _drop;
      writeFileSync(file, JSON.stringify(clean, null, 2) + "\n");
      console.log(`→ wrote ${path.relative(process.cwd(), file)}`);
    }
    console.log();
  }
  await sql.end();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
