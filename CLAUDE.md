# Yakka — Project Context

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

## GBrain Configuration (configured 2026-05-18)
- Mode: local-stdio
- Engine: pglite
- Config file: `~/.gbrain/config.json` (Windows: `C:\Users\caleb\.gbrain\config.json`)
- Binary: `C:\Users\caleb\.bun\bin\gbrain.exe` (source: `~/gbrain`, version 0.35.7.0)
- MCP registered: yes (user scope, stdio transport) — verified via `claude mcp list`
- Known Windows caveats: `gbrain put` via stdin fails (`/dev/stdin` ENOENT); migration v0.12.2 (Minions) segfaults under bun on Windows. Core search / serve / put-via-MCP work.

### GBrain Search Guidance
Prefer `mcp__gbrain__*` tools (loaded next Claude Code session restart) or `gbrain` CLI over Grep when the question is semantic:
- "Where is X handled?" / intent-based, no exact string → `gbrain search "<terms>"` or `gbrain query "<question>"`
- "What did we decide last time?" / past plans, retros → `gbrain search "<terms>"`

Grep is still right for known exact strings, regex, multiline patterns, and file globs.
