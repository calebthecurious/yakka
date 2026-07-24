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

### Reconcile inline progress derivations onto the readiness model
- **What:** Migrate the syllabus header count, cluster/sub-skill rings (`syllabus-tree.tsx`),
  and goal mandala (`goal-mandala.tsx`) to consume `computeReadinessLedger` so the
  owner-facing views stop silently disagreeing with the honest profile.
- **Why deferred:** Internal consistency, not on the recruiter path. The profile (§2 of the
  roadmap) is the only surface that must be on the model for the job search.
- **Note:** The "Mark verified" self-declare decision was PROMOTED out of this backlog to
  roadmap item #0 (blocking) — self-attested evidence makes the whole job-search case hollow,
  so it's no longer hygiene. This item is now only the mandala/tree/header reconciliation.
- **Effort:** M → S.

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
  every `/syllabi/[id]` load. If a generation is interrupted AND the user never revisits the
  page, nothing resumes it — a died-mid-skeleton row can sit stuck in `running`/`generating`
  indefinitely (`src/lib/generation/run.ts` notes "no Cron backstop"). Add a Vercel Cron (or
  queue) that periodically scans `syllabi WHERE status = 'generating'` (the `syllabi_status_idx`
  exists for exactly this) and re-invokes `runSyllabusGeneration`, plus a `skeleton_started_at`
  clock so a stuck skeleton becomes stale-reclaimable like the sub-skill/artefact units already are.
- **Why deferred:** Accepted limitation for single-user v0 — Caleb reliably revisits his own
  syllabus, and revisiting resumes. Cut from the 2026-07-23 resumable-generation cutover to keep
  that slice a pure flag-flip + dead-code removal.
- **Reversibility:** 5/5. Pure add.
- **Effort:** M → S.
