# Schema v2 — two-sided Provency (candidates + employers)

**Status:** PROPOSAL, 2026-08-25. Nothing here is applied. Each numbered
migration below becomes its own `drizzle-migrator` run after review, and only
after the Supabase project move (P2.2b + data copy) is finished.

**Scope change acknowledged.** CLAUDE.md v0 lists employer-side features as
out of scope. This document is the design for lifting that. It should pass
`/plan-ceo-review` before migration 1 is generated — the Layer-0 doc's
"Provency dependency" and "unfinished ambition" failure modes apply.

---

## 0. Design rules (carried over from v1, non-negotiable)

1. **Evidence-gated verification is the product.** An employer never sees a
   flattened skills list. They see the same three tiers the public profile
   shows — *verified* (passed check ≥ PASS_BAR or verified artefact),
   *self-assessed*, *in progress* — with the same labels. `src/lib/readiness`
   stays the single source of truth; employer views consume
   `summarizeReadinessLedger`, never raw `concepts.status`.
2. **Consent before visibility.** An employer reads a candidate's evidence
   only through (a) the candidate's public profile or (b) an explicit,
   revocable consent row. No "browse all candidates" without opt-in.
3. **Snapshots, not live views, at decision points.** An application carries
   the ledger summary *as of application time*. The candidate keeps learning;
   the employer's record does not drift.
4. **Every loader scopes explicitly.** `db` bypasses RLS (see
   `project_profile_honesty_model`). RLS is defence in depth for PostgREST
   paths; the app's own queries must filter by org/user/consent themselves.
5. **Append-only where money or trust is involved.** Status changes on
   applications are events, not overwrites.

## 1. Entity map

```
auth.users ──1:1── profiles (extended: open_to_work, visibility, preferences)
    │
    ├── syllabi ─ … ─ concepts ──n:1── canonical_skills   ← NEW shared layer
    │                                        ▲
    ├── organisation_members ─n:1─ organisations           ← NEW
    │                                 │
    │                                 └── job_postings ── posting_requirements ──┘
    │                                        │
    ├── candidate_consents (user ↔ org | posting)           ← NEW
    │
    └── applications (user ↔ posting) ── application_events, application_notes
                                       └── readiness_snapshot jsonb
notifications (user_id)                                     ← NEW
```

## 2. Enums

```ts
export const orgRole = pgEnum("org_role", ["owner", "recruiter"]);

export const postingStatus = pgEnum("posting_status", [
  "draft",
  "open",
  "paused",
  "closed",
]);

export const requirementLevel = pgEnum("requirement_level", [
  "must_have",
  "nice_to_have",
]);

export const profileVisibility = pgEnum("profile_visibility", [
  "private",        // only the owner
  "public",         // /u/[handle], anyone
  "employers_only", // consented orgs + public-safe columns to logged-in recruiters
]);

export const applicationStatus = pgEnum("application_status", [
  "invited",     // employer → candidate
  "applied",     // candidate → posting
  "reviewing",
  "shortlisted",
  "rejected",
  "withdrawn",
  "hired",
]);

export const applicationActor = pgEnum("application_actor", [
  "candidate",
  "employer",
  "system",
]);

export const notificationKind = pgEnum("notification_kind", [
  "application_invited",
  "application_status_changed",
  "consent_requested",
  "posting_match",
]);
```

## 3. Tables

### 3.1 Canonical skills (the structural change) — migration 1

```ts
/**
 * The shared vocabulary that makes one candidate's evidence comparable with
 * another party's requirements. v1 concepts are free text per syllabus;
 * this gives each a stable identity. Backfilled by an embedding + AI
 * dedupe pass over existing concepts (see §6), then maintained by the
 * generator: every new concept resolves to a canonical skill at creation.
 */
export const canonicalSkills = pgTable(
  "canonical_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    aliases: jsonb("aliases").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // pgvector — enable the extension in migration 1. Dimension matches the
    // embedding model chosen in src/lib/ai (decide before generating).
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("canonical_skills_slug_idx").on(t.slug)],
);

// concepts: ADD
//   canonicalSkillId: uuid("canonical_skill_id").references(() => canonicalSkills.id, { onDelete: "set null" }),
//   + index("concepts_canonical_skill_id_idx")
```

Migration 1 also enables `vector` and adds the nullable FK on `concepts`.
Backfill is a separate script, not DDL.

### 3.2 Organisations — migration 2

