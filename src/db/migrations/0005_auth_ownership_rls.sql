-- REVIEW BEFORE APPLYING.
-- This migration converts ownership from the legacy text value `caleb` to
-- Supabase Auth UUID ownership, adds public profiles, and enables RLS.
--
-- Existing non-UUID owners are preserved by setting syllabi.user_id to NULL.
-- After signing up, reassign those rows manually, for example:
--
--   update public.syllabi
--   set user_id = '<your-auth-user-uuid>'::uuid
--   where user_id is null;
--
-- Once legacy rows are reassigned, you may optionally enforce NOT NULL:
--
--   alter table public.syllabi alter column user_id set not null;

-- Remove the leftover Supabase "User Management" quickstart trigger if present.
-- It inserts into public.profiles (id, handle) with no display_name and fires
-- before the trigger below; left in place it makes every signup 500 once
-- profiles.display_name becomes NOT NULL.
drop trigger if exists on_auth_user_created on auth.users;
--> statement-breakpoint
drop function if exists public.handle_new_user();
--> statement-breakpoint

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique,
  display_name text not null,
  created_at timestamp with time zone not null default now()
);
--> statement-breakpoint

create index if not exists profiles_handle_idx on public.profiles using btree (handle);
--> statement-breakpoint

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
begin
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    null,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1),
      'Yakka learner'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists on_auth_user_created_create_profile on auth.users;
--> statement-breakpoint
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();
--> statement-breakpoint

drop index if exists public.syllabi_user_id_idx;
--> statement-breakpoint

alter table public.syllabi
  alter column user_id drop not null,
  alter column user_id type uuid using (
    case
      when user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then user_id::uuid
      else null
    end
  );
--> statement-breakpoint

alter table public.syllabi
  add constraint syllabi_user_id_auth_users_id_fk
  foreign key (user_id) references auth.users(id) on delete cascade;
--> statement-breakpoint

create index if not exists syllabi_user_id_idx on public.syllabi using btree (user_id);
--> statement-breakpoint

alter table public.profiles enable row level security;
--> statement-breakpoint
alter table public.syllabi enable row level security;
--> statement-breakpoint
alter table public.skill_clusters enable row level security;
--> statement-breakpoint
alter table public.sub_skills enable row level security;
--> statement-breakpoint
alter table public.concepts enable row level security;
--> statement-breakpoint
alter table public.resources enable row level security;
--> statement-breakpoint
alter table public.study_briefs enable row level security;
--> statement-breakpoint
alter table public.competency_checks enable row level security;
--> statement-breakpoint
alter table public.learning_sessions enable row level security;
--> statement-breakpoint
alter table public.artefacts enable row level security;
--> statement-breakpoint
alter table public.retention_cards enable row level security;
--> statement-breakpoint

drop policy if exists "profiles are publicly readable" on public.profiles;
--> statement-breakpoint
create policy "profiles are publicly readable"
on public.profiles
for select
to anon, authenticated
using (true);
--> statement-breakpoint

drop policy if exists "users can insert own profile" on public.profiles;
--> statement-breakpoint
create policy "users can insert own profile"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);
--> statement-breakpoint

drop policy if exists "users can update own profile" on public.profiles;
--> statement-breakpoint
create policy "users can update own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
--> statement-breakpoint

drop policy if exists "users can delete own profile" on public.profiles;
--> statement-breakpoint
create policy "users can delete own profile"
on public.profiles
for delete
to authenticated
using ((select auth.uid()) = id);
--> statement-breakpoint

drop policy if exists "users can select own syllabi" on public.syllabi;
--> statement-breakpoint
create policy "users can select own syllabi"
on public.syllabi
for select
to authenticated
using ((select auth.uid()) = user_id);
--> statement-breakpoint

drop policy if exists "users can insert own syllabi" on public.syllabi;
--> statement-breakpoint
create policy "users can insert own syllabi"
on public.syllabi
for insert
to authenticated
with check ((select auth.uid()) = user_id);
--> statement-breakpoint

drop policy if exists "users can update own syllabi" on public.syllabi;
--> statement-breakpoint
create policy "users can update own syllabi"
on public.syllabi
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
--> statement-breakpoint

drop policy if exists "users can delete own syllabi" on public.syllabi;
--> statement-breakpoint
create policy "users can delete own syllabi"
on public.syllabi
for delete
to authenticated
using ((select auth.uid()) = user_id);
--> statement-breakpoint

