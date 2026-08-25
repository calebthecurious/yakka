# TODOS

Deferred work, cut from the active roadmap during the 2026-07-18 `/plan-ceo-review`
(SCOPE REDUCTION, job-search North Star). Nothing here serves "a recruiter trusts
`/u/caleb`" directly. Revisit when Provency pivots from Caleb's job-search tool to a
multi-user product — see the "Decision trigger" in `docs/roadmap.md`.

---

## P2 — Deferred features

### FSRS spaced-retention loop
- **What:** Generate retention cards from concept notes; daily review queue.
- **Why deferred:** Daily-habit mechanics serve users who don't exist yet. Caleb is already
  motivated by the job hunt. Highest time-cost item on the old roadmap.
- **State:** `retentionCards` table + `fsrsState` jsonb already exist. UI-only work.
- **Reversibility:** 5/5. Pure add, no migration needed to start.
- **Effort:** L (human) → M (CC).

### Syllabus editing (gap-report → cluster)
- **What:** Wire `src/app/syllabi/[id]/gap/add-to-syllabus-button.tsx` (currently a
  "Coming soon" placeholder) to a real server action that adds a gap blind spot as a
  new cluster/sub-skill/concept.
- **Why deferred:** Doesn't move "recruiter trusts evidence."
- **Effort:** M → S.

### Multi-syllabus public profile
- **What:** Render all of a user's syllabi on `/u/[handle]`, not just the featured one.
- **Why deferred:** One medtech target; one featured syllabus is enough for the job search.
- **Effort:** M → S.

## P3 — Internal hygiene (owner-facing, not recruiter-facing)

### ~~Reconcile inline progress derivations onto the readiness model~~ — DONE (Amendment 1)
- **Closed 2026-08-25.** Header, tree rings, mandala, `/u/[handle]`, and the artefact
  page all read `computeReadinessLedger` → `summarizeReadinessLedger`. Locked by
  `check:single-truth` (0 violations) and `src/lib/readiness/parity.test.ts`. Last
  slices: P1.10 `72e610e` (residual dedupe), P1.11 `47edb03` (landing-page mock
  labelled, verified vocabulary). What deliberately remains on raw status is
  itemised in "Amendment 1 — closed" below.

### currentSkills re-display + edit
- **What:** Surface `metadata.currentSkills` back to the user (stored, never shown).
- **Effort:** S → S.

### Foundations discounting
- **What:** Decide whether outstanding `need_it` baselines visibly discount readiness.
- **Effort:** S → S.

### Per-concept tier weighting (v2)
- **What:** Use `concepts.tier` / `concept_relevances.importance` to weight within a cluster,
  instead of flat weighting. Revisit only if flat weighting feels dishonest in practice.
- **Effort:** M → S.

### Resumable generation: durable resume backstop (Cron/queue)
- **What:** The resumable worker is kicked on syllabus create (`after()`) and re-kicked on
  every `/syllabi/[id]` load. A *failed* skeleton (`status = 'failed'`) is now user-recoverable
  via the retry button on the failed-syllabus page. The remaining gap is a **died-mid-skeleton**
  row: the instance is torn down while `skeletonStatus = 'running'`, which has no stale clock, so
  `runSkeleton` never reclaims it and the syllabus sits stuck in `running`/`generating`
  indefinitely if the user never revisits (`src/lib/generation/run.ts` notes "no Cron backstop").
  Add a `skeleton_started_at` column so a stale `running` skeleton is reclaimable like the
  sub-skill/artefact units, plus a Vercel Cron (or queue) that periodically scans
  `syllabi WHERE status = 'generating'` (the `syllabi_status_idx` exists for exactly this) and
  re-invokes `runSyllabusGeneration`.
- **Why deferred:** Accepted limitation for single-user v0 — Caleb reliably revisits his own
  syllabus, and revisiting resumes. Cut from the 2026-07-23 resumable-generation cutover to keep
  that slice a pure flag-flip + dead-code removal.
- **Reversibility:** 5/5. Pure add.
- **Effort:** M → S.

## Amendment 1 — closed. Residual raw-status sites, filed 2026-08-25

Disposition on the P1.1 must-differ list and the remaining raw sites. **All
deferred with named triggers, none scheduled now. No further Amendment 1 work
after P1.10/P1.11 — the amendment is closed and stays closed.** Each item below
opens only when its trigger fires, and then as that prompt's precondition work.

### 1. `hasBegun` (must-differ F) — KEPT by design, permanently. CLOSED, not deferred.
- **Where:** `src/app/syllabi/[id]/page.tsx` — `status !== "not_started"`.
- **Why:** Self-declaration of "I've begun" has no honest evidence equivalent
  (`learning` is invisible to the ledger). Not a TODO. Do not reopen.

### 2. Tree artefact badge grain — TODO
- **Trigger (verbatim):** any redesign of the tree badge OR the first
  employer-facing surface that displays it (A6).
- **Until then:** both counters stay, correctly, in their own units (the tree
  row renders concept grain; the ledger's `ClusterSummary.total` is milestone
  grain, concepts + 1 for an artefact-bearing cluster).

### 3. `selfAssessed` / `inProgress` booleans on `ConceptLedgerEntry` + the two `/u/` identity-list migrations — TODO
- **Trigger (verbatim):** P5.1 profile variants, which touches `/u/` anyway.
- **How:** Do it as that prompt's precondition work, not before.

### 4. Mandala dots vs ring — TODO, product call
- **Trigger (verbatim):** next mandala design touch.
- **State:** concept dots are coloured by self-declared status while the ring is
  evidence-gated, so dots can read "understood" where the ring says 0.
  Options stand as documented (dim unevidenced dots, or legend).

### 5. `FoundationsSignal.haveIt` — TODO
- **Trigger (verbatim):** next foundations UX work.
- **Related:** "Foundations discounting" under P3 above — resolve together when
  the trigger fires.
