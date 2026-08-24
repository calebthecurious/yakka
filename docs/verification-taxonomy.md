# Verification taxonomy

One page. Every evidence state the product can attribute to a competency, what
each requires, and what a surface is allowed to say about it. **No surface may
claim a stronger state than this taxonomy grants.** Where a state is implemented,
the governing rule lives in `src/lib/readiness/model.ts` and this doc cites it;
where it is not yet implemented, the state is RESERVED and must not be rendered.

Amendment 7.1 of the Upgrade Plan v1. Companion enforcement: the
`check:single-truth` script (no surface derives its own number) and
`parity.test.ts` (all surfaces report identical numbers).

## The ladder

Weakest → strongest. A concept/claim sits at exactly the highest rung it has
evidence for; rungs never blend.

| # | State | Requires | Governing rule | Surface may say |
|---|-------|----------|----------------|-----------------|
| 0 | **In progress** | The learner set status `learning`. | `isConceptInProgress` | "In progress" / "Currently developing". Never evidence, never in verified counts. A claim only the learner can make. |
| 1 | **Self-assessed** | The learner set status `understood` or `verified`, and no rung-2+ evidence exists. | `isSelfDeclaredDone`, minus the ledger's verified set | "Self-assessed", visually subordinate (dashed chips), behind the profile's `showSelfAssessed` toggle. The word **verified** is prohibited here — the status name `verified` is a self-mark and grants nothing. |
| 2 | **Check-passed** | A COMPLETED competency check on this concept with best score ≥ `PASS_BAR` (4/5). Take-home and unproctored — see Register below. | `bestPassingScore`, `PASS_BAR`, `COMPETENCY_CHECK_OUT_OF` | "Verified". Label is exactly `formatEvidenceLabel`: `Competency check passed · N/5`. |
| 3 | **Artefact-verified** | The concept is in `demonstratedConceptIds` of an artefact with `verifiedAt` set. A pasted URL is NOT completion; `verifiedAt` is the gate. | `isArtefactBacked` | "Verified". Label is exactly `formatEvidenceLabel`: `Demonstrated in “title”` (or `Demonstrated in a completed artefact` when untitled). |
| 4 | **Client-attested** | RESERVED (Amendments 4.5, 7.4). A testimonial tied to a delivered engagement. Sub-tiers, weakest → strongest: candidate-entered (unverified) < email-verified client < company-domain-verified client. | not implemented | Nothing, yet. When built, each sub-tier is labelled distinctly and an unverified testimonial is never rendered as attested. |
| 5 | **Employer-verified** | RESERVED (Amendment 6.5). An employer-initiated verification request completed by the candidate (refreshed check or attached artefact), recorded against the requesting org. | not implemented | Nothing, yet. |

Rungs 2 and 3 are peers in the current ledger — either one makes a concept
**verified** (`ReadinessLedger` counts them identically); the label discloses
which. A concept can hold both; both labels render.

## Rules that hold everywhere

1. **Verified is evidence-gated, only.** Rungs 2–3 (later 4–5 per their own
   gates). Self-declared status moves no verified number and selects no CTA.
2. **Labels come from the module.** Evidence wording is `formatEvidenceLabel` —
   surfaces render what it returns and never compose their own sentence, so
   wording and semantics cannot drift apart.
3. **No blending.** A surface never sums, averages, or interleaves rungs into
   one number or one list without labelling each rung. "Verified: 4 ·
   Self-assessed: 7" is honest; "11 skills" is not.
4. **Downgrades are silent, upgrades are earned.** Evidence appearing promotes a
   concept immediately; deleting/unverifying evidence demotes it immediately.
   There is no grandfathering.
5. **Reserved states render nothing.** Until a rung's mechanics (schema, ledger
   rule, label) all exist, no UI may hint at it.

## Register (decisions this doc records, and one it leaves open)

- **Checks are unproctored, by design.** Take-home checks are LLM-assistable.
  The product's response is disclosure, not anti-cheat theatre: the state is
  named "check-passed", its label always carries the score, and harder tiers
  (timed, live-verify via employer request) are additive future rungs — they do
  not retroactively strengthen rung 2. **Open sub-decision (7.2):** whether the
  UI adds an explicit "unproctored" qualifier to check labels. Until decided,
  surfaces render `formatEvidenceLabel` unmodified — they do not add the
  qualifier ad hoc.
- **Artefact provenance (7.3) strengthens rung 3's credibility, not its rank.**
  Repo-ownership checks and commit-history age, when built, attach to the
  artefact's display; they do not create a new rung.
