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
- **Evidence dates (PR-3) are a suffix, never a new string.** Accumulation is
  shown by *when*, so the existing rung-2/3 labels may carry exactly one
  suffix, ` · <d MMM yyyy>`, taken from the evidence's own timestamp (check
  `completedAt`, artefact `verifiedAt`) via `formatEvidenceLabelDated`. Two
  further dated strings exist and nowhere else: an artefact card may say
  `Verified <d MMM yyyy>` (`formatArtefactVerifiedLabel`), and the profile
  header may say `Building this record since <d MMM yyyy>`
  (`formatRecordSinceLabel`, from `ledger.firstEvidenceAt`, the oldest passed
  check or completed artefact). An absent date renders nothing — no
  placeholder, no "recently", no fake precision. Dates are UTC. The
  "(unproctored)" qualifier is still the open 7.2 sub-decision and is **not**
  introduced by the suffix.
- **Unranked — nothing claimed, nothing proven.** Below rung 0: the learner
  has not touched the concept. A surface may say `Not started`. Never
  evidence; it counts toward a total and toward nothing else.
- **The Constellation (Plan v2 A2) encodes tier as fill, and the legend says
  so.** Node fill and radius are the tier; nothing else is encoded as fill.
  Legend and pill words are `formatTierLabel`'s, which are the ladder's:
  `Verified` (rungs 2–3 share the word and the fill; the evidence label
  discloses which; a ring marks an artefact), `Self-assessed` (dashed, as the
  profile's chips), `In progress`, `Not started`. Hover shows the concept name
  and `formatEvidenceDate`; the click panel shows `formatEvidenceLabelDated`
  strings verbatim. The component derives no number and composes no evidence
  sentence. Rungs 4–5 and the E-track states render nothing there until A4.

## E-track states (reserved — strings decided here before any code renders them)

Upgrade Plan v2 (`docs/upgrade-plan-v2.md`, A4 "Evidence spine migration")
introduces evidence kinds and tiers the ladder above does not yet name. Their
mechanics are specified in `docs/verification-layer-v1.md` §4.2 (`evidence`
spine: `kind`, `tier`, `supersedes_id`, `revoked_at`; `process_traces`;
`attestations` with `attester_standing_at_time`). Per rule 5, **every state in
this section is RESERVED and renders nothing** until its schema, ledger rule,
and label all exist. What this section fixes now is the *only* string set each
state may ever use, so that no surface composes its own wording when the code
arrives. Rungs 0–5 above and their allowed strings are unchanged.

Notation: `<name>` is the attester's display name as their own Provency record
renders it at render time; `<date>` is `d MMM yyyy`; `<N>` is an integer.
Every string here is emitted by `formatEvidenceLabel` (rule 2) once built.

### Tier ↔ rung mapping

The §4.2 `tier` enum maps onto the ladder as follows. A tier never creates a
rung this table does not name.

| §4.2 tier | Ladder rung | Note |
|---|---|---|
| `self_reported` | 1 Self-assessed | Includes an unverified attestation (below). |
| `check_unproctored` | 2 Check-passed | Unchanged. |
| `provenance_verified` | 3 Artefact-verified, qualified | Process trace is a qualifier on rung 3, not a rung (Register 7.3). |
| `attested` | 4 Client-attested | Only the two verified sub-tiers below reach rung 4. |
| `presence_verified` | between 4 and 5, RESERVED | Designed-not-built; no strings decided until a partner asks. |
| `org_verified` | 5 Employer-verified | Unchanged. |

### Process-verified evidence (`kind = process_trace`)

A process trace attaches to an artefact and speaks to *how it was made*. It
strengthens the artefact's credibility and never its rank: a concept backed
only by a traced artefact is still exactly rung 3 (Register 7.3).

| State | Requires | Surface may say |
|---|---|---|
| **Trace attached, unproven** | `process_traces` row exists; `ownership_proof` absent or failed. | `Process trace · ownership unproven`. Subordinate styling (as rung 1). The words **verified** and **process-verified** are prohibited. |
| **Process-verified** | `ownership_proof` passed (gist challenge) and the timeline hash chain verifies end to end. | `Process-verified · <N> events, <date> – <date>` (first and last activity), appended after the artefact's own rung-3 label, never replacing it. |
| **Trace integrity failed** | A previously verified chain no longer verifies. | `Process trace · integrity check failed`. Renders in place of the process-verified string, never hidden. The artefact's rung-3 label is unaffected. |

Never conflate:
- A process trace never moves a concept's rung or any verified count. It
  qualifies rung 3; it is not rung 3 and not a rung of its own.
- "Process-verified" is never rendered without a passing `ownership_proof`;
  commit history alone proves activity, not authorship.
- A trace on an artefact with no `verifiedAt` renders nothing, because the
  artefact itself is not yet evidence (rung 3 gate).
- Event counts and date ranges are read from the trace, never summarised into
  a quality adjective ("sustained", "consistent").

### Attestation tiers (`kind = attestation`, rung 4 sub-tiers)

The three sub-tiers named in rung 4 above, now with their strings. An
attestation is bound to one claim and carries `attester_standing_at_time`, a
frozen snapshot of the attester's own tier mix when they attested.

| State | Requires | Surface may say |
|---|---|---|
| **Attestation, unverified** | Candidate-entered statement; attester identity not confirmed by Provency. Tier `self_reported`. | `Statement from <name> · unverified`. Rendered in the Self-assessed band, behind `showSelfAssessed`. The words **attested**, **attested by**, and **verified** are prohibited. |
| **Attested, email-verified** | Attester confirmed a Provency-issued email challenge; attester has their own record. Tier `attested`. | `Attested by <name> · email-verified` followed by the relationship: `(<relationship>)` from the `relationship` enum, verbatim. Counts as **verified** at rung 4. |
| **Attested, domain-verified** | Email-verified *and* the attester's address is on a company domain tied to `shared_context` (org or engagement). Tier `attested`. | `Attested by <name> · verified at <domain>` followed by `(<relationship>)`. Counts as **verified** at rung 4. |

**"Attested by <name>" display rule.** The string `Attested by` is reserved
for the two verified sub-tiers and always carries the attester's display name
and the verification qualifier in the same label; none of the three parts
renders alone. `<name>` links to the attester's own public record. Standing
is shown, when shown, as `Standing at time of attestation: <N> verified claims`
from `attester_standing_at_time`; it is never recomputed from the attester's
current record, and the computed weight is never rendered as a number.

Never conflate:
- An unverified attestation is rung 1. It never appears in a verified count,
  never uses "attested", and is never grouped with verified attestations.
- Email-verified never renders as domain-verified, and neither renders as
  rung 5 (employer-verified), even when the attester's domain is an employer's.
- Frozen standing is historical. A surface never updates it to the attester's
  current standing, in either direction, and never says "currently".
- An attestation whose attester lacks a Provency record cannot reach rung 4,
  whatever their email proves.

### Revoked evidence (`revoked_at` set on any `evidence` row)

Attestations and verifications are revocable (§4.2). Revocation is loud on the
item and immediate on the number.

| State | Requires | Surface may say |
|---|---|---|
| **Revoked** | `revoked_at` set. Applies to any kind. | `Revoked — <date>` in place of the item's former label, in the item's former position. Owner-only surfaces may append `· <revoked_reason>`. Public surfaces never show the reason. |

Never conflate:
- Revoked evidence is **never silently hidden**. It stays in the list it was
  in, with the revoked string, for as long as the list exists.
- Revoked evidence counts for nothing. The concept's rung drops to the highest
  surviving rung the moment `revoked_at` is set (rule 4).
- "Revoked" is never softened to "expired", "archived", "withdrawn", or
  "no longer available", and never rendered in the Self-assessed band.
- A revoked item never keeps its former label alongside the revoked string;
  one or the other, and the answer is the revoked string.

### Superseded evidence (`supersedes_id` set on a newer `evidence` row)

The spine is append-only; corrections arrive as a newer row that supersedes
the older. Named here so supersession is never rendered as revocation or as
disappearance.

| State | Requires | Surface may say |
|---|---|---|
| **Superseded** | Another `evidence` row names this one in `supersedes_id`. | `Superseded <date>` on the older item, linking to the newer; the newer item carries the ordinary label for its state. Default lists show the newest; the chain is reachable, never deleted. |

Never conflate:
- Superseded is not revoked. A superseded item still counted when it was
  current and is not an integrity event.
- Only the newest row in a chain contributes to any number.

### Definition of done for this section

Every state the E-track can produce — three process-trace states, three
attestation states, revoked, superseded — has exactly one allowed string set
above. Presence verification deliberately has none and stays RESERVED. When A4
lands each state, `formatEvidenceLabel` emits these strings verbatim and this
doc gains the governing-rule citation; until then, rule 5 applies.

## Changelog

- **2 Oct 2026 (V0.3, under Upgrade Plan v2 A4):** Added "E-track states":
  tier↔rung mapping, process-verified evidence, attestation sub-tiers with the
  "Attested by <name>" rule and frozen standing, revoked and superseded
  evidence, with never-conflate assertions for each. All new states RESERVED.
  Rungs 0–5 and every pre-existing allowed string unchanged. Anchored on
  Register 7.3 and `verification-layer-v1.md` §4.2.
- **2 Oct 2026 (PR-3, under Upgrade Plan v2 A2):** Register gains the
  evidence-date rule: the ` · <d MMM yyyy>` suffix on rung-2/3 labels, the
  artefact card's `Verified <d MMM yyyy>`, and the header's `Building this
  record since <d MMM yyyy>`. All three come from the ledger module's
  formatters. Base strings unchanged; "(unproctored)" still not added (7.2).
- **2 Oct 2026 (C-2 Constellation, under Upgrade Plan v2 A2):** Register
  gains the unranked `Not started` string and the Constellation's visual
  rule (fill = tier, legend words from `formatTierLabel`). Base strings
  unchanged.
