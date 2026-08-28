# Provency Upgrade Plan v1 — Employer-Facing + Universal Positioning
*Drafted 28 Jul 2026 (13 Aug session). Companion to Handover v3. Governs the "build on top" direction: employer-side product, universal positioning (incl. freelance/self-employed), YC Winter 2027 readiness.*

**Governing constraints (carried from D5):**
- The medtech artefact + cold emails run as a PARALLEL CRITICAL PATH, not after this plan. Amendment 6 scope is explicitly gated on their signal.
- Every amendment below uses the atomic prompt harness (CONTEXT / PRECONDITION / TASK / CONSTRAINTS / DEFINITION OF DONE / VERIFY & STOP).
- Human gates at every migration, deletion, and prod-touching step. Dry-run before apply. "Announced ≠ executed — evidence or NOT DONE."
- Target anchor: YC Winter 2027 deadline, estimated late Oct / early Nov 2026 (unconfirmed — watch ycombinator.com/apply).

---

## PHASE 0 — Outstanding gates (blockers; nothing else starts until these close)

**0.1 Rotate Supabase database password**
- Supabase → Settings → Database → reset password.
- Update secret in Vercel env ONLY (production + preview). Do NOT store in local shell/env files.
- Verify: deployed app connects; local shell connection now fails (that failure is the success condition).
- Effort: 5 min. Status: flagged three times, unexecuted.

**0.2 Confirm PR #1 status**
- Check: scoped review ran (deletion completeness, run.ts race/error-wedge, migration/code compat)? Merged to main?
- If unmerged: run the review, merge with bisectable history intact.
- Effort: 0.5–2 h depending on review findings.

**0.3 Post-merge prod smoke test**
- Generate one real syllabus on provency.ai; watch it settle to 'ready'.
- Kill a tab mid-run; confirm resume under real Vercel serverless after() behaviour (differs from next dev).
- Record outcome in WORKLOG with date.
- Effort: 30 min. This is the final real-eyes gate on the resumable slice.

---

## AMENDMENT 1 — Single source of truth: ledger unification (review item #2 + cleanups)
*Why first: an employer-facing product where the header, tree, mandala, and public profile disagree on the same number is dead on arrival. The ledger becomes the product's load-bearing wall — it must be the only truth before anything consumes it.*

