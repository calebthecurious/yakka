# Provency Upgrade Plan v2 — The Verification Layer
*2 Oct 2026. SUPERSEDES Upgrade Plan v1 (13 Aug) and absorbs its delta notes. Commit as docs/upgrade-plan-v2.md beside v1 (v1 stays for history; this governs). Companion docs unchanged: verification-layer-v1.md (thesis + paper schema), strengthening-pack-v1.md, verification-taxonomy.md.*

**What changed since v1:** the cold emails went out and recruiters replied with interest — specifically in placing candidates with more confidence and trust. That is the employer signal every v1 gate was keyed on. v2 resequences the work around converting that signal, building the verification layer the thesis describes, and arriving at the YC mid-2027 application with revenue slope instead of a feature list.

---

## ⚡ THE FRAME v2

- **North star metric: DISPLACEMENT** — an employer skips a step of their own hiring process because of a Provency record. Everything is instrumented toward producing and counting these.
- **D5 evolves: conversations before code.** Interest in a concept is not validation of features. Every build amendment below is scoped by what design partners say on calls, and no employer-facing table ships ahead of ≥2 completed discovery calls. The comfortable substitute is still building; the scary thing is now scheduling calls with people who already said yes.
- **Application target: YC mid-2027** (Summer batch; verify the actual deadline at A9.1 — do not trust estimates). Application-day goal: **$15–30k MRR equivalent, 2–3 named employer design partners converted to paid, W4 candidate retention curve, and ≥5 logged displacement events.** "$1M app" = unit economics where $1M ARR is multiplication (≈100 employers × $10k/yr, or 60 employers + ~1,500 candidate subs), demonstrated, not claimed.
- **Revenue stance (registered, unchanged):** employer subscriptions + candidate premium. NO contingent placement fees, ever (misalignment + disintermediation). Optional non-contingent verification services allowed.
- **Positioning line:** "LinkedIn shows who you know and what you claim. Provency shows what you can do — and proves it." Acquisition potential (LinkedIn/Microsoft, SEEK, Indeed, Workday) is private strategic context; it appears in NO application material.

## CARRIED STATE (check before anything opens — inherit from handover v5)
- Done: Amendment 1 (ledger unification, single-truth lock), resumable generation, honesty fixes, docs in-repo, Supabase cutover Y1–Y2 (data verified across).
- [confirm] Cutover tail closed: Y3 commit, Y4–Y5 (GENERATED password), health, the one push, 10b old-project rotation/pause.
- [confirm] provency.ai DNS resolves. (Blocks ALL employer-facing sharing; fix before anything in A1 sends a link.)
- [confirm] EEG artefact v1.0.0 tagged + public (gates A3).
- [confirm] PR-2 repositioning + PR-3 timestamps ran post-push.
- [confirm] P0.3 prod smoke; Chiefy browser-profile separation.
Anything unconfirmed here is Phase A0 and precedes its dependents.

---

## A1 — SIGNAL CONVERSION: the design-partner program  ⭐ OPENS NOW, OUTRANKS EVERYTHING
*Not a CC amendment — calls, emails, and writing sessions. The output is the input to A4–A6.*

