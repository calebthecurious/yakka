# Provency — Project Context

## What this is
A career-pathway product for self-taught knowledge workers — paste a target job description, get a personalised learning syllabus, work through it, and render progress on a public profile.
Initial v0 user: Caleb, targeting Australian medtech roles (Seer, Epiminder) en route to Synchron/Neuralink.

## v0 scope
- Supabase Auth-backed ownership using `auth.users.id`
- Paste JD → generate personalised syllabus
- Four-level hierarchy: **Syllabus → Skill Cluster → Sub-skill → Concept → Resources**
- Track resource consumption at the concept level
- Log learning sessions and notes (concept-scoped)
- Spaced retention checks (FSRS algorithm) generated from notes (concept-scoped, deferred)
- Public profile page rendering syllabus + progress + artefacts

## Out of scope for v0
- Payments
- File/audio/video ingestion (text + URL only)
- Employer-side features

## Stack
- Next.js 16 App Router, TypeScript strict
- Tailwind + shadcn/ui (dark mode default)
- Supabase (Postgres) + Drizzle ORM
- xAI Grok via OpenAI-compatible SDK (`grok-4-latest` for generation tasks; client in `src/lib/ai/client.ts`). Uses `chat.completions.create` + tool_use for structured output, Zod-validated. Anthropic SDK is still installed but unused — re-wire via `claude-sonnet-4-5` once `ANTHROPIC_API_KEY` is valid.
- Vercel deploys

## Code conventions
- Server Components by default; Client Components only when needed
- Server Actions for mutations, no API routes unless necessary
- Zod for all input validation
- Drizzle schema in src/db/schema.ts as single source of truth
- All AI calls go through src/lib/ai/ with typed wrappers and Zod-validated responses
- No `any`. Prefer `unknown` + narrowing.
- Component files: kebab-case. React components: PascalCase exports.

## Aesthetic
Dark mode default. Minimalist, futuristic. Subtle motion. Inspired by Linear, Vercel, Obsidian.

## Skill routing

When the user's request matches an available gstack skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas / brainstorming → `/office-hours`
- Strategy / scope rethink → `/plan-ceo-review`
- Architecture review of a plan → `/plan-eng-review`
- Design system or design plan review → `/design-consultation` or `/plan-design-review`
- Full review pipeline before implementation → `/autoplan`
- Bugs / errors / "it was working yesterday" → `/investigate`
- QA testing live site behavior → `/qa` (test + fix) or `/qa-only` (report only)
- Code / diff review before merge → `/review`
- Visual polish on a deployed page → `/design-review`
- Ship / deploy / PR → `/ship` then `/land-and-deploy`
- Save / restore working context → `/context-save` / `/context-restore`
- Browse or QA the app in a headless browser → `/browse`

## Subagent routing

This project ships three specialist subagents in `.claude/agents/`. Dispatch them via the Agent tool (each runs in a fresh context) when a change touches their domain — proactively, before shipping, not only when asked:

- Edits to AI prompts or output schemas under `src/lib/ai/` → **ai-prompt-tuner** (runs prompts against sample JD fixtures, validates Grok output with the Zod schemas, reports schema/quality issues).
- Any change to AI generation code (`src/lib/ai/`) or `/syllabi` routes → **syllabus-qa** *after* the change (typechecks, then browses the affected routes to confirm rendered output). Run it before `/ship`.
- Any change to `src/db/schema.ts` or related Drizzle files → **drizzle-migrator** (full safe cycle: review the schema edit, generate the migration, inspect the SQL, apply, verify). Note migration 0005 lives only on Supabase, not in the Drizzle journal.
- Any change to auth/OAuth/session/redirect code (`src/app/auth/`, `src/lib/supabase/`, `src/lib/auth.ts`, `middleware.ts`, login/signup pages) → **supabase-auth-qa** (verifies callback open-redirect protection, session handling, route guards, and redirect-URL consistency). This app has a history of redirect-URL bugs.

