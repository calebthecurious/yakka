# Readiness Ledger — Ground-Truth Recon

> Read-only reconnaissance for an **honest, derived "role-readiness" measure** computed
> only from real completion data. No code was changed. This maps what already exists so
> a v1 ledger can **reuse, not duplicate**.
>
> Scope of evidence: `src/db/schema.ts`, `src/app/syllabi/[id]/*`, `src/app/u/[handle]/page.tsx`,
> `src/app/concepts/[id]/actions.ts`, `src/app/syllabi/[id]/foundations-actions.ts`,
> `src/lib/ownership.ts`, `src/lib/auth.ts`, `src/db/index.ts`, `package.json`.

---

## 1. Schema + enum values (the ground truth a ledger can read)

All tables are Drizzle-defined in `src/db/schema.ts` (single source of truth). Tree shape:
**syllabi → skill_clusters → sub_skills → concepts → resources**, with artefacts hanging
off **sub_skills**.

### Enums relevant to readiness

| Enum (pg name) | Values | Notes |
|---|---|---|
| `concept_status` | `not_started`, `learning`, `understood`, `verified` | **The core progress signal.** `understood`/`verified` = "done". |
| `concept_tier` | `foundation`, `intermediate`, `advanced` | Difficulty *within* the syllabus (NOT the on-ramp). Could weight a ledger. |
| `sub_skill_status` | `not_started`, `in_progress`, `verified` | Exists on `sub_skills.subSkillStatus` but **is not written anywhere** in the read paths I traced — effectively dormant. Don't rely on it. |
| `skill_cluster_type` | `technical`, `domain`, `soft`, `meta` | Drives the Technical/Professional grouping + theming. |
| `role_nature` | `technical`, `non_technical`, `hybrid` | On `syllabi`; badge + cluster mix. |
| `resource_status` | `planned`, `consuming`, `completed`, `abandoned` | `completed` feeds the public "learning trail". |
| `artefact_type` | `project`, `writeup`, `certificate`, `contribution` | |
| `concept_importance` | `core`, `supporting`, `peripheral` | On `concept_relevances` (one-per-concept). **Per-concept weight already exists here** — a ledger could weight by this. |
| `foundation_item_type` | `assumed_baseline`, `launch_step` | The on-ramp (see §2). |
| `foundation_user_status` | `have_it`, `need_it`, `unset` | The persisted baseline self-assessment (see §2). |
| `ai_confidence` | `high`, `low` | Study-brief confidence. |

### `concepts` (the unit of completion) — `src/db/schema.ts:275`
- `id` uuid PK
- `subSkillId` uuid → `sub_skills.id` (cascade)
- `name`, `description` text
- `orderIndex` int default 0
- `tier` `concept_tier` default `intermediate`
- **`status` `concept_status` default `not_started`** ← primary ledger input
- `understoodAt` timestamptz (nullable) — **set to `now()` when status becomes `understood` or `verified`, nulled otherwise** (`concepts/[id]/actions.ts:78`)
- `createdAt`, `updatedAt` timestamptz

### `skill_clusters` — `src/db/schema.ts:215`
- `id`, `syllabusId` → `syllabi.id` (cascade)
- `name`, `description`
- `orderIndex` int default 0
- `weight` int **default 3** (the UI shows "Weight {n}/5", so effectively a 1–5 scale, not enforced) ← natural per-cluster ledger weight
- `type` `skill_cluster_type` default `technical`
- **`isArtefactBearing` boolean default `false`** — true only when the cluster genuinely produces an employer-valuable artefact; soft/knowledge/regulatory clusters are false and are "proven by competency checks", not builds
- `suggestedArtefact` jsonb `SuggestedArtefact | null` — buildable spec `{ type, title, description, acceptanceCriteria[] }`
- **`artefactTarget` jsonb `ClusterArtefactTarget | null`** — `{ title, description, employerValue, demonstratesConceptIds[] }`; null for non-bearing + legacy clusters (UI falls back to `suggestedArtefact`)
- Project scaffolding (on-demand, may be empty): `startingPoint` text, `suggestedApproach` jsonb `ProjectMilestone[]`, `criteriaGuidance` jsonb `CriterionGuidance[]`, `projectResources` jsonb `ProjectResource[]`

### `sub_skills` — `src/db/schema.ts:257`
- `id`, `clusterId` → `skill_clusters.id` (cascade)
- `name`, `description`, `orderIndex`
- **`estimatedHours` int default 0** — summed for the header "~Nh estimated"
- `subSkillStatus` `sub_skill_status` default `not_started` (dormant; see enum note above)