```ts
export const organisations = pgTable(
  "organisations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    websiteUrl: text("website_url"),
    // Verified by a DNS TXT record or a confirmed email at the domain.
    // Null = unverified; unverified orgs cannot open postings.
    verifiedDomain: text("verified_domain"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    country: text("country"),
    region: text("region"),
    createdBy: uuid("created_by").notNull().references(() => authUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const organisationMembers = pgTable(
  "organisation_members",
  {
    organisationId: uuid("organisation_id").notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull().default("recruiter"),
    invitedBy: uuid("invited_by").references(() => authUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organisationId, t.userId] }),
    index("organisation_members_user_id_idx").on(t.userId),
  ],
);
```

A user may be both a learner and a recruiter. No second auth system.

### 3.3 Job postings + requirements — migration 3

```ts
export const jobPostings = pgTable(
  "job_postings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id").notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    jobDescriptionText: text("job_description_text").notNull(),
    roleNature: roleNatureEnum("role_nature").notNull().default("technical"),
    country: text("country"),
    region: text("region"),
    status: postingStatus("status").notNull().default("draft"),
    // Same resumable-generation pattern as syllabi: requirements are
    // generated from the JD by the worker; this tracks that unit.
    requirementsStatus: generationStatus("requirements_status").notNull().default("pending"),
    requirementsError: text("requirements_error"),
    createdBy: uuid("created_by").notNull().references(() => authUsers.id),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("job_postings_organisation_id_idx").on(t.organisationId),
    index("job_postings_status_idx").on(t.status),
  ],
);

/**
 * What the posting asks for, in the shared vocabulary. Produced by the SAME
 * generator that builds syllabi (a posting is a JD without a learner), but
 * stored flat: no clusters/sub-skills, no progress, no resources.
 */
export const postingRequirements = pgTable(
  "posting_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postingId: uuid("posting_id").notNull()
      .references(() => jobPostings.id, { onDelete: "cascade" }),
    canonicalSkillId: uuid("canonical_skill_id").notNull()
      .references(() => canonicalSkills.id),
    level: requirementLevel("level").notNull().default("must_have"),
    weight: integer("weight").notNull().default(3), // 1–5, same scale as clusters
    // The JD sentence this came from — shown to both sides, never invented.
    evidenceText: text("evidence_text").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
  },
  (t) => [
    index("posting_requirements_posting_id_idx").on(t.postingId),
    unique("posting_requirements_posting_skill_unq").on(t.postingId, t.canonicalSkillId),
  ],
);
```

### 3.4 Candidate visibility + consent — migration 4

```ts
// profiles: ADD
//   openToWork: boolean("open_to_work").notNull().default(false),
//   visibility: profileVisibility("visibility").notNull().default("public"),
//   preferredRoles: jsonb("preferred_roles").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
//   preferredRegions: jsonb("preferred_regions").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
// Existing public profiles keep working: default "public" preserves v1 behaviour.

/**
 * A candidate's grant to ONE org (or one posting) to read their evidence
 * beyond the public profile. Revocable; revocation is a timestamp, not a
 * delete, so the audit trail survives. Purpose-limited — this is the
 * Privacy Act (AU) story.
 */
export const candidateConsents = pgTable(
  "candidate_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id").notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    // Null = whole org; set = only this posting.
    postingId: uuid("posting_id").references(() => jobPostings.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("candidate_consents_user_id_idx").on(t.userId),
    index("candidate_consents_organisation_id_idx").on(t.organisationId),
  ],
);
```

### 3.5 Applications — migration 5

```ts
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postingId: uuid("posting_id").notNull()
      .references(() => jobPostings.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    // Which syllabus the candidate put forward (their featured one by default).
    syllabusId: uuid("syllabus_id").references(() => syllabi.id, { onDelete: "set null" }),
    status: applicationStatus("status").notNull(),
    initiatedBy: applicationActor("initiated_by").notNull(),
    /**
     * `summarizeReadinessLedger(...)` output at the moment of application,
     * plus the per-requirement match (verified / self-assessed / in-progress /
     * absent for each posting_requirement). Immutable after insert.
     */
    readinessSnapshot: jsonb("readiness_snapshot").$type<ApplicationSnapshot>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("applications_posting_user_unq").on(t.postingId, t.userId),
    index("applications_user_id_idx").on(t.userId),
    index("applications_posting_status_idx").on(t.postingId, t.status),
  ],
);

/** Append-only. `applications.status` is a denormalised head; this is the truth. */
export const applicationEvents = pgTable(
  "application_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id").notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatus: applicationStatus("from_status"),
    toStatus: applicationStatus("to_status").notNull(),
    actor: applicationActor("actor").notNull(),
    actorUserId: uuid("actor_user_id").references(() => authUsers.id),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("application_events_application_id_idx").on(t.applicationId)],
);

/** Org-private. Never readable by the candidate. */
export const applicationNotes = pgTable(
  "application_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id").notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").notNull().references(() => authUsers.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("application_notes_application_id_idx").on(t.applicationId)],
);

export type ApplicationSnapshot = {
  takenAt: string;
  headline: { pct: number; weightedCompleted: number; weightedTotal: number };
  requirements: {
    canonicalSkillId: string;
    level: "must_have" | "nice_to_have";
    state: "verified" | "self_assessed" | "in_progress" | "absent";
    evidence: { kind: "competency_check" | "artefact"; ref: string }[];
  }[];
};
```

