# Worklog

Reverse-chronological. One entry per landed slice of work, with the commit
range and anything a future reader would otherwise have to rediscover.

---

## 2026-08-13 — Amendment 1: single source of truth for progress numbers

**Commits:** `48bba40` → `a3a6b91` (4 commits, branched from `5f44741`)

### Why

An audit of every progress-rendering surface (P1.1) found **three independent
truths**, not two:

1. `src/lib/readiness/model.ts` — `computeReadinessLedger`, evidence-gated, and
   at the time rendering **nothing**: its only caller was a dev-only debug
   `<pre>` dump.
2. Workspace header, syllabus tree, goal mandala — all computing from raw
   `concepts.status`, which is self-declared and ungated by evidence.
3. `/u/[handle]` — a third implementation with its own `PASS_THRESHOLD = 4` and
   its own inline evidence logic, on the public profile, the surface the
   product's honesty claim rests on.

The brief for the amendment assumed `/u/[handle]` already used the ledger. It
never did. That discovery reshaped the rest of the plan.

### What landed

| Commit | Slice | Effect |
|---|---|---|
| `48bba40` | P1.2 + P1.4a | `summarizeReadinessLedger` + per-sub-skill grain in the model |
| `ce76010` | P1.3 | Workspace header reads the ledger |
| `3724557` | P1.4 | Syllabus tree, cluster **and** sub-skill grains |
| `a3a6b91` | P1.5 | Goal mandala, all seven render sites via one seam |

P1.2 and P1.4a are combined deliberately: the P1.4a edits rewrote `summary.ts`'s
module doc in place and interleaved a field into `ClusterSummary`, so the hunks
did not separate cleanly. An honest combined commit beat false archaeology.

### Numbers changed, on purpose

The ledger is stricter than raw status, so every refactored surface reports
lower. On a representative fixture (24 concepts, 11 self-marked understood,
evidence for 4):

- Header: `24 concepts (11 understood)` → `24 concepts (4 verified)`
- Tree: cluster rows `4/5 → 3/5`, `3/5 → 1/5`, `2/5 → 0/5`; sub-skill rows
  `2/2 → 0/2` (RTOS basics — its check scored 3/5, below the bar)
- Mandala: centre ring `46% (11/24)` → `17% (4/24)`

Not softened, blended, or annotated: the ledger number is correct by definition.
Denominators were held at concept grain throughout, so only numerators moved.

### Things a future reader will want to know

- **`pct` is 0–100 inside `src/lib/readiness/`**, matching
  `ReadinessHeadline.pct`. The mandala's geometry wants a 0–1 fraction; that
  conversion happens once, inside `progressOf`, never at a render site.
- **Sub-skills carry concept milestones only.** The artefact-target milestone
  belongs to the artefact-bearing *cluster*, so sub-skill rows sum to
  `cluster.concepts.total`, never `cluster.total`. `summary.test.ts` asserts
  both directions, including that they are *not* equal when the two differ.
- **`projectReadinessInput` must set `subSkillId`.** Without it, `bySubSkill` is
  empty and every sub-skill row renders `0/0` — a broken number, not a strict
  one. `summary.subSkillCoverage.complete` is the canary.
- **`getReadinessForSyllabus` runs its own `loadSyllabus`.** If the caller
  already holds the tree, use `readinessForLoadedSyllabus` or pay for a second
  deep relational query per render.

### Deliberately still on raw status

Not oversights — each is tracked from the P1.1 must-differ list:

- `hasBegun` (`syllabi/[id]/page.tsx`) — `status !== "not_started"`. `learning`
  is invisible to the evidence model, so there is no ledger equivalent (F).
- `ConceptRow` status prop, `concepts/[id]/page.tsx:228`,
  `concepts/[id]/actions.ts:83` — status **input** and its validation, not
  readouts (rows 33–34).
- Mandala concept dots — coloured by self-declared status, so ~11 dots read
  "understood" while the ring says 4. Cosmetic mismatch inside one graphic;
  needs a product call (dim unevidenced dots, or a legend entry).

### Open, not closed

- **P1.5b — `/u/[handle]` still has the third truth.** Analysis is done and
  paused at a decision gate. The semantic diff found the pass bar and both
  evidence sources are *identical*; exactly one rule differs — line 292 gates
  evidence behind self-declaration, so a passed check on a concept still marked
  `learning` is **invisible on the public profile**. Real `/u/caleb` reads all
  zeros today (91 concepts, 1 non-passing check, 0 artefacts), so the divergence
  is latent, not live. Four questions await disposition, the load-bearing one
  being whether per-concept *evidence labels* ("Competency check passed · 4/5")
  move into the ledger — that decides whether P1.5b is a route change or a model
  change.
- **P1.6 — `check:single-truth` lock + parity test.** Blocked on P1.5b: the
  no-allowlist rule means it lands only when violations are genuinely zero, and
  `PASS_THRESHOLD` still appears in `u/[handle]/page.tsx` and
  `concepts/[id]/competency-check.tsx`.
- **`competency-check.tsx:26`** carries a second duplicate `PASS_THRESHOLD = 4`.
  Pure dedupe, no number change, never scheduled into a prompt.
