# RLS Policy Matrix v1 — the employer-facing security surface (P6.1)

*2 Oct 2026. Spec, not a build. Upgrade Plan v1 §6.1 called this "the highest-consequence security surface in the plan" and required it be written as a spec first and reviewed as its own gate. Plan v2 A5 inherits that: **P6.1 spec → review gate → implement verbatim**. S-1 (org identity + RLS) may not open until this document has passed review. Companion docs: `verification-layer-v1.md` §4.3–4.4 (the tables), `verification-taxonomy.md` (what counts as evidence and what a surface may say), `upgrade-plan-v2.md` A5/A6/A8.*

**Status: DRAFT FOR REVIEW.** Nothing here is a migration. Tables named below that do not exist yet are the thesis's conceptual schema; where a policy needs a column that does not exist, the column is listed under *S-1 prerequisites*.

---

## 0. How to read this

- A **policy** is one Postgres RLS rule: table × operation × role × predicate. The matrix in §4 is the complete list; S-1 implements it verbatim through Drizzle `pgPolicy` (the pattern 0016 established) with the 0005 naming style: lower-case sentence names, `to anon, authenticated` roles, `(select auth.uid())` for the caller.
- An **invariant** (§5) is a sentence about the system that must stay true no matter which policies, routes or accessors change. Every invariant names its test. The invariants are the contract; the matrix is one implementation of it.
- **Two layers, both required.** RLS governs PostgREST and any Supabase client. The app's own Drizzle connection (`src/db/index.ts`) authenticates as the database owner and **bypasses RLS entirely** — the same fact that makes `/u/[handle]` scope its own queries today. So every employer-facing read in application code must go through a scoped accessor, and a static check must forbid raw table reads outside it (§6). RLS is defence in depth for the first layer and irrelevant to the second; the invariants hold only if both layers are built.

## 1. Principals

| Principal | How recognised | Notes |
|---|---|---|
| `anon` | No JWT | The public internet. Sees the public record only. |
| `candidate` | `authenticated`, `auth.uid()` = a `profiles.id` | Every signed-in user is a candidate with respect to their own record. |
| `org member` | `authenticated` AND a row in `org_members (org_id, user_id, role)` | Roles: `owner` \| `admin` \| `member`. A user may belong to several orgs; a user may be both a candidate and an org member. Membership never grants anything about the user's own candidate record beyond what they already have. |
| `platform` | The app's Drizzle connection, or a `service_role` key | Bypasses RLS. Must self-scope (§6). Never exposed to a browser. |

Helper, implemented in S-1 as `security definer stable`:

```sql
public.is_org_member(p_org uuid, p_min_role text default 'member') returns boolean
-- true iff exists org_members where org_id = p_org and user_id = (select auth.uid())
--   and role_rank(role) >= role_rank(p_min_role)
```

## 2. Data classes

Everything an employer can ever see is in class **A**. Classes B–D are never readable by an org member *as an org member*; they are readable by their owner as before.