### 3.6 Notifications — migration 6

```ts
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_unread_idx").on(t.userId, t.readAt)],
);
```

### 3.7 Deliberately NOT tables (yet)

- **Matching results.** Compute on demand: ledger × `posting_requirements`
  joined on `canonical_skill_id`. Materialise a `posting_candidates` table
  only when a real posting has >1k opted-in candidates.
- **Messaging.** Notifications + email are enough for invite/accept/reject.
- **Payments.** Still out of scope.

## 4. RLS (each in the same migration file as its table — the 0005 lesson)

| Table | select | insert/update/delete |
|---|---|---|
| organisations | members of the org; anyone if `verified_at` not null (public employer page) | owners |
| organisation_members | members of the org | owners |
| job_postings | org members; anyone if `status = 'open'` | org members |
| posting_requirements | same as its posting | org members |
| canonical_skills | anon + authenticated | service role only (backfill/generator) |
| candidate_consents | the candidate; org members for consents naming their org | candidate insert/revoke only |
| applications | the candidate; org members of the posting's org | candidate insert (`initiated_by = candidate`); org members insert (`invited`); status via events |
| application_events | same as parent application | insert-only, same parties |
| application_notes | org members only — **never the candidate** | org members |
| notifications | owner | owner update (`read_at`) only |

Plus a **row-level rule that is not RLS**: an employer loader may return a
candidate's syllabus/evidence only if `profiles.visibility = 'public'` OR an
active `candidate_consents` row exists for that org/posting. Enforce in the
loader (the app bypasses RLS) and test it the way `/u/[handle]` is tested.

## 5. Migration order and what each touches

| # | Adds | Touches existing data | Reversible |
|---|---|---|---|
| 1 | `vector` ext, `canonical_skills`, `concepts.canonical_skill_id` | nullable column only | yes |
| 2 | `organisations`, `organisation_members` | none | yes |
| 3 | `job_postings`, `posting_requirements` | none | yes |
| 4 | `profiles.*` visibility cols, `candidate_consents` | defaults preserve v1 | yes |
| 5 | `applications`, `_events`, `_notes` | none | yes |
| 6 | `notifications` | none | yes |

Every one is additive. No v1 column is dropped or renamed. The public
profile, readiness ledger, and generator keep working untouched after each.

## 6. The canonical-skills backfill (script, not DDL)

1. Embed every existing `concepts.name + description` (~2.1k rows).
2. Cluster by cosine similarity (threshold to be tuned on a sample by hand —
   real-eyes, not a guess) → candidate canonical skills.
3. AI pass names each cluster and lists aliases; **a human reviews the list**
   before it is written. This is the honesty rule applied to taxonomy.
4. Write `canonical_skills`, set `concepts.canonical_skill_id`.
5. Generator change: on concept creation, resolve to nearest canonical skill
   above threshold, else create one (flagged `needs_review`).

Until step 4 completes, `posting_requirements` can't be matched — so
migration 3's generator work depends on migration 1's backfill, not just its
DDL.

## 7. Open questions for /plan-ceo-review

- Does the North Star (one candidate → Seer/Epiminder email) survive a
  marketplace pivot, or is this a v1 product after that email lands?
- Employer verification bar: DNS TXT vs. manual approval for the first 10 orgs.
- Which side pays, eventually — affects whether `organisations` needs a
  billing owner now (it doesn't, but the `owner` role is the hook).
- Does a candidate's *current* syllabus get shown, or only the snapshot?
  (Proposal: snapshot by default; live view only with a fresh consent.)