- **1.1 Call-site audit.** Grep every surface computing progress from raw concept status (workspace header, syllabus tree, mandala, any dashboard widgets). Produce a table: surface → current computation → target ledger field. No code changes in this task.
- **1.2 Ledger API surface.** Decide the shape non-profile surfaces consume (full ledger vs summarised counts). If computeReadinessLedger is expensive at tree-render frequency, add a memoised/summary variant — same underlying function, never a parallel computation.
- **1.3 Refactor surfaces one at a time** (header → tree → mandala), one atomic prompt each. Constraint: zero remaining raw-status progress computations at the end (grep-verified).
- **1.4 Parity test.** Unit/integration test asserting all surfaces report identical numbers for a fixture workspace, including edge states (unchecked concept, failed check, verified artefact, mixed).
- **1.5 Cleanups riding along:** delete dead "Add to syllabus" no-op button (#3); wire or delete write-only currentSkills (#5 — decide: if no consumer within this plan, delete the write path); add concept-page guided next action (#4 — small UX, disproportionate activation value once employers send candidates here).
- **DoD:** grep clean, parity test green, real-eyes check that header/tree/profile agree on a live workspace.
- **Effort: 3–5 days.**

---

## AMENDMENT 2 — Environment separation (prod safety)
*Why now: your own filed TODO trigger — "before next schema change" — fires the moment this plan starts. Amendments 4–8 are dozens of schema changes. Currently dev shells point at prod with real users.*

- **2.1 Create a dev database.** Supabase branching if on a plan that supports it; otherwise a second Supabase project. Decide and document which.
- **2.2 Schema sync + seed.** Apply full migration history (0001–0015) to dev; build a seed script with fixture users/syllabi/artefacts realistic enough for UI work. Seed script lives in repo, is idempotent.
- **2.3 Env separation.** Local `.env` → dev credentials only. Prod credentials exist in Vercel env exclusively. Add a guard to the drizzle-migrator: print target host + row counts and require typed confirmation (e.g. the literal word PROD) before applying to production.
- **2.4 Migration workflow doc in CLAUDE.md:** dev-apply → verify → human gate → prod-apply via safe transport (direct 5432, never pooler). Two-minute check ritual codified.
- **2.5 RLS parity check.** Confirm dev RLS policies match prod (they'll drift otherwise, and Amendment 6 is RLS-heavy).
- **DoD:** a schema change can be developed and tested end-to-end without any local process ever holding prod credentials.
- **Effort: 2–4 days.**

---

## AMENDMENT 3 — Generation pipeline hardening
*Why: employer-facing means volume and scrutiny. Both filed TODO triggers ("users create-and-abandon in volume") and the outstanding generator audit fire under this direction.*

- **3.1 Cron/queue resume backstop.** Vercel Cron (or QStash) job scanning for 'generating' rows older than N minutes; re-kick the resumable worker. Reuses the existing resume logic — no new generation path. Include a max-retry/poison-row state so a genuinely broken row surfaces instead of looping.
- **3.2 Consolidated generator audit** (the outstanding role-drift debt). For each of the ~10 Grok generators: capture 2–3 real outputs across contrasting roles/jurisdictions; grade for role fidelity, jurisdiction awareness, generic-drift; log defects; fix prompts; re-run.
- **3.3 Generator eval fixtures.** Freeze 3–5 golden JDs (incl. one weird role, one non-AU jurisdiction) with expected structural assertions (cluster count ranges, role-specific term presence, no generic-template markers). Runs as a manual harness script — this becomes the regression net for Amendment 4's new modes.
- **3.4 Cost/latency baseline.** Record per-syllabus token cost and wall time now, so Amendment 4's second generation mode has a comparison point.
- **DoD:** backstop observed healing a deliberately-wedged row in prod; audit table complete with all defects dispositioned; eval script green on all goldens.
- **Effort: 4–6 days.**

---

## AMENDMENT 4 — Positioning engine generalisation (any role, incl. freelance/self-employed)
*The core product amendment. Everything here is schema + generation + ledger semantics.*

- **4.1 Pathway model (schema).** Add `pathway` to syllabus/workspace: `employed_role | freelance | founder` (enum, additive migration — dev first per Amendment 2). Decide whether pathway lives on the syllabus (per-goal) or workspace (per-identity); recommendation: syllabus, so one user can run both.
- **4.2 Freelance input flow.** The JD-paste entry point doesn't exist for freelancers. New intake: target service/offer description + target client type + jurisdiction. UI: a pathway selector at creation, then divergent forms.
- **4.3 Freelance generation mode.** New prompt lineage for cluster generation: alongside craft-skill clusters, inject business-of-one clusters (client acquisition, scoping & proposals, pricing, delivery & communication, admin/legal/tax for jurisdiction). Constraint: reuse the existing 4-level structure and concept/check/project machinery unchanged — only the taxonomy source differs.
- **4.4 Role-drift guard for the new mode.** Extend Amendment 3.3 goldens with 2 freelance fixtures (e.g. "freelance Webflow developer, AU" / "freelance UX researcher, UK"). The known failure mode (generic clusters) is MORE likely here — gate the mode behind the eval passing.
- **4.5 New evidence classes (schema + ledger).** Add evidence types: `client_testimonial`, `delivered_engagement`, `case_study`. Extend computeReadinessLedger: define exactly what each counts for and what "verified" means per class (see Amendment 7 for the verification mechanics). Honesty rule holds: unverified testimonial ≠ verified; label accordingly, never blend.
- **4.6 Projects → engagements mapping.** Cluster-level problem-based projects reframed as "portfolio engagements" in freelance mode (same scaffolding engine, different framing/prompt).
- **DoD:** a freelance syllabus generates end-to-end on dev, passes goldens, produces a ledger with correctly-labelled evidence classes; employed-role path provably unchanged (existing tests green).
- **Effort: 8–12 days. Sequencing note: 4.5 can start immediately after Amendment 1; 4.2–4.4 can be deferred until after first employer signal if the timeline compresses — the freelance MARKET is second priority to the employer signal.**

---

## AMENDMENT 5 — Profile as universal positioning artefact
*The profile is the wrapper around evidence for ANY audience — recruiter, client, or YC partner. Also: 5.4 is the instrumentation for the cold-email A/B, so parts of this amendment sit on the critical path.*

- **5.1 Profile variants.** `/u/[handle]` gains an audience mode: recruiter-facing (role-readiness framing) vs client-facing (services/offer framing). Same ledger data, different presentation layer. URL scheme decision needed (query param vs `/u/[handle]/hire` style) — register as a decision.
- **5.2 Case-study rendering.** Artefacts of type case_study/delivered_engagement render as structured case studies (problem → approach → outcome → evidence links).
- **5.3 Testimonial capture flow.** Freelancer sends a magic link to a client; client submits testimonial tied to an engagement; email-domain recorded. Verification tiering in Amendment 7.
- **5.4 Profile analytics (CRITICAL PATH — build early).** View events on /u/[handle]: referrer, section engagement, artefact link clicks, dwell. Privacy-respecting (no invasive fingerprinting), but enough to answer "did the recruiter open it and what did they look at" — this IS the measurement layer for the cold-email A/B and Provency's first employer-validation data.
- **5.5 Share polish.** OG images per profile, sensible meta, copy-link UX. Small, but it's the first impression in a cold email.
- **DoD:** both variants render from live ledger data; a test testimonial round-trips; analytics events visible for a real profile view from an external device.
- **Effort: 5–8 days (5.4 + 5.5 alone: ~2 days — pull these forward to weeks 1–2).**

---

## AMENDMENT 6 — Employer-side MVP (demand side) — **HARD GATE: employer signal required**
*Do not start until cold-email responses exist. The scope below is the superset; recruiter behaviour selects the subset. Building this pre-signal is the named founder pattern.*

- **6.1 Employer identity (schema/auth).** `organizations` table, `org_members`, user role field, invite flow. RLS: employers read only what candidates have made public/shared — write the policies as a spec first, review as its own gate (this is the highest-consequence security surface in the plan).
- **6.2 Candidate discovery.** Search/browse over opted-in profiles: filter by verified concepts/clusters, evidence density, jurisdiction. Requires an indexed/materialised summary of ledger output (extends Amendment 1.2). Explicit candidate opt-in flag — profiles are not searchable by default.
- **6.3 Role definition → syllabus mapping.** Employer pastes THEIR JD → generates the syllabus shape → sees which candidates match it. This is the marketplace's killer mechanic and reuses the existing generator wholesale. Likely the single highest-value employer feature — validate demand for it in the cold emails ("would you define a role this way?").
- **6.4 Shortlist + contact.** Save candidates, request intro / message. v0 can be mailto-level; do not build in-app messaging until asked for.
- **6.5 Verification request.** Employer flags a concept → candidate prompted to complete/refresh the check or attach artefact. Closes the trust loop; scope only if signal demands.
- **DoD per feature:** one real external user (a recruiter contact) completes the flow — not a fixture.
- **Effort: 10–15 days for the signal-selected subset. Full superset: 4–6 weeks — do not build the superset.**

---

## AMENDMENT 7 — Trust & integrity
*"Honesty is the product" becomes a security requirement the moment a third party relies on the data.*

- **7.1 Verification taxonomy doc.** One page defining every evidence state (self-assessed / check-passed / artefact-verified / client-attested / employer-verified) and exactly what each requires. This doc governs all UI labels — no surface may claim a stronger state than the taxonomy grants.
- **7.2 Check integrity, honest version.** Accept that take-home checks are LLM-assistable; respond with labelling (checks marked "unproctored") + optional harder tiers later (timed, or live-verify via 6.5) rather than pretending to anti-cheat. Register this as a product decision — it's a positioning statement, not a gap.
- **7.3 Artefact provenance.** For GitHub-linked artefacts: verify repo ownership (handle match or gist challenge), surface commit-history age. Cheap, high-credibility.
- **7.4 Testimonial verification tiers.** Unverified (candidate-entered) < email-verified client < company-domain-verified. Displayed differently; ledger weights accordingly.
- **7.5 Abuse basics.** Rate limits on generation and profile views; report mechanism stub.
- **Effort: 3–5 days (7.1 is half a day and should happen during Amendment 4).**

---

## AMENDMENT 8 — Commercial + legal scaffolding
- **8.1 Billing.** Stripe, one paid tier, free-tier boundaries (e.g. 1 active syllabus free). Do not overdesign pricing pre-signal; the YC application needs *a* revenue mechanism, not a pricing strategy.
- **8.2 Legal.** ToS + Privacy Policy revision: candidate data displayed to employers is a materially different privacy posture (APP/Privacy Act 1988 weight in AU; note the Privacy Act reform tranche — verify current status when drafting). Candidate opt-in language must match 6.2's actual behaviour.
- **8.3 Metrics instrumentation.** Define and instrument the 5 numbers a YC partner will ask for: signups, activated (first syllabus 'ready'), evidence events/week, profiles shared, employer engagements. Dashboard can be a SQL script — do not build an admin panel.
- **Effort: 3–4 days.**

---

## AMENDMENT 9 — YC application workstream (Winter 2027)
- **9.1 Now:** create the YC account, read the current application, list every question — several answers (metrics, demo) shape what Amendments 5.4/8.3 must capture. Watch ycombinator.com/apply for the confirmed W2027 deadline (estimate: late Oct/early Nov).
- **9.2 Weeks 1–4 (parallel critical path):** ship medtech artefact; send 2–3 cold emails, A/B profile link, instrumented via 5.4. This produces the traction narrative — it is not separate from the YC plan, it IS the YC plan's evidence section.
- **9.3 Week 8–10:** draft application around the framing already registered: "built it to get myself hired; here's the artefact; here's what real recruiters did." Founder video. Get two external reads.
- **9.4 Submit 3–4 weeks before deadline** (early-in-window advantage), then keep shipping — progress between application and interview is the strongest interview asset.

---

## SEQUENCING MAP (12-week shape to est. W2027 deadline)

| Weeks | Track A (platform) | Track B (critical path) |
|---|---|---|
| 1 | Phase 0 → Amendment 1 start | Medtech artefact Layer-0 doc + spec |
| 2 | Amendment 1 finish; pull 5.4/5.5 forward | Medtech build via harness |
| 3 | Amendment 2 | Ship artefact public; send cold emails |
| 4 | Amendment 3 | Follow-ups; watch 5.4 analytics |
| 5–6 | Amendment 4 (4.1, 4.5 first) + 7.1 | Read signal; register decisions |
| 7–9 | **GATE:** Amendment 6 signal-selected subset | Second-round outreach if warranted |
| 10 | Amendments 7 (rest) + 8 | Application draft (9.3) |
| 11 | Buffer / defect burn-down | Video, external reads |
| 12 | Freeze; prod smoke of everything | Submit early-in-window |

**Total platform effort: ~38–55 working days of superset scope compressed by the gates into a realistic ~30–35 days — which is why Amendment 6's gate and Amendment 4's deferral option exist. If anything slips, the cut order is: 4.2–4.4 (freelance mode) first, 6.4–6.5 second, never Track B.**

## STANDING RULES FOR THIS PLAN
1. Track B never yields to Track A. A week where platform shipped but no outreach moved is a failed week under D5.
2. Every migration: dev first, dry-run, human gate, safe transport, typed-PROD confirmation (2.3).
3. Decisions raised here to register: pathway placement (4.1), profile URL scheme (5.1), check-integrity positioning (7.2), opt-in default (6.2).
4. "The test passed" ≠ "I watched it work" — every user-facing DoD includes a real-eyes drill.
5. This document is versioned; no silent edits. Changes create v2 with a delta note.

## DELTA NOTES

- **28 Aug:** verification-layer thesis + conceptual schema documented; schema remains paper, gated on employer signal (A6 gate). Current-role wedge added as W-track, gated on EEG v1.0.0. Repositioning (PR-2) sanctioned.
