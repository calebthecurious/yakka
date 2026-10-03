/**
 * Metrics script (Upgrade Plan 8.3 → Plan v2 A8.3 "the seven numbers", plus
 * the W-4 wedge lines). READ-ONLY. SQL + printing, no dashboard.
 *
 *   npm run metrics:dev        →  tsx scripts/metrics.ts --env dev
 *   npm run metrics            →  tsx scripts/metrics.ts --env prod
 *
 * Target resolution is the migrate script's (scripts/migrate-guard.ts):
 * `--env dev` → DEV_DATABASE_URL (loopback only); `--env prod` →
 * PROD_DATABASE_URL from process.env ONLY. Every query runs inside one
 * transaction set READ ONLY, so this script cannot write even by accident.
 * The connection string is never printed.
 *
 * Definitions (each a hand-countable sentence; the W-4 DoD is a side-by-side
 * count against the dev fixtures):
 *  - signup           a row in public.profiles
 *  - activated        a user with ≥1 syllabus in status 'ready'
 *  - evidence event   a competency check completed at ≥ PASS_BAR, or an
 *                     artefact with verified_at set — the ledger's two sources
 *  - active (7d)      a user with an evidence event OR a logged learning
 *                     session in the last 7 days. Workspace VISITS are not
 *                     recorded anywhere (profile_view_events records views of
 *                     PUBLIC profiles), so "visit" is reported as not
 *                     instrumented rather than approximated.
 *  - shared externally  a profile with ≥1 non-owner view event carrying a
 *                     referrer host or a utm_source
 *  - W4 return        current_role workspaces ≥28 days old whose user had
 *                     activity in days 22–28 after creation (metrics-lib.ts)
 *  - paying, displacement   not instrumented until A8 / S-5
 */

import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import postgres from "postgres";
import { parseEnvFlag, resolveTarget } from "./migrate-guard";
import { PASS_BAR } from "../src/lib/readiness/model";
import {
  WEEK_DAYS,
  cohortLine,
  fmtCount,
  week4Cohort,
  type Activity,
  type Workspace,
} from "./metrics-lib";

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

type Row<T> = T[];

async function main() {
  const env = parseEnvFlag(process.argv.slice(2));
  const target = resolveTarget(env, loadVars());
  const sql = postgres(target.url, { prepare: false, max: 1, onnotice: () => {} });
  const now = new Date();
  const nowIso = now.toISOString();
  const since7 = new Date(now.getTime() - WEEK_DAYS * 86_400_000);

  console.log(`metrics · env=${env} · host=${target.host} · as of ${nowIso}`);
  console.log("read-only transaction; nothing is written\n");

  const out: Array<[string, string]> = [];
  await sql.begin(async (tx) => {
    await tx`set transaction read only`;

    // ── the seven numbers ────────────────────────────────────────────────
    const [{ signups }] = await tx<Row<{ signups: number }>>`select count(*)::int as signups from profiles`;
    const [{ activated }] = await tx<Row<{ activated: number }>>`
      select count(distinct user_id)::int as activated from syllabi where status = 'ready' and user_id is not null`;

    // Evidence events: passed checks + verified artefacts, with the user they belong to.
    const passedChecks = await tx<Row<{ user_id: string; at: Date }>>`
      select s.user_id, cc.completed_at as at
      from competency_checks cc
      join concepts k on k.id = cc.concept_id
      join sub_skills ss on ss.id = k.sub_skill_id
      join skill_clusters c on c.id = ss.cluster_id
      join syllabi s on s.id = c.syllabus_id
      where cc.completed_at is not null and cc.score >= ${PASS_BAR} and s.user_id is not null`;
    const verifiedArtefacts = await tx<Row<{ user_id: string; at: Date }>>`
      select s.user_id, a.verified_at as at
      from artefacts a
      join sub_skills ss on ss.id = a.sub_skill_id
      join skill_clusters c on c.id = ss.cluster_id
      join syllabi s on s.id = c.syllabus_id
      where a.verified_at is not null and s.user_id is not null`;
    const sessions = await tx<Row<{ user_id: string; at: Date }>>`
      select s.user_id, ls.created_at as at
      from learning_sessions ls
      join concepts k on k.id = ls.concept_id
      join sub_skills ss on ss.id = k.sub_skill_id
      join skill_clusters c on c.id = ss.cluster_id
      join syllabi s on s.id = c.syllabus_id
      where s.user_id is not null`;

    const evidence: Activity[] = [...passedChecks, ...verifiedArtefacts].map((r) => ({
      userId: r.user_id,
      at: new Date(r.at).toISOString(),
    }));
    const activity: Activity[] = [
      ...evidence,
      ...sessions.map((r) => ({ userId: r.user_id, at: new Date(r.at).toISOString() })),
    ];
    const evidence7 = evidence.filter((e) => Date.parse(e.at) >= since7.getTime());
    const active7 = new Set(activity.filter((a) => Date.parse(a.at) >= since7.getTime()).map((a) => a.userId));

    const [{ shared, shared7 }] = await tx<Row<{ shared: number; shared7: number }>>`
      select count(distinct profile_id)::int as shared,
             count(distinct profile_id) filter (where created_at >= ${since7})::int as shared7
      from profile_view_events
      where is_owner = false and (referrer_host is not null or utm_source is not null)`;

    out.push(["signups (profiles)", String(signups)]);
    out.push(["activated (≥1 ready syllabus)", String(activated)]);
    out.push([`evidence events, last ${WEEK_DAYS}d (passed checks + verified artefacts)`, String(evidence7.length)]);
    out.push([`weekly active users, last ${WEEK_DAYS}d (evidence or logged session)`, String(active7.size)]);
    out.push(["profiles shared externally (all time / 7d)", `${shared} / ${shared7}`]);
    out.push(["paying (candidate + employer MRR)", fmtCount(null, "A8 billing not built")]);
    out.push(["displacement events", fmtCount(null, "S-5 not built")]);

    // ── W-4 wedge lines ──────────────────────────────────────────────────
    const workspacesRaw = await tx<Row<{ id: string; user_id: string | null; created_at: Date; status: string }>>`
      select id, user_id, created_at, status from syllabi where purpose = 'current_role' order by created_at`;
    const workspaces: Workspace[] = workspacesRaw.map((w) => ({
      syllabusId: w.id,
      userId: w.user_id,
      createdAt: new Date(w.created_at).toISOString(),
    }));
    const created7 = workspaces.filter((w) => Date.parse(w.createdAt) >= since7.getTime()).length;
    const crUsers = new Set(workspaces.map((w) => w.userId).filter((u): u is string => u != null));
    const crActive7 = [...active7].filter((u) => crUsers.has(u)).length;

    out.push(["current_role workspaces created (all time / 7d)", `${workspaces.length} / ${created7}`]);
    out.push([`current_role users active, last ${WEEK_DAYS}d`, `${crActive7} of ${crUsers.size}`]);
    out.push(["workspace visits", fmtCount(null, "not recorded; profile_view_events covers public-profile views only")]);
    out.push(["week-4 return (current_role cohort)", cohortLine(week4Cohort(workspaces, activity, nowIso))]);
  });

  const width = Math.max(...out.map(([k]) => k.length));
  for (const [k, v] of out) console.log(`${k.padEnd(width)}  ${v}`);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