### `artefacts` — `src/db/schema.ts:360`
- `id`, **`subSkillId` → `sub_skills.id`** (artefacts attach at the sub-skill level, NOT the cluster)
- `type` `artefact_type`
- `title`, `url`, `evidenceUrl`, `description`, `reflection`
- `acceptanceCriteria` jsonb `ArtefactCriterion[]` = `{ text, done }[]`
- `progressLog` jsonb `ArtefactProgressEntry[]`
- **`demonstratedConceptIds` jsonb `string[]`** — links the artefact to the concepts it proves (cross-checked against real concept ids on the profile)
- **`verifiedAt` timestamptz (nullable)** — non-null = "completed/verified" (this is the only "done" signal for artefacts; there is no status enum)
- `createdAt`, `updatedAt`

### `gap_reports` — `src/db/schema.ts:565`
- `id`, `syllabusId` → `syllabi.id` (cascade), **unique per syllabus** (`gap_reports_syllabus_id_unq`)
- `strengths` `GapStrength[]` = `{ requirement, evidence }`
- `gapsInProgress` `GapInProgress[]` = `{ requirement, conceptId|null, note }`
- `gapsNotStarted` `GapNotStarted[]` = `{ requirement, conceptId|null, isSyllabusBlindSpot, note }`
- `softSkillGaps` `SoftSkillGap[]`, `signalRecommendations` `SignalRecommendation[]`
- `generatedAt`, `model`
- **This is AI-generated narrative, not a live count** — a snapshot at generation time. Useful as *advisory* context, NOT as a source of truth for a derived ledger (it goes stale the moment a concept status changes).

### "projects" table
**There is no `projects` table.** Per project convention (and `ClusterArtefactTarget` docs): the
**cluster IS the project**. "Project scaffolding" is the set of nullable columns on
`skill_clusters` listed above, generated on demand by `generate-project.ts`. Any ledger notion
of "projects completed" must derive from `artefacts` where `type = 'project'` and `verifiedAt is not null`
(this is exactly what the public profile does — §3).

---

## 2. Where the on-ramp "baselines" / "I have this / I need this" lives

**It is persisted to the DB — it can feed a server-side ledger in v1.**

- Table: **`foundation_items`** (`src/db/schema.ts:708`), one row per syllabus per baseline/launch-step.
- `type` = `assumed_baseline` (prerequisites the syllabus assumes) or `launch_step` (ordered first steps; may point at a real concept via `linkedConceptId`, `ON DELETE SET NULL`).
- **`userStatus` `foundation_user_status` (`have_it` | `need_it` | `unset`) default `unset`** ← the "I have this / I need this" state, **stored in Postgres**, not localStorage.
- `resumeSignal` text (nullable) — advisory note from résumé; **never auto-sets `userStatus`**.

Write path (the *only* writer of `userStatus`):
- `setFoundationItemStatus(itemId, status)` in `src/app/syllabi/[id]/foundations-actions.ts:164` — a server action, Zod-validated, ownership-checked (loads item → checks `item.syllabus.userId === userId`), restricted to `assumed_baseline` items.
- Generation (`generateFoundations`) always leaves `userStatus = 'unset'`, but **carries over prior self-assessment across regeneration keyed by normalized title** (`foundations-actions.ts:87-113`), so regenerating doesn't wipe answers.

Read path: `src/app/syllabi/[id]/start/page.tsx:14` loads `foundationItems` (ordered by `sequenceIndex`) with `linkedConcept` columns `{id, name, status}`.

**Implication for the ledger:** baselines are real, queryable per-syllabus rows. They are explicitly
**"guidance, not a gate"** (schema comment + Start-here copy). A `need_it` baseline is a known,
honest prerequisite gap; `have_it`/`unset` are not completion evidence. If the ledger surfaces
baselines at all, treat `need_it` as an outstanding prerequisite, never as negative "score".

---

## 3. Existing readiness / progress / % computation (reuse vs replace)

There are **three independent, duplicated computations** today. None is centralized — each
re-derives "understood" inline. This is the duplication a ledger should absorb.

### (a) Syllabus header counts — `src/app/syllabi/[id]/page.tsx:87`
```
allConcepts = clusters.flatMap(subSkills).flatMap(concepts)
understoodCount = allConcepts.filter(status === 'understood' || 'verified').length
hasBegun = allConcepts.some(status !== 'not_started')
totalHours = Σ subSkill.estimatedHours
```
Renders: `"{clusters} clusters · {subskills} sub-skills · {concepts} concepts ({understoodCount} understood) · ~{totalHours}h estimated"` (`page.tsx:172`). This is the literal "86 concepts (0 understood)" line.

