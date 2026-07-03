# Readiness Ledger — Model Spec

> The product-defining rules for **"role readiness"**. Derived from
> `docs/readiness-ledger-recon.md`. The executable form is
> `src/lib/readiness/model.ts` (pure: types, constants, rule predicates, one
> reducer — no DB). This document is the prose derivation so the math can be
> audited against real data later.
>
> **These rules are not negotiable and must not be softened in implementation.**

---

## 0. What "role readiness" is — and is not

Readiness is a **defined, reconstructable ratio of completed work to targeted
work**, weighted by cluster importance. That is all it is.

It is **not**:
- a probability,
- a "chance of being hired",
- a confidence score,
- a vibe, an estimate, or anything an LLM produced.

The headline number is pure arithmetic. Anyone can recompute it by hand from the
breakdown. If you cannot reconstruct it from the breakdown, it is wrong.

**Label:** the headline renders only under the label **"role readiness"**
(`READINESS_LABEL`). Never "score", never "% ready to be hired".

**Rendering rule:** the headline **must never be shown without its breakdown.**
A bare "47%" is dishonest because it hides what was counted. The breakdown
(verified/total concepts, backed/targeted artefacts, the per-cluster weights, and
the separately-tracked self-assessed counts) travels with the number, always.

---

## 1. The headline

```
headline.pct = weightedTotal > 0
  ? (weightedCompleted / weightedTotal) * 100
  : 0
```

`weightedCompleted` and `weightedTotal` are sums over **milestones**. A milestone
is a unit of targeted, *defined* work that can be completed and whose completion
is *evidence-gated*. There are exactly two kinds:

1. **Concept milestone** — every concept in the syllabus is one milestone.
   Completed iff the concept is **VERIFIED** (§2).
2. **Artefact-target milestone** — every **artefact-bearing cluster** defines
   exactly one milestone (the employer-valuable artefact it exists to produce).
   Completed iff that cluster has at least one **backed artefact** (§3).

Non-artefact-bearing clusters define **no** artefact milestone — by design they
are "proven by competency checks", so their readiness comes entirely from their
concept milestones. This prevents systematically penalising soft/knowledge/
regulatory clusters that have nothing to build.

Each milestone contributes its **parent cluster's weight** (§4) to both the
numerator (if completed) and the denominator.

```
weightedTotal     = Σ over all milestones        ( parentCluster.weight )
weightedCompleted = Σ over completed milestones   ( parentCluster.weight )
```

`pct` is left unrounded in the model; presentation chooses rounding. When there
are zero milestones, `pct` is `0` (an empty syllabus is 0% ready, not undefined).

---

## 2. What counts as VERIFIED (the reconciliation)

The recon found **two contradictory definitions** of "done" in the codebase:

- The three inline derivations (syllabus header, tree rings, goal mandala) count
  any concept whose `status ∈ {understood, verified}` — i.e. self-declared, no
  evidence required.
- The public profile (`/u/[handle]`) counts a concept only when backed by real
  evidence.

**The public profile is correct. The three inline derivations are wrong** and
must be migrated onto this model. This spec adopts the evidence-gated definition.

A concept is **VERIFIED** iff **either**:

- **(E1)** a competency check for that concept **passed** — it was completed
  (`completedAt != null`) and scored **`>= PASS_BAR`** (`score >= 4` of 5); **or**
- **(E2)** a **completed artefact** (`verifiedAt != null`) lists the concept's id
  in `demonstratedConceptIds`.

Notes:
- **`concepts.status == 'verified'` is NOT trusted.** It is set by the
  self-service "Mark Verified" button (recon open issue #1). Self-declared status
  never enters the headline.
- A concept whose status is `understood` or `verified` **without** E1 or E2 is
  **SELF-ASSESSED** (§5), counted separately, never in the headline.
- `demonstratedConceptIds` may contain stale or foreign ids; this is harmless
  because verification is evaluated per real concept — an id that matches no
  concept simply verifies nothing.

---

## 3. What counts as a backed artefact

An artefact counts toward the headline **only if `verifiedAt != null`**. There is
no artefact status enum; `verifiedAt` is the sole completion signal.

The artefact-target milestone for an artefact-bearing cluster is **completed** iff
that cluster has **≥ 1 artefact with `verifiedAt != null`** among its sub-skills.
(Artefacts attach at the sub-skill level; the loader resolves each to its parent
cluster.) One milestone per bearing cluster, so:

```
artefactsTargeted = number of artefact-bearing clusters
artefactsBacked   = number of those clusters with >= 1 backed artefact
```

Self-logged / unbacked artefacts (`verifiedAt == null`) never count toward the
headline; they are surfaced as a self-assessed count (§5). A completed artefact
in a *non*-bearing cluster still contributes via E2 (it can verify concepts) but
adds no artefact milestone, because that cluster never defined one.

---

## 4. Weighting

Each milestone's contribution is weighted by its **parent
`skill_clusters.weight`** (1–5, schema default 3), used **verbatim**.

- **No new weighting scheme is invented.** Only the existing cluster weight.
- **No normalization.** A cluster with more concepts contributes more total
  weight; that is intentional and honest — more targeted work means more to
  complete.
- **`concepts.tier` is deliberately NOT used in v1.** Tier-aware weighting (e.g.
  weighting foundation vs advanced concepts differently) is a **v2 deferral**,
  recorded here so it is a conscious choice, not an oversight. v1 weights every
  concept in a cluster equally at the cluster weight.
- An unknown cluster id (which FK integrity should make impossible) falls back to
  weight `0`. Such a milestone is still counted in `conceptsTotal` /
  `conceptsVerified` but contributes 0 to the weighted headline. This fallback is
  defensive; with consistent data it never triggers.

---

## 5. Self-assessed (tracked, never in the headline)

Shown **apart** from the headline so a viewer can see what the user *claims* vs
what is *proven*. Never folded into `pct`.

```
selfAssessed.concepts  = concepts with status understood|verified AND not VERIFIED (no E1/E2)
selfAssessed.artefacts = logged artefacts with verifiedAt == null
```

---

## 6. Foundations (separate signal, never a gate)

`foundation_items.userStatus` is the user's self-declared "I have this / I need
this" for assumed baselines. It is **guidance, not a gate** (per the schema and
the Start-here copy) and is **excluded from the headline entirely**.