drop policy if exists "users can select own skill clusters" on public.skill_clusters;
--> statement-breakpoint
create policy "users can select own skill clusters"
on public.skill_clusters
for select
to authenticated
using (
  exists (
    select 1
    from public.syllabi s
    where s.id = skill_clusters.syllabus_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can insert own skill clusters" on public.skill_clusters;
--> statement-breakpoint
create policy "users can insert own skill clusters"
on public.skill_clusters
for insert
to authenticated
with check (
  exists (
    select 1
    from public.syllabi s
    where s.id = skill_clusters.syllabus_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can update own skill clusters" on public.skill_clusters;
--> statement-breakpoint
create policy "users can update own skill clusters"
on public.skill_clusters
for update
to authenticated
using (
  exists (
    select 1
    from public.syllabi s
    where s.id = skill_clusters.syllabus_id
      and s.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.syllabi s
    where s.id = skill_clusters.syllabus_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can delete own skill clusters" on public.skill_clusters;
--> statement-breakpoint
create policy "users can delete own skill clusters"
on public.skill_clusters
for delete
to authenticated
using (
  exists (
    select 1
    from public.syllabi s
    where s.id = skill_clusters.syllabus_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can select own sub skills" on public.sub_skills;
--> statement-breakpoint
create policy "users can select own sub skills"
on public.sub_skills
for select
to authenticated
using (
  exists (
    select 1
    from public.skill_clusters sc
    join public.syllabi s on s.id = sc.syllabus_id
    where sc.id = sub_skills.cluster_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can insert own sub skills" on public.sub_skills;
--> statement-breakpoint
create policy "users can insert own sub skills"
on public.sub_skills
for insert
to authenticated
with check (
  exists (
    select 1
    from public.skill_clusters sc
    join public.syllabi s on s.id = sc.syllabus_id
    where sc.id = sub_skills.cluster_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can update own sub skills" on public.sub_skills;
--> statement-breakpoint
create policy "users can update own sub skills"
on public.sub_skills
for update
to authenticated
using (
  exists (
    select 1
    from public.skill_clusters sc
    join public.syllabi s on s.id = sc.syllabus_id
    where sc.id = sub_skills.cluster_id
      and s.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.skill_clusters sc
    join public.syllabi s on s.id = sc.syllabus_id
    where sc.id = sub_skills.cluster_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can delete own sub skills" on public.sub_skills;
--> statement-breakpoint
create policy "users can delete own sub skills"
on public.sub_skills
for delete
to authenticated
using (
  exists (
    select 1
    from public.skill_clusters sc
    join public.syllabi s on s.id = sc.syllabus_id
    where sc.id = sub_skills.cluster_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can select own concepts" on public.concepts;
--> statement-breakpoint
create policy "users can select own concepts"
on public.concepts
for select
to authenticated
using (
  exists (
    select 1
    from public.sub_skills ss
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where ss.id = concepts.sub_skill_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can insert own concepts" on public.concepts;
--> statement-breakpoint
create policy "users can insert own concepts"
on public.concepts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.sub_skills ss
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where ss.id = concepts.sub_skill_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can update own concepts" on public.concepts;
--> statement-breakpoint
create policy "users can update own concepts"
on public.concepts
for update
to authenticated
using (
  exists (
    select 1
    from public.sub_skills ss
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where ss.id = concepts.sub_skill_id
      and s.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.sub_skills ss
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where ss.id = concepts.sub_skill_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can delete own concepts" on public.concepts;
--> statement-breakpoint
create policy "users can delete own concepts"
on public.concepts
for delete
to authenticated
using (
  exists (
    select 1
    from public.sub_skills ss
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where ss.id = concepts.sub_skill_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can select own resources" on public.resources;
--> statement-breakpoint
create policy "users can select own resources"
on public.resources
for select
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = resources.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can insert own resources" on public.resources;
--> statement-breakpoint
create policy "users can insert own resources"
on public.resources
for insert
to authenticated
with check (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = resources.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can update own resources" on public.resources;
--> statement-breakpoint
create policy "users can update own resources"
on public.resources
for update
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = resources.concept_id
      and s.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = resources.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can delete own resources" on public.resources;
--> statement-breakpoint
create policy "users can delete own resources"
on public.resources
for delete
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = resources.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can select own study briefs" on public.study_briefs;
--> statement-breakpoint
create policy "users can select own study briefs"
on public.study_briefs
for select
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = study_briefs.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can insert own study briefs" on public.study_briefs;
--> statement-breakpoint
create policy "users can insert own study briefs"
on public.study_briefs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = study_briefs.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can update own study briefs" on public.study_briefs;
--> statement-breakpoint
create policy "users can update own study briefs"
on public.study_briefs
for update
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = study_briefs.concept_id
      and s.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = study_briefs.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can delete own study briefs" on public.study_briefs;
--> statement-breakpoint
create policy "users can delete own study briefs"
on public.study_briefs
for delete
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = study_briefs.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can select own competency checks" on public.competency_checks;
--> statement-breakpoint
create policy "users can select own competency checks"
on public.competency_checks
for select
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = competency_checks.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can insert own competency checks" on public.competency_checks;
--> statement-breakpoint
create policy "users can insert own competency checks"
on public.competency_checks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = competency_checks.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can update own competency checks" on public.competency_checks;
--> statement-breakpoint
create policy "users can update own competency checks"
on public.competency_checks
for update
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = competency_checks.concept_id
      and s.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = competency_checks.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can delete own competency checks" on public.competency_checks;
--> statement-breakpoint
create policy "users can delete own competency checks"
on public.competency_checks
for delete
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = competency_checks.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can select own learning sessions" on public.learning_sessions;
--> statement-breakpoint
create policy "users can select own learning sessions"
on public.learning_sessions
for select
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = learning_sessions.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can insert own learning sessions" on public.learning_sessions;
--> statement-breakpoint
create policy "users can insert own learning sessions"
on public.learning_sessions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = learning_sessions.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can update own learning sessions" on public.learning_sessions;
--> statement-breakpoint
create policy "users can update own learning sessions"
on public.learning_sessions
for update
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = learning_sessions.concept_id
      and s.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = learning_sessions.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can delete own learning sessions" on public.learning_sessions;
--> statement-breakpoint
create policy "users can delete own learning sessions"
on public.learning_sessions
for delete
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = learning_sessions.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can select own artefacts" on public.artefacts;
--> statement-breakpoint
create policy "users can select own artefacts"
on public.artefacts
for select
to authenticated
using (
  exists (
    select 1
    from public.sub_skills ss
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where ss.id = artefacts.sub_skill_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can insert own artefacts" on public.artefacts;
--> statement-breakpoint
create policy "users can insert own artefacts"
on public.artefacts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.sub_skills ss
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where ss.id = artefacts.sub_skill_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can update own artefacts" on public.artefacts;
--> statement-breakpoint
create policy "users can update own artefacts"
on public.artefacts
for update
to authenticated
using (
  exists (
    select 1
    from public.sub_skills ss
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where ss.id = artefacts.sub_skill_id
      and s.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.sub_skills ss
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where ss.id = artefacts.sub_skill_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can delete own artefacts" on public.artefacts;
--> statement-breakpoint
create policy "users can delete own artefacts"
on public.artefacts
for delete
to authenticated
using (
  exists (
    select 1
    from public.sub_skills ss
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where ss.id = artefacts.sub_skill_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can select own retention cards" on public.retention_cards;
--> statement-breakpoint
create policy "users can select own retention cards"
on public.retention_cards
for select
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = retention_cards.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can insert own retention cards" on public.retention_cards;
--> statement-breakpoint
create policy "users can insert own retention cards"
on public.retention_cards
for insert
to authenticated
with check (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = retention_cards.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can update own retention cards" on public.retention_cards;
--> statement-breakpoint
create policy "users can update own retention cards"
on public.retention_cards
for update
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = retention_cards.concept_id
      and s.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = retention_cards.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

drop policy if exists "users can delete own retention cards" on public.retention_cards;
--> statement-breakpoint
create policy "users can delete own retention cards"
on public.retention_cards
for delete
to authenticated
using (
  exists (
    select 1
    from public.concepts c
    join public.sub_skills ss on ss.id = c.sub_skill_id
    join public.skill_clusters sc on sc.id = ss.cluster_id
    join public.syllabi s on s.id = sc.syllabus_id
    where c.id = retention_cards.concept_id
      and s.user_id = (select auth.uid())
  )
);
--> statement-breakpoint

-- Table privileges. RLS decides WHICH rows are visible, but the role still
-- needs base table privileges or every PostgREST/authenticated query 403s
-- ("permission denied for table ..."). Tables created via raw SQL do not get
-- Supabase's automatic role grants, so grant them explicitly. Middleware reads
-- public.profiles as the authenticated user, so this is required for the
-- handle gate to work.
grant usage on schema public to anon, authenticated;
--> statement-breakpoint
grant select, insert, update, delete on all tables in schema public to authenticated;
--> statement-breakpoint
grant select on public.profiles to anon;
