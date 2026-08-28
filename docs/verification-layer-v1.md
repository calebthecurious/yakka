# Provency — The Verification Layer
## Thesis, Key Success Factors, and Conceptual Schema (v1, 27 Aug 2026)
*Design document. Paper, not migrations — see posture note at the end.*

---

## 1. The problem, in one paragraph

Every signal the labour market runs on is losing information content at once: degrees certify a cohort, résumés are generated, portfolios are free to fabricate, take-homes are solved by a model in ninety seconds. The interview is the last verification mechanism standing — expensive, biased, unscalable. Employers make six-figure bets on evidence approaching zero information. **Provency builds the replacement verification layer: a system that manufactures the signal types that survive free generation, as a byproduct of work people already do.**

## 2. The four surviving signals (the product IS these)

| Signal | Why it survives generation | Product mechanism |
|---|---|---|
| **Process** | The artefact is fakeable; the timestamped history of its making is not (cheaply) | Capture commit sequences, draft evolution, decision points while people build |
| **Presence** | Real-time, unassisted, observed performance can't be delegated to a model | Rationed live verifications against specific claims; recorded, reusable |
| **Attestation** | A named person with visible standing staking reputation is costly to abuse | Lightweight, weighted, revocable attestations from people who share history with the claim |
| **Accumulation** | Time is the one input AI can't compress; a coherent multi-year record is expensive to fabricate | Append-only, timestamped record the candidate owns forever |

## 3. Key success factors

1. **Displacement is the only proof.** North-star metric: an employer *skipped a step in their own process* because of the record. Not views, not likes on a profile. Instrument this from day one.
2. **Standards come from the demand side.** A capability claim is only meaningful against a definition an employer owns. Without this, it's a bootcamp with extra steps.
3. **Single-player value first.** The current-role product ("do the job I have, excellently") and onboarding curricula work at n=1. Network value (attestation graph, demand signal) compounds later. Survive to liquidity on subscriptions, not placements.
4. **Integrity under adversarial pressure.** The first credible fake that gets someone hired ends the platform. Tiered verification, honest labels ("unproctored"), provenance checks, revocability.
5. **Alignment.** Revenue never depends on a specific hire occurring (no contingent placement fees). Candidate subscription + employer subscription; optional non-contingent verification services.
6. **Speed with honesty.** LinkedIn owns the graph, GitHub owns provenance; either could ship a thin version. The moat is the compounding record + demand-side standards + the honesty brand — none of which a thin version replicates quickly.

## 4. Conceptual schema

**Design principles first — these matter more than the tables:**
- **Claims are separate from evidence.** A claim is what someone asserts; evidence is what supports it. Trust = f(evidence), computed, never stored as a bare boolean.
- **Evidence is append-only and immutable.** Corrections are new rows superseding old ones; nothing is retroactively edited. Accumulation only works if history can't be rewritten.
- **Time is first-class.** Everything has occurred_at + recorded_at. The gap between them is itself a signal.
- **Portable vs instance.** Capabilities are portable ("operates ISO 13485 design control"); an employer's instance of it (their SOP curriculum) is not. Two layers, never blended.
- **The ledger stays computed.** Verification state derives from evidence at read time (as computeReadinessLedger already does). Snapshots exist for audit/portability, never as the source of truth.

### 4.1 Identity & the record (Accumulation)

```
users                     -- exists today (Supabase auth)
capability_claims
  id, user_id
  capability_id           -- FK → capabilities (portable taxonomy)
  level                   -- claimed proficiency (enum: working|proficient|expert)
  claimed_at
  status                  -- active | withdrawn | superseded_by(claim_id)

capabilities              -- the portable taxonomy layer
  id, slug, name
  domain                  -- engineering|clinical|commercial|...
  parent_id               -- hierarchy (maps to today's cluster→sub-skill→concept)
  canonical_definition    -- one-paragraph observable definition

ledger_snapshots          -- audit/portability only, never source of truth
  id, user_id, taken_at, snapshot(jsonb), reason(export|audit|dispute)
```
*Today's syllabus tree (cluster→sub-skill→concept) becomes a **view over** capabilities scoped to one goal — the taxonomy generalises, the learning structure survives.*

### 4.2 Evidence (all four signals land here)

