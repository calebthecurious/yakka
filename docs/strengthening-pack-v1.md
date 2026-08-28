# Strengthening Pack v1 — repositioning, instrumentation, current-role wedge
*27 Aug 2026. Companion to Upgrade Plan v1 + the Verification Layer doc.*

## GATE HEADER — read before pasting anything
- **Track B still outranks this pack.** These run in gaps (training runs, deploy waits) or after v1.0.0 tags. Exceptions already standing: P5.4a/b + P5.5 (cold-email instrumentation).
- **Runs now:** PR-1, PR-2 (after the copy session), PR-3, P5.4a, P5.4b, P5.5.
- **Gated on EEG v1.0.0 tag:** W-1 → W-4 (current-role wedge).
- **NOT in this pack, deliberately:** every verification-layer migration — organizations, standards, evidence spine, attestations, presence, displacement_events. Those are Amendment 6+ territory, gated on employer signal, and the schema doc's own posture note governs. Anyone (including future-me) proposing to "just add the evidence table now" is the pattern wearing a lab coat.
- Standing rules bind: one CC session per repo · dev-first migrations · prod applies only at G-gates with typed PROD · STOP = real-eyes + commit · next precondition cites the hash.

---

### PR-1 — Commit the paper (5 min, run anytime)
```
CONTEXT: Two design docs exist outside the repo: the verification-layer
thesis/schema doc and Strengthening Pack v1 (this file). Design capital
belongs in-repo where sessions can read it.

PRECONDITION: Clean tree on main (cite HEAD).

TASK: Commit as docs/verification-layer-v1.md and docs/strengthening-pack-v1.md
(I'll paste both). Append a delta note to the Upgrade Plan doc in-repo:
"27 Aug: verification-layer thesis + conceptual schema documented; schema
remains paper, gated on employer signal (A6 gate). Current-role wedge added
as W-track, gated on EEG v1.0.0. Repositioning (PR-2) sanctioned."

CONSTRAINTS: Docs only, no code.
DEFINITION OF DONE: Both files render; delta note appended.
VERIFY & STOP: Paste the delta note. One commit. STOP.
```

### PR-2 — Repositioning copy pass  [needs the approved copy first — writing session with Claude produces it]
```
CONTEXT: Product copy says "learning platform with honest progress." The
thesis is "verification layer: evidence that survives the age of generated
portfolios." Approved copy pack pasted below: [LATE-BIND: hero headline +
subhead, Prove-It card copy, /u/[handle] intro line, tier-label microcopy,
how-it-works step rewrites]. Constraint inherited from P1.11: no unlabelled
fake metrics; example figures keep the "Example workspace" pill.

PRECONDITION: Clean tree (cite HEAD); npm test green; check:single-truth 0.

TASK: Apply the copy pack across: app/page.tsx (hero, Prove-It row,
how-it-works), /u/[handle] header + footnote, and evidence/tier labels
EVERYWHERE they render — labels must exactly match the taxonomy doc's
allowed strings; if the copy pack conflicts with the taxonomy doc, STOP and
report rather than choosing. Vocabulary sweep: user-facing "progress"
strings on evidence surfaces → claims/evidence/verified vocabulary (grep
list in your report; internal identifiers unchanged).

CONSTRAINTS: Copy + markup only. No schema, no logic, no route changes.
Design system intact.

DEFINITION OF DONE: All surfaces read the new positioning; label test
(P1.6/P7.1b) green; tests green.

VERIFY & STOP: Before/after strings table. One commit. STOP for my
real-eyes read of the homepage and profile.
```

### PR-3 — Evidence timestamps surfaced (display-only accumulation)
```
CONTEXT: Accumulation is a thesis pillar; timestamps are the cheapest proof.
verifiedAt (artefacts) and check pass dates already exist in the data —
they're just not shown.

PRECONDITION: PR-2 committed (cite hash).

TASK: On /u/[handle] (both future variants inherit this): each evidence item
renders its date — "Verified 12 Mar 2026" / "Check passed 3 Aug 2026
(unproctored)" — sourced from existing ledger/evidence fields via the
formatEvidenceLabel path, never computed in the route. Profile header gains
one quiet line: "Building this record since <first evidence date>". Absent
dates render nothing (no placeholders, no fake precision).

CONSTRAINTS: Display only. No schema. Label strings via the taxonomy
allowlist — extend the allowlist in the same commit if the date suffix
needs a pattern entry.

DEFINITION OF DONE: Fixture profile shows dates on every evidenced item and
the since-line; label test green.

VERIFY & STOP: Fixture URL + rendered strings. One commit. STOP.
```

