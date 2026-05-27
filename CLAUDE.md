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
- Pre-merge gate: `npx tsc --noEmit` then `npx eslint` (this project has no test runner — typecheck + lint are the gate).
- Deploy trigger: push to `main` (Vercel auto-builds).
- Deploy status: `vercel ls --prod` (CLI), or poll the health-check URL until it serves the new build.
- Health check: `https://yakka-two.vercel.app/login` (200).