| Class | Contents | Employer access |
|---|---|---|
| **A. Public record** (opted-in) | Exactly what `/u/[handle]` renders today: public-safe `profiles` columns (display name, handle, headline, links, the three `show*` toggles), the **featured** syllabus's target role/company/created date, the readiness counts, artefacts' public columns (title, description, url, evidenceUrl, type, verifiedAt, acceptance-criteria counts, demonstrated concept names), verified concepts with their `formatEvidenceLabel` strings, self-assessed names only when `show_self_assessed`, learning trail only when `show_learning_trail`, currently-developing only when `show_currently_developing`. Later: the Constellation payload, attestations at rung 4, process traces, all per the taxonomy's allowed strings. | **Read, and only when `profiles.discoverable = true`** (S-1 prerequisite; default **false** per A8.2). |
| **B. Intake payloads & drafts** | `syllabi.job_description_text`, `syllabi.metadata` (including `currentSkills`), `gap_reports`, `company_insights`, `foundation_items.resume_signal`, `learning_sessions` and their notes, `retention_cards`, `study_briefs`, `concept_expansions`, `concept_relevances`, non-featured syllabi in full, `artefacts.reflection` / progress log, generation status/errors. | **Never.** |
| **C. Non-public evidence** | Competency check question bodies and per-question answers; artefacts with `verifiedAt is null` *except* the public columns already shown as "In progress" on the profile; any evidence row at a tier below what the taxonomy allows a surface to call verified, beyond its allowed label; revoked evidence beyond its `Revoked — <date>` string. | **Never** beyond the allowed string. |
| **D. Another org's private material** | `standards` with `status in ('draft','archived')` owned by another org; `standard_requirements` of those; `curricula` with `confidentiality = 'org_private'` of another org; another org's `org_members`, `shortlists`, `verification_requests`, `displacement_events`. | **Never.** Published `org_authored` standards are public by design (A5: "the standard's public face on their page"). |
| **E. Candidate-side analytics** | `profile_view_events` (0016). | Never to employers. Owner reads own rows (policy exists). Aggregates for the platform's metrics script only. |

## 3. S-1 prerequisites (columns/tables this matrix assumes)

- `profiles.discoverable boolean not null default false` — the opt-in. Without it class A is not readable by any org member. **Default OFF** is registered (A8.2).
- `organizations (id, name, domain, claimed_by, claimed_at, created_at)`; `org_members (org_id, user_id, role, invited_by, created_at, unique(org_id,user_id))`.
- `standards`, `standard_requirements` per §4.3, with `status` and `version`.
- `shortlists (id, org_id, standard_id, created_by, created_at)`; `shortlist_items (shortlist_id, user_id, added_by, added_at, intro_consent_at nullable, unique(shortlist_id,user_id))`.
- `verification_requests (id, org_id, user_id, concept_id, requested_by, status requested|completed|declined|expired, completed_evidence_id nullable, created_at, resolved_at)`.
- `displacement_events` per §4.4 with `reported_by employer_confirmed|candidate_reported`.
- `curricula` only when org_instance scope is built; listed for completeness.

## 4. The policy matrix

Legend: ✓ allowed under the stated predicate · ✗ no policy (RLS denies) · `uid` = `(select auth.uid())` · `member(org)` = `public.is_org_member(org)` · `owner(org)` = `is_org_member(org,'owner')` · `admin(org)` = `is_org_member(org,'admin')`.

### 4.1 `organizations`

| Op | anon | candidate | org member | Predicate |
|---|---|---|---|---|
| SELECT | ✓ | ✓ | ✓ | `true` for public columns (id, name, domain, claimed_at). Private columns (`claimed_by`, billing later) move to `organizations_private` with `member(id)` SELECT only. |
| INSERT | ✗ | ✓ | — | `with check (claimed_by = uid)`; the claim flow inserts the org and the owner membership in one transaction via the platform connection (domain-email match v0, §7). |
| UPDATE | ✗ | ✗ | ✓ | `using/with check admin(id)`. Name/domain edits only; `claimed_by` immutable (trigger). |
| DELETE | ✗ | ✗ | ✓ | `owner(id)`. Cascades: members, standards (archive first — see I-11), shortlists. `displacement_events.org_id` **set null**, never cascade (the metric survives the org). |

### 4.2 `org_members`

| Op | anon | candidate | org member | Predicate |
|---|---|---|---|---|
| SELECT | ✗ | own rows | ✓ same org | `user_id = uid OR member(org_id)`. A user always sees their own memberships. |
| INSERT | ✗ | ✗ | ✓ | `admin(org_id)`; `role` may not exceed inviter's role (trigger). The first owner row is inserted by the claim transaction. |
| UPDATE | ✗ | ✗ | ✓ | `admin(org_id)`; cannot demote the last owner (trigger). |
| DELETE | ✗ | own row | ✓ | `user_id = uid OR admin(org_id)`; cannot delete the last owner. |

### 4.3 `standards`

