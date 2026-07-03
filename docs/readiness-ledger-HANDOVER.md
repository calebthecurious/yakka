# Readiness Ledger — Handover

**Date:** 2026-06-15
**Branch:** `feat/tree-density` (work is uncommitted — see §6)
**Owner:** Caleb (`calebthecurious`)
**Context:** Provency — career-pathway product. Paste a JD → personalised syllabus
(Syllabus → Skill Cluster → Sub-skill → Concept → Resources) → work through it →
render an honest public profile.

This document hands over the **"readiness ledger"** work: an honest, derived
measure of how role-ready a syllabus is, computed **only from real completion
data**. It captures everything done across the previous session and exactly
what's left.

---

## 1. The one-paragraph summary

We built the **honest source of truth** for role-readiness — pure model + spec +
tests + a DB-backed read — but **nothing consumes it in the UI yet** (except a
temporary debug JSON dump). The headline is deliberately *counts/arithmetic, not
a probability*: `weightedCompleted / weightedTotal`, where milestones are defined
and **evidence-gated**. It is fully built and verified against real data. The next
phase is **UI + migrating the existing (dishonest) progress displays** onto it.

---

## 2. The core product decision (do not soften)

The codebase had **two contradictory definitions of "done"**:

- **Optimistic / wrong** — three inline derivations (syllabus header, cluster/
  sub-skill rings, goal mandala) count any concept whose `status ∈ {understood,
  verified}`. That's **self-declared**, no evidence. The "Mark Verified" button
  feeds this directly.
- **Honest / correct** — the public profile (`/u/[handle]`) counts a concept only
  when backed by real evidence.

**We adopted the honest definition as canonical.** A concept is **VERIFIED** only if:
1. a competency check for it **passed at `>= PASS_BAR`** (score ≥ 4 of 5, completed), **or**
2. a **completed artefact** (`verifiedAt != null`) lists it in `demonstratedConceptIds`.

