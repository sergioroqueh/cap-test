-- C15 DRAFT, NOT A MIGRATION. Only disposable PostgreSQL / independently approved new RutaCAP project.
-- Never execute against CAP Test private, CuadernoTecnico, or any live project.
begin;
create table public.rc_student_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 preferred_region text check (preferred_region in ('clm','an','ar','as','ib','cn','cb','cl','ct','vc','ex','ga','ri','md','mc','nc','pv','ce','ml')),
 created_at timestamptz not null default now()
);
create table public.rc_question_progress (
 user_id uuid not null references auth.users(id) on delete cascade,
 question_id text not null check (length(question_id) between 1 and 200),
 attempts integer not null default 0 check(attempts between 0 and 1000000),
 correct integer not null default 0 check(correct between 0 and attempts),
 favorite boolean not null default false,
 last_answered_at timestamptz,
 primary key(user_id, question_id)
);
create table public.rc_study_sessions (
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 catalog_version text not null check(length(catalog_version) between 1 and 100),
 source_id text not null check(length(source_id) between 1 and 200),
 completed_at timestamptz not null,
 -- Client-reported learning statistics only; never payment, entitlement or authoritative certification.
 attempted integer not null check(attempted between 0 and 120),
 correct integer not null check(correct between 0 and attempted),
 primary key(user_id,session_id)
);
alter table public.rc_student_profiles enable row level security;
alter table public.rc_question_progress enable row level security;
alter table public.rc_study_sessions enable row level security;
revoke all on public.rc_student_profiles,public.rc_question_progress,public.rc_study_sessions from public,anon,authenticated,service_role;
grant select on public.rc_student_profiles,public.rc_question_progress,public.rc_study_sessions to authenticated;
grant insert(user_id,preferred_region),update(preferred_region) on public.rc_student_profiles to authenticated;
grant insert(user_id,question_id,attempts,correct,favorite,last_answered_at),update(attempts,correct,favorite,last_answered_at) on public.rc_question_progress to authenticated;
grant insert(user_id,session_id,catalog_version,source_id,completed_at,attempted,correct) on public.rc_study_sessions to authenticated;
-- Fail closed for anonymous auth sessions too; do not consult user_metadata.
create policy rc_student_profiles_select on public.rc_student_profiles for select to authenticated using ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') = 'false');
create policy rc_student_profiles_insert on public.rc_student_profiles for insert to authenticated with check ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') = 'false');
create policy rc_student_profiles_update on public.rc_student_profiles for update to authenticated using ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') = 'false') with check ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') = 'false');
create policy rc_question_progress_select on public.rc_question_progress for select to authenticated using ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') = 'false');
create policy rc_question_progress_insert on public.rc_question_progress for insert to authenticated with check ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') = 'false');
create policy rc_question_progress_update on public.rc_question_progress for update to authenticated using ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') = 'false') with check ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') = 'false');
create policy rc_study_sessions_select on public.rc_study_sessions for select to authenticated using ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') = 'false');
create policy rc_study_sessions_insert on public.rc_study_sessions for insert to authenticated with check ((select auth.uid()) = user_id and (select auth.jwt()->>'is_anonymous') = 'false');
-- No client DELETE or owner changes. Account deletion/guest import/entitlements are separate future reviewed operations.
commit;