### (b) Per-cluster + per-sub-skill rings — `src/app/syllabi/[id]/syllabus-tree.tsx`
- `ClusterSection` (`syllabus-tree.tsx:174`): `understood = concepts.filter(understood||verified)`, `progressPct = understood/total*100`. Renders the "{understood}/{total}" + the little 20px progress bar (the "0%" ring at cluster level).
- `SubSkillSection` (`syllabus-tree.tsx:375`): same filter, renders "{understood}/{count}".
- `ArtefactsSection` (`syllabus-tree.tsx:326`): `verifiedCount = artefacts.filter(a => a.verified)` where `verified = verifiedAt !== null` (projected in `page.tsx:131`).

### (c) Goal mandala rings — `src/app/syllabi/[id]/goal-mandala.tsx:43`
`progressOf(concepts)` returns `{done, total, pct}` with `done = understood||verified`. Used for the
center overall ring (`Math.round(pct*100)%`) and each cluster arc. **Identical definition** to (a)/(b),
implemented a third time.

### (d) Public profile "Readiness snapshot" — `src/app/u/[handle]/page.tsx` — **the honest model to align with**
This is the closest existing thing to a "ledger" and the **honesty bar to match**. It is **counts, not a score** (UI says so at `page.tsx:514`). Key logic in `loadProfile` (`u/[handle]/page.tsx:125`):
- **Two evidence sources, both real:**
  1. **Passed competency checks**: `completedAt != null && score >= PASS_THRESHOLD (4)` → `bestPassScore` per concept (`page.tsx:245`). Note bar is **4/5** here vs `concepts/[id]/actions.ts` allowing score 0–5.
  2. **Completed artefacts**: `verifiedAt != null`, mapped through `demonstratedConceptIds` (stale/foreign ids dropped by checking against real concept names) (`page.tsx:276`).
- **Partition of "done" concepts** (`status` understood||verified): if it has evidence (1) or (2) → **`verified`**; else → **`self-assessed`** (`page.tsx:291-312`). This is the critical honesty split: *self-marked ≠ proven.*
- Snapshot counts (`page.tsx:418`):
  - `verified` = concepts with real evidence
  - `inProgress` = concepts with `status === 'learning'`
  - `projectsCompleted` = `artefacts where type==='project' && verifiedAt != null`
  - `artefactsShipped` = `artefacts where url || evidenceUrl`
- Explicitly **no fabricated %** — the comment at `page.tsx:505` says "honest counts, no fabricated %".