```
evidence                  -- the spine; append-only
  id, user_id
  claim_id                -- FK → capability_claims (what this supports)
  kind                    -- artefact | check | process_trace | presence |
                          -- attestation | credential | engagement
  tier                    -- self_reported | check_unproctored | provenance_verified
                          -- | presence_verified | attested | org_verified
  occurred_at, recorded_at
  payload(jsonb)          -- kind-specific body
  supersedes_id           -- nullable; immutability via supersession
  revoked_at, revoked_reason   -- attestations/verifications are revocable

process_traces            -- Signal 1: Process
  evidence_id (1:1)
  source                  -- github|gitlab|gdrive|manual
  repo_ref, ownership_proof   -- gist-challenge result (registered decision)
  first_activity_at, last_activity_at, event_count
  timeline(jsonb)         -- compressed sequence: commits/drafts/milestones
  -- integrity: timeline hashes chain (each entry hashes the previous)

presence_verifications    -- Signal 2: Presence (rationed)
  evidence_id (1:1)
  claim_id, format        -- live_walkthrough | timed_exercise | pairing
  verifier_id             -- platform verifier or employer member
  scheduled_at, duration_min
  outcome                 -- demonstrated | partial | not_demonstrated
  recording_ref           -- consented recording, retention-limited
  rationing_cost          -- credits consumed (scarcity is the design)

attestations              -- Signal 3: Attestation
  evidence_id (1:1)
  attester_user_id        -- must be a user with their own record
  relationship            -- colleague | manager | client | collaborator
  shared_context          -- engagement_id / org_id / free-text period
  statement               -- what they attest to, bound to the claim
  attester_standing_at_time(jsonb)  -- frozen snapshot of attester's tier mix
  -- weight is COMPUTED from attester's standing, never stored
```
*Today's artefacts, competency checks, and testimonial plans all become `evidence` kinds with tiers — the existing ledger rules ("self-assessed counts for nothing") carry over as tier weights.*

### 4.3 Standards & organisations (demand side)

```
organizations, org_members      -- as specced in P6.1 (RLS matrix stands)

standards                       -- what "ready" means, demand-side owned
  id, owner_org_id              -- nullable → canonical/public standards
  role_title, jurisdiction
  source                        -- jd_generated | org_authored | canonical
  status                        -- draft | published | archived
  version                       -- standards are versioned, never edited live

standard_requirements
  standard_id, capability_id
  min_level, min_tier           -- e.g. "attested or better"
  weight

curricula                       -- generated FROM a standard (today's syllabus engine)
  id, standard_id, version
  scope                         -- portable | org_instance
  -- org_instance curricula may reference confidential org material:
  confidentiality               -- public | org_private
enrollments
  user_id, curriculum_id, purpose  -- pre_hire | onboarding | current_role
  started_at, state
```
*The syllabus generator's JD path becomes `standards.source = jd_generated`; the employer conversation next week produces the first `org_authored` one. `purpose = current_role` is the single-player wedge.*

### 4.4 The market layer (thin, later)

```
demand_signals            -- aggregate only, never identifies a person
  org_id?, role_title, region, period, builder_count

readiness_matches         -- computed view, not a table users write to:
                          -- user × standard → coverage %, gaps, tier profile

displacement_events       -- THE north-star metric
  org_id, user_id, standard_id
  step_skipped            -- phone_screen | take_home | first_interview | reference_check
  reported_by             -- employer_confirmed | candidate_reported
  occurred_at
```

### 4.5 Deliberately absent

No `placements`, no `placement_fees` (misalignment + disintermediation). No messaging tables (mailto until a real employer asks). No proctoring-tech tables (honest labelling instead, per the registered 7.2 decision). No storage of computed trust scores (always derived). No recruiter-outreach queue (the consent problem stands).

## 5. What exists today maps cleanly

| Today (yakka) | Becomes |
|---|---|
| concepts + checks | capability_claims + evidence(kind=check, tier=check_unproctored) |
| artefacts.verifiedAt | evidence(kind=artefact, tier=provenance_verified) via process_traces |
| computeReadinessLedger | same engine, now over evidence tiers against standard_requirements |
| syllabus (JD-generated) | curricula over standards(source=jd_generated) |
| planned testimonials (P5.3) | attestations |
| profile_view_events (P5.4a) | stays; displacement_events joins it as the outcome layer |

The migration path is **additive and incremental** — the ledger's rules survive as tier weights, and nothing in the current product breaks. That's the build-on-top decision holding at the schema level.

## 6. Posture

This document is design capital, not a build order. It is gated exactly as Amendment 6 is: **no table here becomes a migration until employer signal exists**, and next week's conversations will falsify or reshape at least the standards and presence layers — cheaply, on paper. The three email questions map straight onto it: verification cost (→ evidence tiers), ramp shape (→ curricula/purpose), and confidentiality tolerance (→ curricula.confidentiality). File alongside Upgrade Plan v1; delta-note the plan that a schema concept doc now exists.