| Op | anon | candidate | org member | Predicate |
|---|---|---|---|---|
| SELECT | ✓ published | ✓ published + own-org | ✓ published + own-org | `status = 'published' OR owner_org_id is null OR member(owner_org_id)`. Canonical (null owner) standards are public. **Drafts and archived rows of other orgs are invisible — not greyed, invisible.** |
| INSERT | ✗ | ✗ | ✓ | `admin(owner_org_id)`; `source = 'org_authored'`; `status = 'draft'`; `version = 1 + max(version) for same (owner_org_id, role_title)`. `jd_generated` standards are inserted by the platform connection only (the generator), with `owner_org_id = null`. |
| UPDATE | ✗ | ✗ | ✓ limited | `admin(owner_org_id)` AND `status = 'draft'` for content columns. A published row accepts exactly one transition: `status → 'archived'`. **Never edit a published standard; insert version n+1.** Enforced by trigger as well as policy. |
| DELETE | ✗ | ✗ | ✓ drafts only | `admin(owner_org_id) and status = 'draft'`. Published/archived rows are history; they are not deleted. |

### 4.4 `standard_requirements`

Inherits the parent standard's visibility and mutability: SELECT `exists(standards where id = standard_id and <4.3 SELECT predicate>)`; INSERT/UPDATE/DELETE only while the parent is a draft the caller administers. No independent policy surface.

### 4.5 `shortlists` and `shortlist_items`

| Op | anon | candidate | org member | Predicate |
|---|---|---|---|---|
| SELECT shortlists | ✗ | ✗ | ✓ own org | `member(org_id)` |
| SELECT shortlist_items | ✗ | **own rows — see I-7 / register R-1** | ✓ own org | `user_id = uid OR member(org via shortlist)` |
| INSERT item | ✗ | ✗ | ✓ | `member(org)` AND the target `profiles.discoverable = true` (policy predicate, not just UI). An org cannot shortlist someone who has not opted in. |
| UPDATE item | ✗ | own `intro_consent_at` only | ✗ | Candidate sets/clears consent on their own row; org members cannot touch it. Column-level: trigger rejects any other column change from a candidate. |
| DELETE item | ✗ | own row | ✓ own org | A candidate may remove themselves from any shortlist; the org learns only that the row is gone. |

### 4.6 `verification_requests`

| Op | anon | candidate | org member | Predicate |
|---|---|---|---|---|
| SELECT | ✗ | own (`user_id = uid`) | own org (`member(org_id)`) | Both parties see the request; nobody else. |
| INSERT | ✗ | ✗ | ✓ | `member(org_id)` AND `profiles.discoverable = true` for `user_id`. Rate-limited per org per candidate (app layer, §6). |
| UPDATE | ✗ | status + completion only | ✗ | Candidate: `requested → completed` (with `completed_evidence_id` pointing at an evidence row they own) or `→ declined`. Org: nothing. Platform: `→ expired` by schedule. |
| DELETE | ✗ | ✗ | ✗ | History. |

The evidence a completed request produces is **candidate-owned** and lands in the record at rung 5 per the taxonomy; its visibility to employers follows class A, not this table.

### 4.7 `displacement_events`

| Op | anon | candidate | org member | Predicate |
|---|---|---|---|---|
| SELECT | ✗ | own (`user_id = uid`) | own org | Both parties. Platform aggregates for the metrics script. |
| INSERT | ✗ | ✓ own, `reported_by = 'candidate_reported'` | ✓ own org, `reported_by = 'employer_confirmed'` | `with check` binds `reported_by` to the inserting principal; a candidate cannot insert an employer-confirmed row and vice versa. |
| UPDATE / DELETE | ✗ | ✗ | ✗ | Append-only. Corrections are new rows. |

### 4.8 Existing candidate tables, as seen by org members

No new policies. An org member is just an `authenticated` user to these tables and keeps exactly today's access: own rows only. **There is deliberately no policy that grants an org member any read of another user's `syllabi`, `concepts`, `competency_checks`, `artefacts`, `learning_sessions`, or `profile_view_events`.** Employer reads of class A happen through the platform accessor (§6), which renders the same projection `/u/[handle]` renders, gated on `discoverable`.

