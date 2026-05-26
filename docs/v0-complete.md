# Provency v0 — Completion Report

_Snapshot: 2026-05-19. Reflects a single day's iteration from empty Next.js scaffold to functional learning OS._

## What's working

**Verified — typecheck clean, routes return 200, dev server up:**

- `/syllabi/new` form (Generate button → `createSyllabus` server action → redirect to `/syllabi/[id]`)
- `/syllabi` list page
- `/syllabi/[id]` collapsible tree with cluster-typed accents, concept checkboxes, optimistic status
- `/concepts/[id]` single page with breadcrumb, status radio, resources, markdown notes editor (debounced autosave, 30-min session-coalesce)
- `/u/[handle]` public profile with progress stats, per-cluster breakdown, recent activity, verified-artefacts section
- Top nav present on app pages, hidden on `/u/*` so the profile stays chrome-free
- Drizzle schema with 8 tables across the four-level hierarchy (syllabus → cluster → sub-skill → concept → resources); migrations 0000 + 0001 applied
- Server Actions for: concept status cycling, resource add/status, learning session autosave, artefact add/verify-toggle/delete
- AI generation pipeline (Anthropic SDK, `claude-sonnet-4-5`, streaming `messages.stream()` + tool_use, Zod-validated output enforcing ≥1 soft + ≥1 domain cluster)

## What's broken or rough

**Blocker (environmental, not code):**

- `ANTHROPIC_API_KEY` in `.env.local` returns `401 invalid x-api-key`. This was the morning's issue, caused the Grok migration, was reverted to Anthropic at user request — and the same placeholder/expired key is still in place. **Until this is fixed, no syllabus can be generated.** Don't switch providers again; replace the key.

**Stale data:**

- 3 syllabi rows from the morning's Grok-era generation still exist in the DB. They throw 500 on `/syllabi/[id]` because their cluster rows don't have the new `type` column populated correctly and the metadata jsonb shape is the old one. `/syllabi` list page still renders (it only reads top-level fields), so they appear as dead links.

**Code rough edges:**

- **No AI retry on Zod validation failure.** If Sonnet emits 0 soft clusters or only 3 concepts in a sub-skill, the whole generation throws. No graceful retry, no partial salvage — the user just sees an error message.
- **Notes editor flashes white** on first paint. `@uiw/react-md-editor` is dynamic-imported with `ssr:false`, so there's a layout-shift moment before the editor mounts.
- **Optimistic UI silently desyncs** if a server action fails. Errors get `console.error`'d, never surfaced. Acceptable for v0; should turn into toasts when used for real.
- **Concept page assumes a complete parent chain.** If any of subSkill/cluster/syllabus is missing for an orphaned concept, the page 500s with no meaningful message.
- **The 3 stale syllabi can't be deleted from the UI.** `/syllabi` is read-only. To clean up, you need `DELETE FROM syllabi WHERE id IN (...)` in Supabase or a fresh DB wipe.

**Missing from the v0 scope that was in CLAUDE.md:**

- **FSRS retention cards.** Schema exists (`retentionCards` table with `fsrsState` jsonb), no UI to generate or review cards. The hook point is the concept page — after notes accumulate, derive cards. Not built.
- **`currentSkills` is stored but never re-shown.** It lives in `metadata.currentSkills` but the UI doesn't render it anywhere, so users can't see what they told the model.

## Fix before using for a week

1. **Replace `ANTHROPIC_API_KEY`** with a real, current key. Run `npx tsx scripts/test-generate-syllabus.ts` — if it dumps JSON to `tmp/`, the key is good and the whole pipeline is unblocked.
2. **Wipe the 3 stale syllabi.** Easiest path: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` in Supabase + `npx drizzle-kit migrate`. Costs nothing — those rows are corrupt anyway.
3. **Run one real generation end-to-end** (form → tree → concept → mark understood → check `/u/[handle]`). This is the verification step that's blocked right now on item 1.
4. **Surface action errors instead of consoling them.** A 30-line toast component would cover concept status, resource status, artefact add — every place currently swallowing errors. Otherwise you'll have ghosts.
5. **Add one retry on Zod validation failure** in `generateSyllabus` before throwing. The most common failure mode (per spec) will be Sonnet emitting too-few concepts or skipping the soft cluster; one retry with an appended assistant correction usually fixes that.

After those five, this is shippable as a single-user product you'd use yourself daily.

## What was deliberately not built

- Edit flow for artefacts (delete + re-add is fine for v0)
- `/artefacts/[id]` detail page
- OG image for `/u/[handle]` LinkedIn previews
- Multi-syllabus support on the public profile (only the most recent renders)
- FSRS retention loop
- Auth ownership/RLS hardening follow-through
