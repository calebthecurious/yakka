# Worklog

Reverse-chronological. One entry per landed slice of work, with the commit
range and anything a future reader would otherwise have to rediscover.

---

## 2026-08-25 (later) — Real-eyes check on the live ledger: PARTIAL

Amendment 1's DoD is "header / tree / profile agree on a live workspace."
Half of it is now witnessed on production; half is blocked on an authenticated
session (see Blocked below). Recorded partial rather than claimed complete.

### The finding that reframes this DoD

**No workspace on prod carries any evidence.** Across all 14 of Caleb's
syllabi: 0 concepts self-marked understood, 0 completed competency checks
(one exists but is unfinished — `completed_at` null), 0 verified artefacts.
So a naive parity check compares zeros to zeros and proves nothing about the
numerators. What IS non-trivial on live data — and was checked — is the
denominators, the milestone arithmetic, and the evidence GATES.

### Witnessed on production

Ran the **real production reducer** (`computeReadinessLedger` +
`summarizeReadinessLedger`, imported from `src/`, not re-implemented) over
**live prod rows**, then compared against the rendered public profiles.

- `/u/caleb` → syllabus `37099175` (Master Facilitator): 91 concepts, 1
  unfinished check, 0 artefacts. Ledger says 0/0/0/0; the live page renders
  0/0/0/0 under the four stat labels. Denominator arithmetic holds: cluster
  rows 19+17+18+18+19 = 91 = header total; weightedTotal 402; every cluster
  artefact-bearing, so milestones = concepts + 1 per cluster.
- `/u/calebthecurious` → featured syllabus `8bc46617` (Software Engineer,
  Data Engineering · Neuralink): 88 concepts, ledger 0/0/0/0, page renders
  0/0/0/0. All six parity assertions PASS on live data (tree sum == header
  total, evidence count == verified count, conceptStates == verified count,
  summary mirrors header, sub-skill coverage complete).
- **The verifiedAt gate, demonstrated non-trivially.** Syllabus `ed77fbce`
  holds **2 artefacts, both with `verified_at` null**. The ledger reports
  `artefacts.completed = 0` (of 2 total) and `selfAssessed.artefacts = 2`.
  The pre-P1.5b profile counted pasted URLs and would have shown
  "Artefacts shipped: 2". This is the honesty fix proven on real rows, not a
  fixture — the strongest single piece of evidence this DoD produced.
- Incidental: unauthenticated `/syllabi` correctly bounced to
  `/login?next=%2Fsyllabi`, so the new build's route guard works.

### Blocked, not done

- **Header, syllabus tree, and goal mandala are NOT yet eyeballed.** All three
  live behind `/syllabi/[id]`, which the middleware protects. Getting a
  session needs credentials, which the agent must not handle. Two mechanical
  paths both failed today: gstack `browse handoff` cannot launch a headed
  Chromium on this machine (`launchPersistentContext` 15s timeout, no stale
  profile lock), and `cookie-import-browser` cannot read Chrome's cookie DB
  while Chrome is running (~61 live processes throughout).
- **A meaningful numerator check needs evidence that does not exist yet.**
  It arrives naturally with Track B: once the medtech artefact is logged and
  verified, re-run this check on that workspace and the numbers stop being
  zeros. Cheap to repeat — `tmp/ledger-live.mts <syllabusId>` prints the
  ledger and the six assertions straight from prod.

### Note for Amendment 2

Prod carries **real third-party users** (kristine, harry, pezz, gumbii, s-s,
robee) with syllabi of their own, alongside Caleb's four accounts. The plan's
premise for environment separation is confirmed in the strongest terms: local
shells currently point at a database holding other people's data. Every probe
in this entry was read-only.

## 2026-08-25 — Supabase restored; the 16 held commits are deployed

Supabase came back (dashboard restore). `5f44741..676c752` pushed to `main`;
Vercel auto-built and the new build is live.

**Verified, not assumed:**

- DNS resolves again; prod `/u/caleb` went 500 → 200 on the OLD build first,
  confirming the outage was purely the paused database, not the code.
- Pre-push gate green: 162 tests, `tsc --noEmit` clean, `check:single-truth` 0.
- New build confirmed live by a content marker, not by `/login` — `/login` was
  already 200 throughout the outage and proves nothing about which build is
  serving. The marker is the profile stat label the P1.5b refactor renamed:
  `Artefacts shipped` → **`Artefacts completed`**, now present on prod.
- Live `/u/caleb` renders the ledger's four counts (all 0) with the honest
  empty states. Zero is correct today: 91 concepts, 1 non-passing check, 0
  artefacts. It becomes non-zero when the medtech artefact is logged (Track B).

**Flaky test, understood — not a regression.** One pre-push run reported
2 failures out of 162; a clean re-run and three consecutive runs of
`middleware.test.ts` all passed. That run took 29.7s vs the usual ~12s
(transform alone 23s), and those tests use real ~2.5s timers, so they lose
their timing budget under machine load. Worth a `testTimeout` bump or fake
timers if it recurs; it did NOT gate the push, because the failure was
reproduced as load-dependent rather than code-dependent.