Rule of thumb: schema change → drizzle-migrator; prompt or output-schema change → ai-prompt-tuner; generated syllabus content or its routes → syllabus-qa; auth/redirect changes → supabase-auth-qa. Verify before shipping.

## GBrain Configuration (configured 2026-05-18, repaired 2026-05-27)
- Mode: local-stdio. Engine: pglite. Brain: `C:\Users\caleb\.gbrain\brain.pglite`. Binary `C:\Users\caleb\.bun\bin\gbrain.exe` v0.35.7.0. Config `~/.gbrain/config.json`.
- Indexed 2026-05-27: 52 markdown pages / 307 chunks (keyword search only — synced with `--no-embed`, so hybrid `gbrain query` has no vectors yet; use `gbrain search`).
- **Footgun (the bug we fixed):** `gbrain` auto-loads `.env.local` from its working directory. Run inside this repo, it reads the app's `DATABASE_URL` (Supabase pooler) and connects to the **app's** database — which has no gbrain schema — failing with `relation "facts" does not exist`. It does NOT touch the local pglite brain in that case.
- **Fixes in place:** (1) the `gbrain` MCP server is registered with `DATABASE_URL=` (empty) so `serve` ignores `.env.local` and uses pglite — `mcp__gbrain__*` tools work after a Claude Code restart. (2) Run the `gbrain` CLI from **outside** the repo (e.g. `cd ~ && gbrain ...`) or prefix `DATABASE_URL= gbrain ...` so it uses pglite.
- Re-index after notable changes: `cd ~ && gbrain sync --repo "$HOME/projects/yakka" --no-embed`.

