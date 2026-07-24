# Provency — Roadmap

_Snapshot: 2026-07-18. Reviewed via `/plan-ceo-review` (SCOPE REDUCTION) + independent outside-voice challenge. Branch `feat/tree-density` (== `main` at `8cd16cd`)._

## North Star

**Caleb lands a medtech interview (Seer / Epiminder).** Provency is not the goal and not the main vehicle — it is the *honest frame* around real work. The thing that gets an interview is a strong, shipped project plus a specific cold email. Provency's job is to make that work legible and credible, not to substitute for it.

## What this review changed

The first draft treated the public profile as the deliverable. An independent review pushed back, correctly: a medtech recruiter's trust primitives are a GitHub repo, a paper, a referral, a specific insight — **not** a self-scored readiness ledger, which can read as "marking your own exam." So the artefact leads; Provency frames it. If you only had time for one thing, you would build and send the project, not polish the profile.

---

## Critical path (≈3–4 weeks, ~90% offline)

### 0. Fix verification trust FIRST (small, upstream, blocking)
"Captured evidence" is worthless if it's self-attested. Today a user can self-click **Mark verified** with no proof (`artefact-footer.tsx`; the honesty model already treats raw `status` as untrusted — `status ≠ proof`). Before any evidence you capture means anything to a recruiter, decide and ship the verification primitive:
- Rename to "Mark complete" and make ledger-verified status **evidence-gated only** (passed competency check ≥ `PASS_BAR`, or an artefact whose demonstrated concepts are independently checkable), OR
- Keep it self-serve but label it unmistakably as self-attested everywhere it renders.
This is a half-day and it gates everything below. Do not skip it.

### 1. Build + ship + cold-email ONE real project (the deliverable — not code in this repo)
- Build one genuine medtech-relevant artefact (e.g. a seizure-detection benchmark, an EEG/signal-processing pipeline) as a standalone **GitHub repo with a strong README**. It has value with or without Provency.
- Pass the real competency checks and complete/verify the artefact *through Provency* so it also populates honest evidence — but the repo is the primary object.
- **Cold-email it** to a specific person at Seer/Epiminder with one concrete insight. This is the actual job-search action. Do it before any profile polish.

### 2. Provency as the frame (small, only after §1 has something real)
- `/u/[handle]` links and contextualizes the shipped project; the ledger is supporting evidence, never the headline pitch.
- Make it consume the shared `computeReadinessLedger` + single `PASS_BAR` (kill the two inline `PASS_THRESHOLD = 4`); remove the debug `<pre>` dump from `syllabi/[id]/page.tsx`.
- **Honest partial states** so an in-progress syllabus reads as focused, not abandoned. If an honest number would read worse than the bare repo, lead with the repo and let the ledger be secondary.

### 3. Shareability (trivial, last)
- OG image for `/u/[handle]` (so a link in an email/LinkedIn renders).
- `provency.ai` domain cutover; switch health check off `yakka-two.vercel.app`.

### 4. Validate the assumption before investing more
Send the repo + `/u/caleb` to 2–3 real contacts. Watch whether the ledger helps or gets ignored. If it's ignored, stop polishing Provency and pour the time into the next project + more cold emails.

---

## The honest one-liner
If you read nothing else: **build one strong project, ship it, cold-email it with a specific insight.** Everything in this repo is in service of that. Do not spend a week in the editor before you have shipped and sent one real thing.

## Explicitly NOT in scope (see `TODOS.md`)

| Deferred | Why |
|---|---|
| **FSRS retention loop** | Habit mechanics for users who don't exist. Fully reversible (schema exists). |
| **Syllabus editing** (gap → cluster) | Doesn't move "recruiter trusts the work." |
| **Multi-syllabus public profile** | One target; one project + syllabus is the case. |
| **Reconcile mandala/tree/header onto model** | Internal owner-facing hygiene, not recruiter-facing. |
| **currentSkills re-display, foundations discounting, tier weighting** | Polish. Zero interview impact. |

## Reversibility & reopen trigger
Every cut is a two-way door (5/5). The irreversible cost is time: weeks in this repo are weeks not building projects and sending emails. Reopen "is Provency a product?" only after a recruiter engages, or after Caleb lands the role — not before.

---

_Reviewed 2026-07-18: North Star = job-search; mode = scope reduction; Provency demoted to a frame around a shipped artefact + cold email; verification-trust decision pulled upstream as blocking item #0; FSRS + editing + multi-syllabus cut to backlog._