### P5.4a / P5.4b / P5.5 — as previously issued, two updates
Run exactly as written in the earlier packs, with: **(1)** the migration now follows the Amendment 2 workflow — dev-first via db:migrate:dev, prod apply queued for **G3** (batched, typed PROD, direct-5432 ritual per the pooler/DDL register line); **(2)** P5.5's OG image pulls the profile headline from the PR-2 copy so the link preview carries the thesis. Reminder attached to P5.5: **the OG link is worthless while provency.ai returns 000 — DNS (Y6) precedes outreach, not the OG image.**

---

## W-TRACK — Current-role wedge  ⛔ GATED: no W-prompt pastes before the EEG repo tags v1.0.0

### W-1 — Purpose on the syllabus (schema, smallest honest slice)
```
CONTEXT: The wedge: "help me do the job I already have, excellently."
Smallest schema footprint: purpose enum on syllabi — get_hired (default,
backfill) | current_role. NOT the full enrollments/standards model — that
stays paper per the gate header. purpose is forward-compatible with it
(maps onto enrollments.purpose when that day comes).

PRECONDITION: EEG v1.0.0 tagged (cite tag). Dev DB targeted (verify host).
Clean tree; tests green.

TASK: Additive migration (dev only): purpose enum + column, default +
explicit backfill. Thread through create action, types, zod. Zero behaviour
change for existing flows.

CONSTRAINTS: Dev apply only — prod joins the next G batch. No UI.
DEFINITION OF DONE: Column live on dev; existing tests green; purpose
readable end-to-end.
VERIFY & STOP: Dev column check + backfill count. One commit. STOP.
```

### W-2 — Current-role intake
```
CONTEXT: Entry point: "Paste your current job description." Same generator,
different framing: output presented as a role mastery map (what this role
demands / where you're verified / what to build next), not a get-hired
syllabus.

PRECONDITION: W-1 committed (cite hash).

TASK: Creation flow gains a purpose selector (two options, honest copy:
"Land a role" / "Master my current role"); current_role branch reuses the
JD paste + jurisdiction; generation runs the existing pipeline with purpose
threaded; syllabus header + empty states + CTA copy vary by purpose
([LATE-BIND: copy from the PR-2 session's second half]).

CONSTRAINTS: No generator prompt changes in this slice — framing is
presentation-layer. If generation output reads wrongly for current_role
(e.g. interview-prep flavoured), file examples in the report; a generator
variant is its own later prompt, gated on those examples.

DEFINITION OF DONE: Both purposes create end-to-end on dev; get_hired path
pixel-identical.
VERIFY & STOP: Both dev URLs. One commit. STOP for real-eyes.
```

### W-3 — The weekly loop
```
CONTEXT: The wedge's retention mechanism: a current_role workspace should
have a reason to return weekly. Smallest honest version: a "this week"
surface on the workspace — next unverified concept (reuses the P1.9 CTA
state machine), most recent evidence with its date (PR-3 pattern), and one
line of drift: "3 concepts verified in the last 30 days."

PRECONDITION: W-2 committed (cite hash).

TASK: Workspace panel for purpose=current_role only, composed entirely from
existing ledger/summary fields — if a field is missing, it goes in the
ledger module with a test (flag it), never computed in the panel.

CONSTRAINTS: No notifications/email in this slice (that's a later decision,
registered). No new tables.
DEFINITION OF DONE: Panel renders on a current_role fixture; absent-data
states graceful; single-truth check green.
VERIFY & STOP: Fixture URL. One commit. STOP.
```

### W-4 — Wedge metrics
```
CONTEXT: The wedge's success metric is week-4 return rate of current_role
users, not features shipped. Extend the 8.3 metrics script before inviting
anyone in.

PRECONDITION: W-3 committed; P5.4a events live.

TASK: scripts/metrics.ts gains: current_role workspaces created, weekly
active (any evidence event or workspace visit), and a week-4 return cohort
line once data exists (renders "insufficient data" honestly until then).

CONSTRAINTS: Read-only; SQL/script, no dashboard.
DEFINITION OF DONE: Script output matches hand-counted dev fixtures.
VERIFY & STOP: Side-by-side count. One commit. STOP. W-track closed —
next investment decision waits for four weeks of real cohort data.
```

---

## G-GATE LEDGER (updated)
- **G3 (next prod batch):** P5.4a analytics migration [+ any pending dev-only migrations]. Ritual: typed PROD, direct 5432 fetched fresh, post-apply smoke (one profile view event lands).
- **G3b:** W-1 purpose migration, batched whenever the W-track opens.
- **G4 (unchanged):** Amendment 6 / verification-layer migrations — employer signal required, schema doc posture governs.

## WHAT UNLOCKS THE PAPER SCHEMA
Three answers from real employers: what verification costs them today (→ evidence tiers), the shape of their onboarding ramp (→ curricula/purpose), and their confidentiality tolerance (→ org_instance). Until then the strongest schema work available is the conversation that's waiting on an EEG demo at T5 and a domain that doesn't resolve.