**Still open from Phase 0:** the password rotation (0.1) and the prod smoke
test (0.3) — see the next entry's blockers list, both now unblocked.

## 2026-08-24 (later) — CTA hardened under adversarial review; taxonomy doc (7.1)

**Commits:** `6d2af15`, `daf9ee5`, `590d56e`

A 10-agent adversarial review of the concept-CTA slice (`4c7a7a3`) ran after it
landed; every finding was independently re-verified with executed repros against
the real reducer. Two survived, both fixed:

- **`590d56e` — false `done`.** With every concept verified but a bearing
  cluster's artefact target unbacked, the CTA said "verified the whole
  syllabus" while the headline read 66.7% — the terminal branch consulted only
  the concept-grain half of the milestone set. The selector now takes
  `unbackedBearingClusterIds` (pure helper over `clusterWeightsApplied`);
  cross-cluster attach_evidence exists; `done` is provably headline-100%. Also
  fixed the second repro: a foreign-cluster artefact backing a concept no
  longer suppresses the own-cluster nudge. Tests 156 → 162, both repros locked.
- **`daf9ee5` — `loadSyllabus` now orders subSkills.** conceptStates' documented
  "display order" was unenforced at sub-skill grain; the move_on pick was
  nondeterministic. One-line orderBy, matching foundations-actions precedent.
- **`6d2af15` — `docs/verification-taxonomy.md` (Amendment 7.1).** The evidence
  ladder (in-progress → self-assessed → check-passed → artefact-verified →
  RESERVED client-attested → RESERVED employer-verified), what each rung
  requires, what a surface may say. Registers the 7.2 unproctored positioning;
  leaves the UI-qualifier sub-decision open.

Observed, not fixed (cosmetic, pre-existing): `/u/` `loadProfile`'s flat
`conceptRows` query has no ORDER BY, so verified concepts within a cluster
group render in arbitrary order. All counts are order-insensitive; only the
list order wobbles.

YC recon (9.1, 2026-08-24): Fall 2026 regular deadline passed 27 Jul; the
**W2027 deadline is still unannounced**; YC now takes **Early Decision**
applications for post-F2026 batches ("select 'A batch after Fall 2026'") —
i.e. the application can be submitted before the deadline even exists. Keep
watching ycombinator.com/apply.

## 2026-08-24 — Amendment 1 closed: concept CTA + /u/ route refactor (P1.5b)

**Commits:** `4c7a7a3`, `8ba6629` (on top of the nine unpushed commits ending
`da8ad27`)

### What landed

- **`4c7a7a3` — concept-page guided next action (Amendment 1.5 item #4).**
  The "Start here" card's state machine moved out of the route into
  `selectConceptCta` over new per-concept ledger state
  (`ledger.conceptStates`, one `ConceptLedgerEntry` per concept in display
  order). Six states; self-declared status is not in the input shape by
  construction, so the old "mark it understood" nag state no longer exists.
  `findNextUnverifiedConcept` picks the move-on target (same cluster first,
  then later clusters, wrapping).
- **`8ba6629` — /u/[handle] consumes the ledger; the third truth is deleted.**
  The route half of P1.5b. `check:single-truth` went 8 → 0 — Amendment 1's
  grep-clean DoD is met. The line-292 status gate is gone: a passed check on
  a concept still marked `learning` now shows under Verified competencies.
  "Artefacts shipped" (counted pasted URLs) is replaced by "Artefacts
  completed" (`ledger.artefacts.completed`, verifiedAt-gated). The profile
  joined `parity.test.ts` (156 tests green, +10): its verified count must
  equal the workspace header on every fixture, including the
  passed-check-on-`not_started` case its old gate hid.

### Decisions

- **`currentSkills` stays (Amendment 1.5 item #5).** The plan's "write-only,
  wire or delete" premise no longer holds: it feeds syllabus generation
  (`generate-syllabus.ts`, `run.ts`) and is read as `resumeText` by the gap
  report, gap page, and foundations actions. Keep; nothing to do.
- **Phase 0.2 is closed.** PR #1 was merged (`5f44741`) and pushed.

### Open, and a blocker found

- **The Supabase project is unreachable (found 2026-08-24).** Local dev fails
  with pooler error `(ENOTFOUND) tenant/user postgres.dzdfeundgibdiyvtajue
  not found`; `https://dzdfeundgibdiyvtajue.supabase.co` does not resolve at
  all; **prod `/u/caleb` returns 500** (login page still 200 — no DB). Almost
  certainly the free-tier auto-pause (~11 days idle). Needs a dashboard
  restore — do Phase 0.1's password rotation in the same visit.
- **Real-eyes DoD for Amendment 1 is blocked on that restore** — header /
  tree / profile agreement is asserted by the parity test but not yet
  eyeballed on a live workspace.
- **Eleven commits sit unpushed on `main`.** Push deliberately held: pushing
  auto-deploys, and the post-deploy smoke (Phase 0.3) cannot pass with the
  database down. Push once Supabase is restored.

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