Raw `concepts.status == 'verified'` is **NOT trusted** (it's the self-service
button — recon open issue #1). Self-declared "done" without evidence is tracked
**separately** as `selfAssessed`, never in the headline.

Other locked rules:
- **Artefacts** count toward the headline only when `verifiedAt != null`.
- **Weighting**: each milestone is weighted by its parent `skill_clusters.weight`
  (1–5), used verbatim. **No new weighting scheme.** `concepts.tier` weighting is
  a **deliberate v2 deferral**.
- **Foundations** (`foundation_items.userStatus` = "I have this / I need this") are
  self-declared guidance, **excluded from the headline**, surfaced as a separate
  signal (`needIt` / `total`).
- **The headline must never render without its breakdown.** A bare "47%" is
  dishonest because it hides what was counted.
- **`PASS_BAR = 4`** is the single shared constant — no inline pass bars anywhere.

---

## 3. What was built (all on disk, all green)

### Docs
| File | What it is |
|---|---|
| `docs/readiness-ledger-recon.md` | Ground-truth recon: schema/enums, where baselines live, the 3 duplicated progress computations + the honest profile one, test setup (there was none), the syllabus load path. Ends with blockers/ambiguities. |
| `docs/readiness-ledger-model.md` | The **spec**. Defines the headline arithmetic, what counts as verified, weighting, self-assessed, foundations, the full return shape, **invariants** (audit hooks), a worked example, constants, and v2 deferrals. |
| `docs/readiness-ledger-HANDOVER.md` | This file. |

### Code
| File | What it is |
|---|---|
| `src/lib/readiness/model.ts` | **Pure model — no DB.** `PASS_BAR`, `READINESS_LABEL`, enum-mirror types, input types (`ReadinessInput` etc.), output type (`ReadinessLedger`), rule predicates (`isCompetencyPass`, `isArtefactBacked`, `isSelfDeclaredDone`), and the pure reducer `computeReadinessLedger(input)`. |
| `src/lib/readiness/model.test.ts` | **10 vitest tests, all passing.** Empty→0% (no div-by-zero), all-verified→100%, mixed exact pct (54.84%), weighting-actually-bites, self-assessment-can't-inflate, foundations-excluded, and predicate boundary tests (PASS_BAR: 3 fails / 4 passes). |
| `src/app/syllabi/[id]/queries.ts` | **New.** Extracted + extended the syllabus loader. `loadSyllabus(id, userId)` (now also pulls competency checks per concept + foundation items), `projectReadinessInput(syllabus)` (pure projection, exported), `getReadinessForSyllabus(syllabusId, userId)` (load → project → compute → `ReadinessLedger | null`). |
| `src/app/syllabi/[id]/page.tsx` | **Modified.** Now imports `loadSyllabus`/`getReadinessForSyllabus` from `./queries` (its local loader moved there). Has a **TEMPORARY** `<pre>` JSON dump of the ledger at the top (see §5). |
| `package.json` | Added `vitest` (devDep) + scripts: `"test": "vitest run"`, `"test:watch": "vitest"`. |
| `vitest.config.ts` | **New.** Minimal: `environment: "node"`, `include: src/**/*.{test,spec}.{ts,tsx}`. |

### The `ReadinessLedger` shape (what `getReadinessForSyllabus` returns)
```ts
{
  headline:   { pct, weightedCompleted, weightedTotal },
  breakdown:  { conceptsVerified, conceptsTotal, artefactsBacked, artefactsTargeted,
                clusterWeightsApplied: ClusterWeightContribution[] },
  selfAssessed: { concepts, artefacts },   // shown apart, never in headline
  foundations:  { needIt, total },         // assumed_baseline items
}
```
`pct = weightedTotal > 0 ? (weightedCompleted / weightedTotal) * 100 : 0`.
Milestones = every concept (weighted by cluster) + one artefact-target per
artefact-bearing cluster (weighted by cluster).

---

## 4. Verified against real data

Ran the real projection + reducer against the live DB for **Software Engineer,
Data Engineering @ Neuralink** (`8bc46617-3b79-48a4-a529-ab5a393145a0`). Result:

```
headline:   { pct: 0, weightedCompleted: 0, weightedTotal: 429 }
breakdown:  conceptsVerified 0 / 88, artefactsBacked 0 / 5 (targeted),
            5 clusters, weights [5,5,5,4,4]
selfAssessed: { concepts: 0, artefacts: 0 }
foundations:  { needIt: 0, total: 4 }
```

**Interpretation:** this syllabus is *pristine* — no evidence, and nothing even
self-marked (`selfAssessed` is also 0). The denominator is fully real (88 concepts
+ 5 artefact targets, weighted 429). The math is faithful: no evidence ⇒ 0%, with
structure intact. **Open question for Caleb:** confirm the polarity — is this
syllabus genuinely untouched (✅ correct), or did you expect progress (then the
progress was never captured as *evidence* in the DB — a data/capture question, not
a ledger bug). **Recommended first thing next week:** re-run against a syllabus you
*have* progressed, to see non-zero `conceptsVerified` / `artefactsBacked`.

> How it was run: a throwaway read-only `tsx` probe (now deleted). It could not
> call `getReadinessForSyllabus` directly because `loadSyllabus` calls Next's
> `connection()`, which throws outside a request scope. That's exactly why
> `projectReadinessInput` was extracted as a pure function — the probe ran the
> real projection + reducer on the real query result.

---

## 5. TEMPORARY scaffolding to remove before shipping

- **`src/app/syllabi/[id]/page.tsx`** renders a raw `<pre>{JSON.stringify(ledger)}</pre>`
  at the top of the syllabus page. Gated by `process.env.NODE_ENV !== "production"
  || process.env.READINESS_DEBUG === "1"` (so dev-only unless the flag is set;
  page is owner-scoped regardless). **Delete this when the real UI lands.** It also
  calls `getReadinessForSyllabus` a second time (extra query) — fine for debug,
  remove with the dump.

---

## 6. State of the branch / git

Work is **uncommitted** on `feat/tree-density`. `git status` shows:
- **From this work (new):** `docs/readiness-ledger-*.md`, `src/app/syllabi/[id]/queries.ts`,
  `src/lib/readiness/`, `vitest.config.ts`. **Modified:** `package.json`,
  `package-lock.json`, `src/app/syllabi/[id]/page.tsx`.
- **Pre-existing / NOT ours:** `src/app/syllabi/[id]/artefact-row.tsx` and
  `src/app/syllabi/[id]/syllabus-tree.tsx` were already dirty before this work
  began (they're part of the `feat/tree-density` branch's existing WIP). Don't
  attribute them to the ledger.

**Gate status:** `npx tsc --noEmit` → 0 errors. `npm test` → 10/10 pass.
`npx eslint` on touched files → clean. (Repo's pre-merge gate is typecheck + lint;
lint baseline on `main` is already red — only *new* errors gate.)

Branch name (`feat/tree-density`) no longer matches the work. Consider committing
the ledger work to its own branch (e.g. `feat/readiness-ledger`) before continuing.

---

## 7. What's next — the week ahead

In rough priority order. None of this is started.

### A. Confirm the data model holds on a *progressed* syllabus (½ day)
Re-run the ledger against a syllabus where Caleb has passed competency checks
and/or completed artefacts. Confirm `conceptsVerified`, `artefactsBacked`, and
`selfAssessed` move as expected. This closes the §4 open question before building
UI on top. (Quick path: temporary probe again, or just open the page with the
debug dump after setting `READINESS_DEBUG=1`.)

### B. Build the readiness UI (the headline + breakdown) (2–3 days)
- Design + build the canonical readiness display: the **headline % with its
  breakdown inseparable** (rule from §2). Counts visible: verified/total concepts,
  backed/targeted artefacts, per-cluster weighting, self-assessed shown *apart*,
  foundations as a separate "shore up N prerequisites" signal.
- Likely lives on the syllabus detail page (and possibly a compact version in the
  header). Match the aesthetic (dark, minimal, Linear/Vercel/Obsidian).
- Consider routing through the design skills (`/design-consultation` or
  `/plan-design-review`) before implementing — this is a credibility-defining
  surface.
- **Remove the temporary `<pre>` dump (§5) as part of this.**

### C. Migrate the 3 dishonest inline derivations onto the ledger (1–2 days)
The recon (`docs/readiness-ledger-recon.md` §3) identifies three places that count
self-declared status as "done" and are now **wrong** by our adopted definition:
1. Syllabus header "N concepts (M understood)" — `src/app/syllabi/[id]/page.tsx`
2. Cluster + sub-skill progress rings — `src/app/syllabi/[id]/syllabus-tree.tsx`
3. Goal mandala rings — `src/app/syllabi/[id]/goal-mandala.tsx`
Decide explicitly per surface: switch to **verified** (evidence-gated) numbers, or
keep a clearly-labelled "self-marked" view *distinct* from readiness. They must
stop silently disagreeing with the honest ledger. **Reconcile, don't duplicate** —
all of them should derive from the model.

### D. Align the public profile with the shared model (½–1 day)
`/u/[handle]` already implements the honest logic by hand (it was our template).
Refactor it to consume `computeReadinessLedger` / the shared predicates so there's
**one** definition of verified, one `PASS_BAR`. Note the public path is
RLS-bypassing and selects only public-safe columns — keep that constraint (the
model is pure and DB-free, so this is safe).

### E. Resolve recon open issue #1 — the "Mark Verified" button (decision needed)
Today a user can self-mark a concept `verified` with no evidence. The ledger
ignores that for the headline (good), but the button is misleading. **Product
decision:** remove it, rename it ("Mark understood"), or make it itself
evidence-gated. Until resolved, `status` stays untrusted (already handled in code).

### F. Tighten loose ends (as you go)
- **Single `PASS_BAR`:** when refactoring D, delete the inline `PASS_THRESHOLD = 4`
  in `src/app/u/[handle]/page.tsx` and import `PASS_BAR` from the model.
- **Per-concept weight (v2):** `concepts.tier` and `concept_relevances.importance`
  exist as plausible weights but are deliberately unused in v1. Revisit only if the
  flat-within-cluster weighting feels dishonest in practice.
- **Foundations discounting:** v1 shows `need_it` as informational; decide later
  whether outstanding baselines should visibly *discount* readiness.
- **`sub_skills.subSkillStatus`** is a dormant enum (defined, never written) —
  don't build on it without adding a writer.
- **`gap_reports`** is a stale AI snapshot, not live — keep it advisory, never a
  ledger source.

---

## 8. Gotchas / things a new chat must know

1. **`connection()` blocks running the loader outside Next.** `loadSyllabus` calls
   Next's `connection()` (dynamic-render signal) which throws outside a request
   scope. To run readiness in a script/test, use the **pure** `projectReadinessInput`
   + `computeReadinessLedger` on a plain query result — that's why the projection
   is split out.
2. **`@/*` → `src/*`** path alias (tsconfig). `tsx` respects it; tests use relative
   imports to stay simple.
3. **No test runner existed before this** — vitest is new. Run with `npm test`.
4. **AI is Grok, not Anthropic** for this project (memory: prefer Grok). Not
   relevant to the ledger (no AI in it), but don't "fix" the Anthropic 401 by
   migrating providers.
5. **Some syllabi have `NULL userId`** (older/seed rows). `getReadinessForSyllabus`
   is owner-scoped via `eq(userId)`, so those return `null`. Caleb's real Data
   Engineering syllabus has a valid userId.
6. **Reconcile, don't duplicate** is the throughline. The whole point of this work
   is *one* honest definition. Every new surface should consume the model, not
   re-implement a `filter(understood || verified)`.
7. **Project subagents exist** (`.claude/agents/`): `drizzle-migrator` (schema
   changes — none needed for the ledger so far; it's read-only over existing
   tables), `syllabus-qa` (after touching `/syllabi` routes or `src/lib/ai/`),
   `ai-prompt-tuner`, `supabase-auth-qa`. Use `syllabus-qa` after the UI work.
8. **No schema changes were needed** — the ledger reads existing tables only.
   If a future step adds columns (e.g. to store a computed snapshot), route through
   `drizzle-migrator` (note: migration 0005 lives only on Supabase, not the Drizzle
   journal).

---

## 9. Quick orientation for the new chat

Read in this order:
1. `docs/readiness-ledger-model.md` — the rules (start here).
2. `src/lib/readiness/model.ts` — the executable form of those rules.
3. `src/app/syllabi/[id]/queries.ts` — how real data feeds the model.
4. `docs/readiness-ledger-recon.md` — the deeper ground-truth map (schema, the 3
   derivations to migrate, the load paths).

Then pick up at §7-A.