1. **Reply to every recruiter who engaged, within days.** Warm interest decays weekly. Draft (writing session): thank → one-line thesis → offer a free 8–12 week design-partner pilot: we define one role standard with you, your candidates/new-hires use it, you get the readiness dashboard; in exchange, a 30-min discovery call and feedback cadence.
2. **Discovery call script — the three questions** (they map 1:1 onto the paper schema's unknowns):
   (a) How do you establish a candidate can do what they claim today, and what does that cost? (→ evidence tiers, displacement candidates)
   (b) How long until a new hire is productive, and what's the ramp made of? (→ curricula, Day-One Ready scope)
   (c) Would you let an external tool build training on your internal practices — what would have to be true? (→ org_instance confidentiality, security posture)
   Plus: "Which step of your process would a verified record let you skip?" — the displacement question, asked directly.
3. **Pilot terms one-pager** (A8 legal lite): free, time-boxed, data handling stated, no exclusivity, conversion price named up front ($500–1,000/mo range to anchor).
4. **Target: 3 active design partners by end of Nov; ≥2 discovery calls inside 3 weeks.**
5. Every call → a filled scope card: which A5/A6 features they actually asked for, verbatim quotes, their ramp number. These cards ARE the gate keys below.

**DoD:** 3 partners engaged, 3 scope cards, ≥1 claimed role standard in hand.

## A2 — THE PRODUCT SAYS WHAT IT IS (repositioning + Constellation v0)
*Candidate-side, ungated, runs parallel to A1.*

1. PR-2 (copy pass) + PR-3 (evidence timestamps) if not already landed [confirm].
2. **Constellation v0** — evolve the goal mandala into the public profile's centerpiece: interactive evidence map; node = claim, brightness = tier, click = evidence detail (artefact link, check date, attestation), time scrubber over `occurred_at`. Ledger-sourced only (single-truth lock stays green). Shareable/embeddable (OG work extends). This is the demo centerpiece for recruiters AND the YC video.
3. Profile analytics live (P5.4a/b) + per-partner utm links so A1 calls are instrumented.
**DoD:** a recruiter clicking a pilot link sees the thesis, the Constellation, and honest tier labels; we see what they looked at.

## A3 — CURRENT-ROLE WEDGE (W-track, the retention engine)
*Gate: EEG v1.0.0 tagged [confirm]. Slices W-1→W-4 as written in strengthening-pack-v1: purpose enum → current-role intake ("paste your current JD") → weekly this-week surface → metrics (W4 return cohort).* Success metric is week-4 return, measured before any invite scales. This is what makes the candidate side weekly instead of episodic — the subscription depends on it.

## A4 — EVIDENCE SPINE MIGRATION (the paper schema goes live, additively)
*Gate: ≥2 A1 discovery calls completed (so tiers/confidentiality reflect answers, not guesses).*

Per verification-layer-v1.md §5 mapping, additive and incremental, dev-first, G-gate batched:
1. `capabilities` taxonomy + `capability_claims` (syllabus tree becomes a view over it).
2. `evidence` spine (kind + tier + occurred_at/recorded_at + supersession + revocation); existing artefacts/checks mapped in as kinds; ledger engine re-pointed (tests prove parity with today's numbers).
3. `attestations` (reputation-staked, frozen attester standing, revocable) — upgrade of the testimonial design.
4. `process_traces` (gist-challenge provenance + commit timelines) — the cheapest credibility feature; ships early.
5. `standards` + `standard_requirements` (versioned, org-ownable) — seeded with the A1 claimed role standard as row one.
Presence verification stays designed-not-built until a partner asks (rationing model ready).
**DoD:** one real design-partner standard live; one candidate's full record rendered from the spine; parity tests green; taxonomy labels unchanged on all surfaces.

## A5 — EMPLOYER MVP, SIGNAL-SELECTED  (v1's A6, scope now chosen by scope cards)
*Gate: ≥1 signed design partner + A4.5 standards live. Build ONLY what the cards named; strike the rest.*

Superset to select from: org identity + RLS per the spec-first discipline (P6.1 spec → review gate → implement verbatim) · claim-your-page + role standard definition (their JD → standard → candidate match with explainable, deterministic scoring) · readiness dashboard per standard · **Day-One Ready pilot**: partner's onboarding material → org_instance curriculum → ramp-coverage view (confidentiality per their (c) answer) · shortlist + candidate-consented intro (mailto v0) · **displacement_events logging — non-negotiable, whatever else is cut**: every pilot records which step got skipped, employer-confirmed.
**DoD per feature:** one real recruiter completes the flow. **DoD for the amendment:** first displacement event logged.

## A6 — DEMAND BEACONS (the growth loop, consent-shaped)
*Gate: candidate volume makes thresholds honest (≥5 users targeting a single company) + legal copy reviewed (Spam Act 2003: inbound-shaped, aggregate, opt-out honored; NO per-user automatic disclosure — individual intros only on candidate's explicit action).*

1. Dream-company targeting on syllabus creation (data already implied by JD source; make it explicit + consented).
2. Threshold notice: "N engineers are building toward roles at [company] — claim your page, publish your real stack, define your standard." One email, aggregate, anonymous.
3. Claimed page → free tier of A5 (standard definition) → paid conversion path.
This makes every candidate recruit their own dream companies. It is the SAME loop as the original outbound idea with the consent inverted — and stronger for it.

## A7 — NEXT-LEVEL MAPS (career ladders)
*Gate: A4.5 standards versioned per level exists; opens when ≥1 partner defines a two-level ladder OR candidate demand shows in W-track usage.*
Diff engine: user's ledger vs the next level's standard → "what stands between you and Senior X" with evidence requirements. Reuses the generator + readiness matching wholesale. This is the "roadmaps to next levels" promise and the premium-tier anchor feature.

## A8 — COMMERCIAL + LEGAL
1. Billing live (Stripe): candidate premium (price test A$19–29/mo; W-track + Next-Level Maps + unlimited paths behind it) + employer subscription ($500–1,000/mo pilot → $800–1,500 converted). Free tiers stay honest and useful.
2. ToS/Privacy for employer-visible candidate data (opt-in discovery default OFF), org_instance confidentiality terms, pilot agreement template, Spam Act review for A6, APP compliance (verify current Privacy Act reform status at drafting).
3. **Metrics script v2 — the seven numbers:** signups · activation (first 'ready') · W4 return (current-role cohort) · evidence events/week · profiles shared externally · paying (candidate + employer MRR) · **displacement events**. SQL script, no dashboard.

## A9 — YC APPLICATION WORKSTREAM (mid-2027)
1. **Now:** YC account; copy every question; VERIFY the Summer 2027 deadline on ycombinator.com/apply (do not run on estimates); map each question to its evidence source (A8.3 metrics, scope-card quotes, displacement log, the Constellation demo, the EEG/cold-email origin story).
2. Monthly metric snapshots from A8.3 start now (slope needs history).
3. Application narrative (locked): *built it to get hired → recruiters asked for a pipeline of verified candidates → companies now pay us to define "ready" and our candidates skip their screens.* No LinkedIn-killer framing; no exit talk.
4. Draft + video Apr 2027 (two external reads); submit early-in-window; keep shipping through decision.

---

## SEQUENCING MAP (quarters to application)

| When | Revenue/market track | Build track |
|---|---|---|
| **Oct–Nov 26** | A1: replies this week, ≥2 calls in 3 wks, 3 partners by end Nov | A0 carried items; A2 (Constellation v0, analytics); A3 W-track |
| **Dec 26** | Pilots running; scope cards final; first ramp numbers | A4 spine (post-2-calls); A5 spec + first selected features |
| **Jan–Feb 27** | **First paid conversions** (2–3 partners); candidate premium on | A5 complete per cards; **first displacement events**; A6 beacons if volume |
| **Mar 27** | MRR slope visible; 2nd-wave outreach using partner proof | A7 ladders; A8 legal/billing hardening |
| **Apr–May 27** | $15–30k MRR equivalent target; logos + quotes secured | A9 draft, video, metrics snapshots, submit early-window |
| **Jun 27+** | Keep shipping through decision window | Buffer; second employer cohort |

**Cut order if slipping:** A7 → A6 → A5 breadth (never displacement logging) → A3 scale-up. Never cut: A1 cadence, metrics snapshots, honesty labels.

## STANDING RULES v2
1. **Conversations before code** — no employer feature builds ahead of its scope card.
2. Displacement is the metric; everything instruments toward it.
3. Harness discipline unchanged: six-part prompts (packs written per-amendment as each opens), dev-first migrations, G-gate batched prod applies (typed PROD, direct 5432), one CC session per repo, STOP = real-eyes + commit + next precondition cites the hash.
4. No new infrastructure during any time-boxed build. No placement fees. No per-user outbound disclosure. Taxonomy doc governs every label.
5. Plan v2 is versioned — changes are dated delta notes, never silent edits.

## GATE LEDGER v2
- **G-A3:** EEG v1.0.0 tag [confirm → may already be open]
  - **2 Oct 2026 — G-A3 OPEN.** `v1.0.0` tagged on `9a9afb9` ("matched 10-subject control…"; README full run: within-subject 58.0%, LOSO 55.6%) and public at https://github.com/calebthecurious/eeg-stream-demo. Verified by `git ls-remote --tags origin` → `refs/tags/v1.0.0^{}` = `9a9afb9`. The W-track (W-1 → W-4) may now open in order.
- **G-A4:** ≥2 discovery calls done
- **G-A5:** ≥1 signed design partner + standards live
- **G-A6:** volume threshold + legal copy
- **G-A7:** ladder standard exists or W-track demand
- **G-prod:** every migration batch per the standing ritual

---
*End of Plan v2. The first action under it is not a prompt: it is the reply email to the recruiters who said yes, drafted this week while the interest is warm. Everything else in this document is downstream of those conversations.*