It is exposed as its own signal — how many assumed prerequisites the user has
flagged as still needed:

```
foundations.needIt = assumed_baseline items with userStatus == 'need_it'
foundations.total  = assumed_baseline items (all of them)
```

`launch_step` items carry no `userStatus` and are ignored here. `need_it` is an
honest, outstanding prerequisite — it is never counted as completion, and in v1
it does not discount the headline either (it is informational alongside it).

---

## 7. The return shape — `ReadinessLedger`

```ts
ReadinessLedger {
  headline: {
    pct: number,                // weightedCompleted / weightedTotal * 100 (0 if no milestones)
    weightedCompleted: number,
    weightedTotal: number,
  },
  breakdown: {
    conceptsVerified: number,   // concepts with E1 or E2
    conceptsTotal: number,      // every concept (one milestone each)
    artefactsBacked: number,    // bearing clusters with a backed artefact
    artefactsTargeted: number,  // bearing clusters
    clusterWeightsApplied: ClusterWeightContribution[],  // per-cluster raw numbers
  },
  selfAssessed: {
    concepts: number,           // self-declared done, no evidence
    artefacts: number,          // verifiedAt == null
  },
  foundations: {
    needIt: number,
    total: number,
  },
}
```

`ClusterWeightContribution` carries, per cluster: `clusterId`, `weight`,
`milestonesTotal`, `milestonesCompleted`, `weightedTotal`, `weightedCompleted`.
This is the full audit trail — every raw number behind the headline.

---

## 8. Invariants (audit hooks)

The reducer guarantees these; they are the checks to assert against real data:

1. `headline.weightedCompleted === Σ clusterWeightsApplied[].weightedCompleted`
2. `headline.weightedTotal === Σ clusterWeightsApplied[].weightedTotal`
3. `Σ clusterWeightsApplied[].milestonesTotal === conceptsTotal + artefactsTargeted`
4. `Σ clusterWeightsApplied[].milestonesCompleted === conceptsVerified + artefactsBacked`
5. `0 <= headline.pct <= 100`, and `pct === 0` when `weightedTotal === 0`.
6. `conceptsVerified + selfAssessed.concepts <= conceptsTotal` (the remainder is
   not-started or in-progress concepts).

Because every term is an integer count or a weight×count product, the headline is
exactly reconstructable by hand — which is the whole point.

---

## 9. Worked example

Two clusters in a syllabus:

- **Cluster A** — `weight 5`, artefact-bearing, 4 concepts.
  - 2 concepts verified (one passed a check at 4/5; one demonstrated by a
    completed artefact). 1 concept marked `understood` by the user with no
    evidence. 1 concept not started.
  - The cluster has a completed artefact → its artefact target is backed.
  - Milestones: 4 concepts + 1 artefact target = 5. Completed: 2 concepts + 1
    artefact = 3.
  - Weighted: total `5 × 5 = 25`, completed `5 × 3 = 15`.
- **Cluster B** — `weight 2`, NOT artefact-bearing, 3 concepts.
  - 1 concept verified (passed check at 5/5). 2 not started.
  - No artefact milestone (non-bearing).
  - Milestones: 3 concepts. Completed: 1.
  - Weighted: total `2 × 3 = 6`, completed `2 × 1 = 2`.

Roll-up:

```
weightedTotal     = 25 + 6 = 31
weightedCompleted = 15 + 2 = 17
pct               = 17 / 31 * 100 = 54.84%
```

Breakdown: `conceptsVerified = 3`, `conceptsTotal = 7`,
`artefactsBacked = 1`, `artefactsTargeted = 1`.
`selfAssessed.concepts = 1` (the unbacked "understood" in A).
If the user flagged 2 of 5 assumed baselines as `need_it`:
`foundations = { needIt: 2, total: 5 }`.

Verify invariant 3: `5 + 3 = 8 = conceptsTotal(7) + artefactsTargeted(1)`. ✓
Verify invariant 4: `3 + 1 = 4 = conceptsVerified(3) + artefactsBacked(1)`. ✓

---

## 10. Constants

| Constant | Value | Rule |
|---|---|---|
| `PASS_BAR` | `4` (of 5) | The single competency pass bar. Every consumer imports it; **no inline pass thresholds anywhere** (the recon found 4/5 on the profile but no shared constant — that drift ends here). |
| `READINESS_LABEL` | `"role readiness"` | The only label the headline renders under. |

---

## 11. Deliberate deferrals (v2+)

- **Tier weighting** (`concepts.tier`): v1 weights all concepts in a cluster
  equally. Tier-aware weighting is deferred, on purpose (§4).
- **`concept_relevances.importance`** (core/supporting/peripheral) as a
  per-concept weight: not used in v1; cluster weight is the only weighting.
- **Foundations discounting the headline**: `need_it` baselines are informational
  in v1, not a deduction.
- **Trusting `concepts.status == 'verified'`**: blocked on recon open issue #1
  (the self-service Mark-Verified button). Until that button is removed or itself
  evidence-gated, status is never trusted for the headline.
