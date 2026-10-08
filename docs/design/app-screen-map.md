# App screen map — APP-1 Phase A (inventory, no design)

Inventory of every authenticated route in `src/app`, taken at HEAD `5933214`
on 8 Oct 2026, read against `docs/verification-taxonomy.md` and the ledger
module (`src/lib/readiness/`). Screenshots at 1440 wide, signed in as the
seed fixtures on the local stack, live in `docs/design/app-screens/`
(numbered to match the table). Prod liveness was checked by behaviour on
`yakka-two.vercel.app`, which serves `d6ad8f1` (the three landing commits
`97795e6`..`5933214` are local only: `/privacy` → 307 there, so PR-4b is not
deployed). Nothing in this document is a design.

## Preconditions, as found

- **PR-4c (landing v3) has run but is not committed.** `landing-v3.pen`,
  its two PNG exports and `landing-v3-handoff.md` are untracked in the
  working tree. The handoff says the brief's copy was never pasted (every
  brief-owned string is a `[BRIEF: …]` slot) and leaves three questions
  open. Its variable delta lists the v3 set as the 30 v2 variables, two of
  them re-valued, plus 14 added. That is the only confirmation available:
  the pen.dev MCP timed out on every call (the extension needs a `.pen`
  open in VS Code), so the `.pen` itself was not opened. Phase B needs both
  pen.dev reachable and PR-4c committed, or the app inherits an unfixed
  system.
- The screenshots are local, not prod: the fixture users exist only in the
  docker stack. `/u/fixture-fiona` on prod → 404, as expected.
- The syllabus workspace renders a raw ledger JSON `<pre>` above the header
  whenever `NODE_ENV !== "production"` or `READINESS_DEBUG=1`
  (`src/app/syllabi/[id]/page.tsx`, marked TEMPORARY). It is 35 KB of text
  on the current-role fixture and would have been the whole screenshot, so
  the two workspace captures had that one element removed before capture.
  Everything else is as rendered.

## Taxonomy words the inventory checks against

Allowed state words (`formatTierLabel` and the Register): **Verified**
(rungs 2–3), **Self-assessed** (rung 1), **In progress** / *Currently
developing* (rung 0), **Not started** (unranked). Evidence labels are only
`formatEvidenceLabel[Dated]`, `formatArtefactVerifiedLabel`,
`formatRecordSinceLabel`. Rungs 4–5 and the E-track render nothing.

## Routes

Nav today (`src/components/nav.tsx`): **My syllabi**, **New syllabus**, and
under the avatar menu **Profile** (→ `/u/<handle>`) and **Settings**.
Anything else is reached from inside a page or by redirect. "Reach" below is
the shortest path from that nav.