### GBrain Search Guidance
For semantic/intent questions, prefer `mcp__gbrain__*` tools (after restart) or, from outside the repo, `gbrain search "<terms>"` (keyword). Hybrid `gbrain query` needs embeddings (not generated yet). It indexes markdown only (docs, CLAUDE.md, agent-skills) — NOT `.ts`/`.tsx` source.
- "Where is X documented / what did we decide?" → `gbrain search "<terms>"`
- Code search (`.ts`/`.tsx`), exact strings, regex, globs → use Grep/Glob (gbrain doesn't index source).

## Deploy Configuration (configured by /setup-deploy)
- Platform: Vercel — project `yakka` (id `prj_sxmOT3Df4BhfCrErhrxpUxjqrtsr`, org `team_BWgnO19SU4cR9mUFDRWCUBnj`), linked via `.vercel/repo.json`. `vercel` CLI installed.
- Production URL: `https://provency.ai` — **pending custom-domain cutover in the Vercel dashboard** (not live yet).
- Deploy trigger: automatic on push to `main` (no GitHub Actions; Vercel builds on push). Production tracks `main`.
- Merge method: direct commits to `main` (solo workflow, no PRs).
- Project type: Next.js 16 web app (`output: 'standalone'`).
- Post-deploy health check: `https://yakka-two.vercel.app/login` → expect HTTP 200.
  - The site root returns **307** (auth middleware redirects unauthenticated users to `/login`), so health-check the public `/login` page for an unambiguous 200, not `/`.
  - **TODO:** switch the health check to `https://provency.ai/login` once the custom domain is live.

### Custom deploy hooks
- Pre-merge gate: `npm test` (vitest), then `npx tsc --noEmit`, then `npx eslint`.
- Deploy trigger: push to `main` (Vercel auto-builds).
- Deploy status: `vercel ls --prod` (CLI), or poll the health-check URL until it serves the new build.
- Health check: `https://yakka-two.vercel.app/login` (200).

## Changelog

### 2026-10-05 — Process: a database password reset is a deploy

**Rule.** Resetting the Supabase database password is not finished until
Vercel `PROD_DATABASE_URL` holds the new transaction-pooler string
(`aws-0-ap-south-1.pooler.supabase.com:6543`, user `postgres.<ref>`), the
site is redeployed, and `npm run db:check` (with that string exported) prints
`DB CHECK OK`. Verify prod by behaviour, not by inspection: an unknown handle
at `/u/<nonsense>` must return **404**; a **500** there means the credential,
not the schema. `vercel env pull` writes sensitive values as `""`, so an
empty pull proves nothing either way.

**Why.** From before 2026-10-04 01:20Z until 2026-10-05, every DB-backed page
on prod 500'd with Postgres `28P01 password authentication failed` — Vercel's
`PROD_DATABASE_URL` still carried the pre-reset password while the pooler
string in `.env.local` authenticated fine. Public pages (`/`, `/login`)
stayed 200, so the health check was green throughout. The cause was only
visible in `vercel logs`.

**In practice.** Connection map: local processes → `DEV_DATABASE_URL`
(docker, loopback only); Vercel → `PROD_DATABASE_URL` (pooler 6543); the
direct host `db.<ref>.supabase.co` is IPv6-only and unreachable from Vercel
and this machine — never use it. Health-check a DB route (`/u/<nonsense>` →
404) alongside `/login` → 200.
**"Ready" is not "live".** After an Instant Rollback, Vercel stops auto-promoting
new production builds: every later push and `vercel redeploy` shows "● Ready ·
Production" in `vercel ls --prod` but the domain stays on the rolled-back
deployment (that is how 5 Oct's credential fix "did not take" twice). Before
declaring a deploy done, `vercel inspect https://yakka-two.vercel.app` must
report the newest deployment id; if not, `vercel promote <newest url>`.

### 2026-10-04 — Process: a gate is an exit code, never a grep

**Rule.** Every claim of "gates green" in a commit message comes from
`npm run gate` (`scripts/gate.mjs`): typecheck, the FULL vitest suite,
`check:single-truth`, and eslint on files changed vs `origin/main`, each
checked by process exit code, stopping at the first failure. Never gate on
grepping a runner's output for a summary line — a grep that matches exits 0
whether the tests passed or not. No test is skipped or quarantined to make a
gate pass; a flaky test is characterised (re-run, named, logged), not hidden.

**Why.** `2a406d9` (metrics v2) was committed with one failing test because the
commit chain was `npm test | grep "Tests "` → `&& git commit`. The grep
matched the summary line, so the chain continued and the message claimed
314/314. The message was amended the same day to say what actually happened.

**In practice.** Run `npm run gate` before every commit; paste its final line
("GATE GREEN …") or its failure, never a hand-typed count. If the flake in
`src/app/syllabi/new/actions.test.ts` ("writes a 'generating' skeleton row…")
reappears, it goes in WORKLOG with the assertion diff; as of today it is
unreproduced in three consecutive full runs.


### 2026-08-13 — Process: a prompt is not done until it is checked and committed

**Rule.** A prompt's STOP is not complete until its real-eyes check and commit
exist. The next prompt's precondition must cite the previous commit hash.

**Why.** Amendment 1 (P1.2–P1.5) ran five prompts deep on an uncommitted working
tree. Every prompt's precondition claimed the previous slice was "committed";
none were. The cost: no bisectable history, no safe baseline to revert against
for a red-then-green demo, and a late-discovered gap (P1.5b was never
implemented — its gate was never answered) that had already been assumed
complete by two downstream prompts. Reconstructing the slices afterwards took a
temporary WIP commit and a hard reset.

**In practice.** Cite the hash, don't assert the state: `PRECONDITION: <hash>
is HEAD`. If `git log` does not show it, STOP and report — an unverifiable
precondition is a failed one. Where a prompt pauses at a decision gate, that
gate is unanswered until the user answers it; downstream prompts may not assume
it resolved.

**See also:** `WORKLOG.md` for what landed, what is deliberately still on raw
status, and what remains open.