**Reuse/replace verdict:**
- The "% understood" rings in (a)/(b)/(c) count **self-marked status only** — they are the *optimistic* view (any `understood` counts, no evidence required). The profile (d) is the *honest evidence-gated* view.
- A v1 ledger should **centralize one evidence-gated derivation** (the profile's partition logic) and have the syllabus header, tree rings, and mandala consume it — replacing three duplicated `filter(understood||verified)` blocks. Decide explicitly whether the in-app rings stay "self-marked %" or move to "verified %" (they currently disagree with the public profile by design).

---

## 4. Test setup

**There is no test runner and no project tests.**
- `package.json` scripts: `dev`, `build`, `start`, `lint` (eslint), `db:*` (drizzle-kit). **No `test` script.**
- No `vitest`/`jest` in dependencies; the only `*.test.ts` and `vitest.config.ts` hits are inside `node_modules` (zod, tsconfig-paths, sanitize-url). No `src/**/*.test.ts`.
- The pre-merge gate (per `CLAUDE.md`) is **`npx tsc --noEmit` + `npx eslint`** — typecheck + lint only.

**Implication:** a ledger with non-trivial derivation logic has **no harness to unit-test it** today.
If the ledger math should be tested (recommended — it's the product's honesty claim), introducing
vitest is a net-new decision, not a reuse. The lint baseline is already red on `main` (only *new*
errors gate). Until then, "verification" = typecheck + browsing the routes (the `syllabus-qa` agent pattern).

---

## 5. How a syllabus + full child tree is loaded server-side

### Owner-facing (the authenticated app)
- `loadSyllabus(id, userId)` in `src/app/syllabi/[id]/page.tsx:41`:
  - `await connection()` (opts the RSC into dynamic rendering before DB access)
  - `db.query.syllabi.findFirst` with **`where (s.id === id AND s.userId === userId)`** — user scoping is **in the query predicate**, not RLS.
  - Nested `with`: `clusters` (asc orderIndex) → `subSkills` → `concepts` (asc orderIndex, `with: resources`) **and** `artefacts` (desc createdAt). One round-trip, full tree.
  - `notFound()` if null. `requireCurrentUserId()` (`src/lib/auth.ts:25`) redirects to `/login` if unauthenticated.
- DB client: `src/db/index.ts` — `postgres-js` + Drizzle, `prepare: false`, **connects as the `DATABASE_URL` role (Supabase pooler), which bypasses RLS.** So *all* user-scoping is done in app code via the `where userId` predicate and the `requireOwned*` helpers in `src/lib/ownership.ts` (each walks the FK chain up to `syllabus.userId` and throws `"Not found."` on mismatch).
- Mutations re-check ownership independently (e.g. `requireOwnedConcept` before `updateConceptStatus`).

### Public-facing (`/u/[handle]`)
- `loadProfile(handle)` in `src/app/u/[handle]/page.tsx:125` — `export const revalidate = 60` (ISR).
- **No auth.** Scoping is: handle → profile row (explicit public-safe column select) → **the ONE featured syllabus** (`isFeaturedOnProfile = true`, else most-recent fallback) → its clusters/subskills/concepts/artefacts/resources via a sequence of `inArray` selects. Because the DB role bypasses RLS, the public page is careful to **select only public-safe columns** (never `notes`, `reflection`, `progressLog`). This is the documented honesty/RLS-bypass model.

**Implication for the ledger:** two distinct load paths with different scoping and column safety.
A server-side ledger that runs in *both* contexts must respect the public path's column allow-list
(no private columns) and the "featured syllabus only" rule — it cannot assume the owner-side full tree.

---

## 6. Ambiguities / gaps that would block an honest computation

1. **What does "ready" mean numerically?** Every existing surface is deliberately **counts, not a single
   score/%** — except the in-app rings, which *are* %s but count self-marked status only. A "readiness
   ledger" implies a derived figure; the product's stated honesty stance (profile copy: "Counts, not a
   score") may conflict with surfacing one number. **Needs a product decision** before math.

2. **Which "done" definition governs?** Two coexist and disagree:
   - Optimistic (rings/mandala/header): `status ∈ {understood, verified}` — self-marked, no evidence.
   - Honest (profile): evidence-gated (passed competency check ≥4/5 **or** completed artefact demonstrating the concept).
   A ledger must pick one (or expose both, clearly labelled). Recommend the evidence-gated one as the spine.

3. **Competency pass bar is inconsistent.** Profile uses `PASS_THRESHOLD = 4` (`u/[handle]/page.tsx:37`);
   `completeCompetencyCheck` accepts any score 0–5 with no app-wide constant. The pass bar should be a
   single shared constant the ledger imports.

4. **Per-item weighting is undefined.** `skill_clusters.weight` (1–5), `concept_tier`, and
   `concept_relevances.importance` (core/supporting/peripheral) all exist as plausible weights, but
   nothing currently weights progress — every count is unweighted. A "readiness" measure that treats a
   peripheral concept = a core concept is arguably dishonest. **Decide the weighting model** (or commit to flat).

5. **`sub_skills.subSkillStatus` is dormant** — defined but never written in the traced paths. Don't build
   a ledger on it without confirming a writer exists.

6. **`gap_reports` is a stale AI snapshot**, not live data — safe as advisory context, unsafe as a ledger
   source of truth. The mandala/header are live; the gap report is point-in-time.

7. **Baselines (`need_it`) are prerequisite gaps, not progress.** They're "guidance, not a gate." Decide
   whether outstanding `need_it` baselines should *discount* readiness (honest: you're missing an assumed
   prerequisite) or be shown separately. They must not silently count as completion.

8. **Non-artefact-bearing clusters have no build evidence path.** They're meant to be "proven by competency
   checks." So a cluster's max achievable evidence-backed readiness depends on `isArtefactBearing` — the
   ledger needs per-cluster-type rules, or it will systematically under-credit soft/knowledge clusters that
   have no artefact to complete.

9. **No test harness** (§4): the ledger's derivation — the one piece where correctness *is* the product —
   would ship unverified unless vitest is introduced. Flag as a setup decision, not reuse.

10. **Two load contexts, different column safety** (§5): a shared ledger function must be safe to run on the
    public, RLS-bypassing, public-safe-columns-only path. Confirm it never reads private columns.