| # | Path | Purpose | Reads | Taxonomy states rendered | Prod | Reach from nav | Shot |
|---|---|---|---|---|---|---|---|
| 1 | `/syllabi` | Post-login home: list of the user's syllabi as cards; empty-state welcome for a new user | `syllabi` (role, company, purpose, createdAt, metadata.structuralBlockers) | none. Renders "Current role" tag, "N blocker(s)" | live | nav | 01, 16 |
| 2 | `/syllabi/new` | Purpose selector + JD/skills paste + optional resume PDF; or the Premium wall when the account has ≥1 active syllabus (W-5) | count of non-failed `syllabi`; entitlement config | none | live | nav | 02 (wall), 17 (form) |
| 3 | `/syllabi/[id]` | Syllabus workspace: header counts, Start-here banner, weekly panel (current_role only), blockers, Mandala/Tree toggle, per-cluster project card, artefact rows + Log-artefact form, sub-skill → concept rows, delete | `loadSyllabus` tree (clusters, sub-skills, concepts, resources, checks, artefacts, foundation items) → `computeReadinessLedger` → `summarizeReadinessLedger`; `weeklyPanelData` | **Verified** (header count, tree counts, artefact badge), **Not started** (mandala dot). Also renders **Learning**, **Understood**, raw-status **Verified** — see flags A1, A2 | live | list card | 03 (mandala), 03b (tree), 03c (sub-skill open), 04 (current role) |
| 3′ | `/syllabi/[id]` generating / failed | Same route while `status=generating` or a unit failed: per-unit list, poll, retry; or the terminal "Generation failed" view | `syllabi.status`, `skeletonStatus`, sub-skill `generationStatus`, cluster `artefactStatus` | none (generation states, not evidence) | live | list card | 20 |
| 4 | `/syllabi/[id]/start` | Start here: assumed baselines with I-have-this / I-need-this, readiness summary sentence, ordered launch steps linking to concepts | `foundationItems` (+ linked concept name/status) | **Verified** from raw `concepts.status`; also **Learning**, **Understood** — flag A1 | live | workspace banner | 05 |
| 5 | `/syllabi/[id]/gap` | AI gap report vs the resume text: strengths, in-progress, not-started, blind spots, soft skills, signal recommendations; empty states | `gapReports` row; concept id→name/status map | raw-status **Not started / Learning / Understood / Verified** badges — flag A1. Summary says "N requirements already evidenced" from the AI report, not the ledger — flag B4 | live | workspace header button | 06 (empty) |
| 6 | `/syllabi/[id]/company` | AI company insight from public sources: verified facts, tech signals, inferences, alignment notes; empty states; 404-ish state when no company | `companyInsights` row; `syllabi.targetCompany` | none of the ladder. Uses the word "Verified facts" for sourced claims — a different sense of verified on an evidence product; flag A5 | live | workspace header button (only when a company is set) | 07 (empty) |
| 7 | `/concepts/[id]` | Concept page: breadcrumb, status badge, Start-here CTA (ledger-selected), Why-this-matters (AI), Deeper understanding (AI), Status controls, Resources + study briefs, Check your understanding, Notes & sessions | concept + resources, sessions, briefs, latest completed check, expansion, relevance; full syllabus ledger for the CTA | **Verified** badge is raw `concepts.status`, not the ledger — flag A2. Also **Learning**, **Understood**. CTA copy: "This one is evidenced" (ledger) | live | tree row, mandala dot, weekly "Next", start step, gap "Continue →" | 08 (verified), 09 (retake) |
| 7′ | `/concepts/[id]#check` | Check flow (inline, same route): generate 5 MCQs → answer one at a time → results; passing offers "Mark as understood" | writes `competency_checks` (`startCompetencyCheck`, `completeCompetencyCheck`); then optionally raw status | "Strong grasp" / "Some gaps to close"; score N/5; offers **Understood** after a pass — flag A3 | live | concept page `<details>` | 09 (idle with last score) |
| 8 | `/clusters/[id]/artefact` | The suggested project for an artefact-bearing cluster: title, description, acceptance criteria preview, "Commit to this project" | `skillClusters.suggestedArtefact`, `.artefactTarget`, sub-skills | none. "AI-suggested" tag | live | Tree → cluster → Project card → expand → "View details & build"; or concept CTA `attach_evidence` | 10 |
| 9 | `/artefacts/[id]` | Artefact detail: edit title/type/description/URLs/reflection, acceptance criteria editor, progress log, demonstrated-concept chips, Mark verified / Delete | `artefacts` row + cluster concepts | **Verified** / "Not yet verified" badge from `verifiedAt`; "N / M criteria done" | live | Tree → artefact row title | 11 |
| 10 | `/settings` | Email; featured syllabus picker; display name, handle, headline, three URLs; three public-section toggles; sign out | `profiles`, `syllabi` (for the picker) | names the toggle words "Self-assessed understanding", "Currently developing" (allowed) | live | avatar menu | 12, 19 (no syllabi) |
| 11 | `/profile` | Redirect only → `/u/<handle>` or `/profile/setup` | `profiles.handle` | — | live | avatar "Profile" links straight to `/u/`; `/profile` itself is unlinked | 13 (lands on /u/) |
| 12 | `/profile/setup` | Pick a handle (first login); redirects to `/syllabi` once a handle exists | `profiles.handle` | — | live | middleware redirect only; unreachable once a handle exists (screenshot impossible with the fixtures — all have handles) | — |
| 13 | `/u/[handle]` | Public record (public route, but the product's output): header + honesty sentence + since-line, Constellation, four counts, artefacts, verified competencies with dated labels, self-assessed (toggle), learning trail (toggle), currently developing (toggle) | public-safe `profiles` columns; featured (or latest) syllabus; full ledger via `computeReadinessLedger`; `constellationData`; `gapReports.gapsInProgress` | **Verified / Self-assessed / In progress / Not started** via `formatTierLabel`; evidence via `formatEvidenceLabelDated`; "Verified d MMM yyyy"; "Building this record since …". Artefact cards also say **Completed** / **In progress** — flag A4 | live | avatar "Profile" | 13, 18 (empty) |
| 14 | `/u/dev-constellation` | Dev-only Constellation preview on a labelled fixture (full, sparse, empty); 404 in production | none (in-memory fixture) | the four tier words | **not live** (404 by design) | unreachable; URL only | 14 |

Unauthenticated routes, for completeness, not in scope for APP-1: `/`
(redirects a signed-in user to `/syllabi`), `/login`, `/signup`, `/privacy`,
`/auth/callback`, `/u/beacon` (POST only).

## Flags

### A. State words not in the taxonomy

- **A1 — "Learning" and "Understood" are rendered as states** on the
  workspace tree (`concept-row.tsx` checkbox: indeterminate = learning,
  checked + strike-through = understood/verified), the mandala
  (`goal-mandala.tsx` `STATUS_LABEL`, dot colours, mobile chips), the concept
  page badge and `status-controls.tsx`, the gap report (`STATUS_STYLE`), and
  the start page (`CONCEPT_STATUS_BADGE`). The taxonomy's words for those
  rungs are **In progress** and **Self-assessed**. Six files; one vocabulary.
- **A2 — "Verified" rendered from raw `concepts.status`**, which the
  taxonomy says is a self-mark that "grants nothing": the concept page header
  badge (`STATUS_BADGE[concept.status]`), the status control that lets the
  learner *set* `verified`, the mandala's concept dots/labels, the gap
  report's concept badges, and the start page's linked-concept badge. On the
  Sampling fixture the badge happens to agree with the ledger; on a concept
  the learner sets to `verified` with no evidence, it does not. The
  workspace header and tree counts are correct (ledger), so the same screen
  shows a ledger "Verified" count beside raw-status "Verified" marks.
- **A3 — The check flow ends in a self-mark.** A pass (≥ 4/5) is rung 2
  evidence the moment it is written, but the results panel says "Passing
  suggests you're ready to mark it understood — the call stays yours" and
  offers **Mark as understood**, i.e. a weaker, self-declared state after a
  stronger evidenced one. The fail state is correct in substance (nothing
  but the check row is written; "Generate a new check") but the copy
  ("Some gaps to close") does not say that nothing was written.
- **A4 — Artefact state words off the allow-list.** Workspace artefact rows:
  **Self-logged** (unverified) and **Verified**, with **Unverify / Verify**
  buttons; artefact detail: **Not yet verified**, "Mark verified",
  "Verified — click to unverify"; public card: **Completed** / **In
  progress**; artefact form checkbox: "Mark as verified — shows on public
  profile". The Register allows `Verified <d MMM yyyy>` on an artefact card
  and nothing else. Underneath, `verifiedAt` is set by the owner clicking a
  button, so rung 3 is currently self-declared at the artefact level — the
  design should show that honestly (the verify action and its date are the
  learner's), not hide it.
- **A5 — Two unrelated senses of "verified".** The company page's "Verified
  facts" (a source URL was retrieved) and the gap report's "requirements
  already evidenced" (the AI matched resume text) reuse the product's two
  key words for things that are not ledger evidence.
- **A6 — Mandala accessibility copy says "understood" for the verified
  count** (`aria-label="… N of M concepts understood"`, hover
  "x/y understood", mobile "N / M concepts understood") while the number is
  the ledger's evidence-gated verified count.

### B. Progress numbers derived rather than counted

- **B1 — Percentages on the workspace.** Mandala centre ring and label
  (`Math.round(overall.pct * 100)%`), each cluster's arc and `%` label, the
  tree's cluster progress bar width, the mobile stacked ring. All are
  `ratioPct` over ledger counts, so they are honest arithmetic, but they are
  percentages, which the brief rules out. The counts (`3 / 8`, `2/6`) are
  right beside them and suffice.
- **B2 — "~47h estimated"** in the workspace header is Σ `estimatedHours`
  over sub-skills (and `~20h` per sub-skill row): an AI estimate summed, not
  a ledger count.
- **B3 — Generation progress bars.** `generating-view.tsx` draws
  `doneSub/totalSub*100` (honest, but a %), and `generation-loading.tsx` (the
  old inline-generation overlay, still mounted while `createSyllabus` is
  pending) draws a timer-driven bar capped at 92% with timer-driven stage
  lines — its own comment calls them "not real progress".
- **B4 — Gap summary sentence** composes "Strong start — N role requirements
  already evidenced; main gaps are …" from the AI report's array lengths.
- **B5 — Start page readiness summary** composes "You're ready" /
  "A few things to shore up first (N)" from self-declared baseline marks;
  guidance, never evidence, but it reads as a verdict.
- Correct today, for the record: public-profile counts, the workspace
  header's `(N verified)`, the weekly panel's three facts, artefact
  `N/M criteria`, `1/1 verified` artefact badge.

### C. Screens a user cannot reach from the nav

- `/profile/setup` — middleware redirect only (fine; it is the first-login
  gate). `/profile` — never linked; the avatar menu links to `/u/` directly.
- `/u/dev-constellation` — dev only, by design.
- **The write surfaces are a toggle deep.** The workspace defaults to the
  Mandala; concept checkboxes, "Log artefact", artefact rows and the Project
  card (the only path to `/clusters/[id]/artefact` besides the concept CTA)
  are all inside the **Tree** view, and the Project card needs a second
  expand before "View details & build" appears. `/artefacts/[id]` is reached
  only from an artefact row's title.
- The weekly panel (W-3) exists only on current-role workspaces; a get-hired
  syllabus has no "this week" surface anywhere.
- `/syllabi/[id]/company` disappears when the syllabus has no target company.

### D. Other things the redesign should know

- The post-login landing is the syllabi list (`/` redirects there). There is
  no record home: the Constellation and the honesty sentence exist only on
  the public `/u/` page and the landing fixture.
- Resource status (Planned / In progress / Done — a resource vocabulary,
  not evidence), add-your-own-resource, notes autosave, study briefs,
  "Why this matters" and "Deeper understanding" are all on the concept page;
  only the check and the artefact link write to the ledger.
- Every destructive action uses `window.confirm` / `alert`.
- `cycleConceptStatus` on the tree checkbox cycles not_started → learning →
  understood → not_started, so a verified concept's checkbox can be unticked
  (sets `not_started`) without touching its evidence.

## Proposed design list (eight screens, record-home first)

Ordered for Phase B. Each line names the routes it absorbs, so cutting one
is explicit.

1. **Record home** — new, replaces `/syllabi` as the post-login landing:
   compact Constellation + honesty sentence + since-line, a "This week" list
   (the weekly panel generalised to every purpose), and the one-line empty
   state for a new user (today's "Welcome to Provency" card, 16).
2. **Syllabus workspace** — `/syllabi/[id]`: clusters | current concept |
   evidence. Absorbs the Tree, the Mandala, the Start-here banner, the
   weekly panel, and the per-concept page's header, status and CTA. Fixes
   A1, A2, A6, B1, B2, C (write surfaces no longer behind a toggle).
   Includes its generating / failed states (20) as variants.
3. **Check flow** — `/concepts/[id]#check` as one screen: one question,
   one action, result written and shown with its date; fail writes nothing
   and says so. Fixes A3.
4. **Artefact log** — the Log-artefact form plus `/artefacts/[id]`: link,
   which concepts it evidences, dated; the verify action named as the
   learner's own, with its date. Fixes A4. (`/clusters/[id]/artefact`
   becomes the empty state of this screen for a bearing cluster.)
5. **New syllabus** — `/syllabi/new`: purpose selector and paste box above
   the fold; resume upload and skills below; the Premium wall as its second
   state (02).
6. **Syllabi list** — `/syllabi` when more than one: rows with TierBadge
   counts and the Current-role tag, no cards (01). Reached from the rail,
   not the landing.
7. **Profile settings** — `/settings` + `/profile/setup`: handle, the three
   visibility toggles, share link with utm; the featured-syllabus picker
   moves to the syllabi list rows (one "Featured" state).
8. **Public record** — `/u/[handle]`: no layout change proposed (PR-3 / C-2
   already hold the honesty model); re-skin onto the v3 tokens so the
   Constellation and the app share one system, and resolve A4 on the
   artefact card. Cut this if eight is too many; it is the only screen that
   already uses the token set.

Deliberately not in the list: gap analysis (5), company insight (6), Start
here (4) and the concept page's AI sections (Why this matters, Deeper
understanding, study briefs, notes). They are generation surfaces, not
ledger surfaces, and nothing on them writes evidence. They stay reachable
from the workspace and inherit the shell, tokens and TierBadge when the
code lands; their own redesign is a later prompt.

## Screenshot index

`docs/design/app-screens/`, all 1440 wide, full page, local dev stack:

| File | Route | User |
|---|---|---|
| 01-syllabi-list.png | /syllabi | fixture-fiona |
| 02-syllabi-new.png | /syllabi/new (Premium wall) | fixture-fiona |
| 03-syllabus-workspace-get-hired.png | /syllabi/f1f7…0001 (Mandala, debug `<pre>` removed) | fixture-fiona |
| 03b-syllabus-workspace-tree-view.png | same, Tree view | fixture-fiona |
| 03c-syllabus-tree-subskill-expanded.png | same, one sub-skill open (concept rows) | fixture-fiona |
| 04-syllabus-workspace-current-role.png | /syllabi/5e8e…8bd6 (current_role, weekly panel, blockers; debug `<pre>` removed) | fixture-fiona |
| 05-syllabus-start.png | /syllabi/f1f7…0001/start | fixture-fiona |
| 06-syllabus-gap.png | /syllabi/f1f7…0001/gap (empty) | fixture-fiona |
| 07-syllabus-company.png | /syllabi/f1f7…0001/company (empty) | fixture-fiona |
| 08-concept-verified-sampling.png | /concepts/…0301 (ledger-verified; CTA move_on) | fixture-fiona |
| 09-concept-retake-filters.png | /concepts/…0302 (failed check 2/5; CTA retake; check panel open) | fixture-fiona |
| 10-cluster-artefact-suggested.png | /clusters/…0101/artefact | fixture-fiona |
| 11-artefact-detail.png | /artefacts/…0401 (verified, 3/3 criteria) | fixture-fiona |
| 12-settings.png | /settings | fixture-fiona |
| 13-profile-redirect-public-record.png | /profile → /u/fixture-fiona | fixture-fiona |
| 14-dev-constellation.png | /u/dev-constellation | any |
| 16-syllabi-list-empty-new-user.png | /syllabi (empty state) | fixture-fatima |
| 17-syllabi-new-form.png | /syllabi/new (the form) | fixture-fatima |
| 18-public-record-empty-new-user.png | /u/fixture-fatima | fixture-fatima |
| 19-settings-no-syllabi.png | /settings (no syllabi) | fixture-fatima |
| 20-syllabus-generating-view.png | /syllabi/f1f7…0002 (wedged generation) | fixture-fergus |