### 4.9 Every table

`enable row level security` on every table in §3, in the same migration that creates it. A table with RLS on and no policies denies everything to anon/authenticated, which is the correct default while a policy is being written.

## 5. Invariants — as testable sentences

Each is a test name. Tests run against the local Supabase stack in vitest, switching role with `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uid>"}', true)` per case; the fixtures are `seed-dev.ts` users plus two fixture orgs. Static invariants run as scripts in the pre-merge gate alongside `check:single-truth`.

- **I-1 Employer view ⊆ public profile view.** For every discoverable candidate, the set of fields the employer accessor returns is a subset of the fields `/u/[handle]` renders for an anonymous visitor. *Test: project both for `fixture-fiona`, assert `employerKeys ⊆ publicKeys` and equal values.*
- **I-2 Opt-out means invisible.** With `discoverable = false`, the employer accessor returns nothing for that user, a shortlist insert fails, a verification request insert fails, and the user does not appear in any match result. *Test: flip the flag, assert all four.*
- **I-3 Intake payloads never leave the owner.** No employer-facing accessor, route or RLS policy can return `job_description_text`, `metadata.currentSkills`, `resume_signal`, learning-session notes, or any class-B column. *Test: grep the accessor's select lists against a denylist of columns (static); plus a runtime test that an org member's PostgREST read of `syllabi` returns zero rows for another user.*
- **I-4 Evidence crosses only as its allowed string.** An employer never receives check question bodies, answers, or unverified-evidence detail; verified evidence arrives as `formatEvidenceLabel`/`Dated` strings and revoked evidence as `Revoked — <date>`. *Test: snapshot the employer projection for a fixture with a failed check and a revoked item; assert only allowed strings appear.*
- **I-5 Other orgs' private standards are invisible, not greyed.** An org member listing standards sees published + canonical + own-org drafts, and the count equals that exact set. *Test: two fixture orgs, one draft each; each sees 1 draft, not 2, and `select count(*)` as org A equals the allowed set.*
- **I-6 Membership does not leak.** An org member cannot read another org's `org_members`. *Test: PostgREST read as org-A admin of org-B members → 0 rows.*
- **I-7 Candidates can see their own shortlist rows and consent state.** *(Register R-1 decides whether the org's name is shown; the row itself is readable in every option.)* *Test: as the candidate, select own `shortlist_items` → ≥1 row; update `intro_consent_at` succeeds; updating any other column fails.*
- **I-8 A candidate can always remove themselves.** Deleting own `shortlist_items` row succeeds; the org's subsequent read shows it gone. *Test as written.*
- **I-9 Nobody writes someone else's report.** `displacement_events` insert with `reported_by = 'employer_confirmed'` fails as a candidate; `'candidate_reported'` fails as an org member; updates and deletes fail for everyone. *Test: four assertions.*
- **I-10 Published standards are immutable; versions are rows.** Updating a published standard's content fails; `status → archived` succeeds; a new draft for the same role gets `version = n+1`. *Test as written.*
- **I-11 Every new table has RLS on and at least one policy before anything reads it.** *Static test: `pg_tables` in `public` minus tables with `relrowsecurity` = ∅; tables with zero `pg_policies` rows are listed and must be justified in this doc (today: none).*
- **I-12 The platform connection self-scopes.** No file under `src/app/org/**` or `src/lib/employer/**` (S-track paths) calls `db.select().from(<candidate table>)` directly; all reads go through `src/lib/employer/read.ts`, which applies the `discoverable` gate and the class-A projection. *Static test: a `check:employer-scope` script in the style of `check:single-truth`, no allowlist.*
- **I-13 Analytics never cross.** `profile_view_events` has no policy for any org role and the employer accessor never selects from it. *Test: as org member, PostgREST read → 0 rows; static grep.*
- **I-14 Deleting an org keeps the metric.** After `delete from organizations`, `displacement_events` rows survive with `org_id` null; after a candidate deletion, rows survive with `user_id` null. *Test as written.*

## 6. The second layer: platform self-scoping

Because the app connection bypasses RLS, the matrix above protects PostgREST only. The rule for application code:

1. **One accessor module.** `src/lib/employer/read.ts` exposes `readPublicRecord(userId, { asOrg })`, `listDiscoverableCandidates(standardId)`, `matchAgainstStandard(userId, standardId)`. Each returns the class-A projection and nothing else, and each returns `null`/`[]` when `discoverable = false`. The projection is **the same function `/u/[handle]` uses** (extract `loadProfile`'s public shape into `src/lib/profile/public-record.ts` as part of S-1), so I-1 holds by construction.
2. **No raw reads outside it.** `check:employer-scope` fails the build on any `from(profiles|syllabi|concepts|competencyChecks|artefacts|learningSessions|profileViewEvents|...)` in S-track paths outside the accessor. No allowlist.
3. **Rate limits live here**, not in SQL: verification requests per org per candidate per 30 days (proposed: 1), shortlist adds per org per day (proposed: 50), standard versions per org per day (proposed: 20). Numbers are proposals for review.
4. **Server actions re-check membership** with `is_org_member` even though RLS would — because the connection bypasses RLS.

## 7. Register — decisions this document records, and the ones it leaves open

- **R-1 [LATE-BIND — transparency decision] What candidates see about who viewed or shortlisted them.** The matrix guarantees the *row* is readable (I-7); what the row discloses is open:
  - **(a) Full transparency:** org name + which standard + when, for both shortlist and verification request; profile *views* by orgs are shown as org name + date.
  - **(b) Shortlist transparent, views aggregate:** shortlist/request rows show org name; org *views* appear only as a count ("3 employers viewed this week") with no names.
  - **(c) Opt-in symmetry:** an org chooses on claim whether its name is shown; defaults to shown.
  - *Recommendation: (b).* Shortlisting and requesting are deliberate acts and the candidate must consent to any intro anyway, so naming the org is fair and cheap. Views are passive; naming viewers creates pressure both ways and is the LinkedIn behaviour the thesis positions against. Decide before S-1; the schema is the same in all three.
- **R-2 Claim verification v0 = domain-email match.** A user whose auth email domain equals `organizations.domain` may claim an unclaimed org; a second claimant for the same domain becomes a member request, not an owner. Free-mail domains (gmail, outlook, …) are rejected. DNS TXT verification is v1 if a partner needs it. Registered here; S-2 implements.
- **R-3 Discoverable defaults OFF** (A8.2). A candidate must flip it. The public profile at `/u/[handle]` stays public regardless — discoverability governs *employer tooling* (search, shortlist, request), not the URL.
- **R-4 Published standards are public.** This is the product promise ("tell candidates what you actually use"). Drafts are private to the org; there is no "published but private" state.
- **R-5 Candidate data classes B and C never get an employer policy, in any track.** If a future feature seems to need one, the answer is a new class-A projection the candidate opts into, not a widening of B/C.
- **R-6 Append-only outcome layer.** `displacement_events` and `verification_requests` are history; corrections are rows.

## 8. Review gate

This document passes review when: every S-1 prerequisite column in §3 is accepted or struck; R-1 is decided; the rate-limit numbers in §6.3 are accepted or changed; and the test list in §5 is accepted as the acceptance suite for S-1. Then S-1 implements §4 verbatim and lands §5's tests green in the same commit, and `check:employer-scope` joins the pre-merge gate.

## Changelog

- **2 Oct 2026 (P6.1, under Upgrade Plan v2 A5):** first draft. Written while A5 is gated (G-A5), as spec, per the spec-first discipline. Reconciles the thesis §4.3–4.4 tables with the 0005 policy conventions, the 0016 `pgPolicy` pattern, the taxonomy's allowed strings, and the fact that the app connection bypasses RLS. Transparency decision left open as R-1 with a recommendation.
