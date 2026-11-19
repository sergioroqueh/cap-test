-- C28 INDEPENDENT DRAFT. DO NOT RUN ON LIVE SUPABASE without approval.
-- Test ONLY in isolated disposable PostgreSQL with C15_auth_fixture.sql.
-- Supersedes C15 proposal for full-fidelity mobile progress; neither is deployed.
begin;

create table public.rc_student_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 preferred_region text check (preferred_region in
 ('clm','an','ar','as','ib','cn','cb','cl','ct','vc','ex','ga','ri','md','mc','nc','pv','ce','ml')),
 created_at timestamptz not null default now()
);

-- JSONB payload retains ALL QuestionProgress fields (streak, incorrect, lastAnswer,
-- lastCorrect, questionnaireId, updatedAt, etc.) without lossy projection.
-- user_id and question_id are authoritative separate columns, never taken from client metadata.
create table public.rc_question_progress (
 user_id uuid not null references auth.users(id) on delete cascade,
 question_id text not null check(length(question_id) between 1 and 200),
 payload jsonb not null,
 updated_at timestamptz not null default now(),
 primary key (user_id,question_id),
 constraint rc_progress_shape check(
   jsonb_typeof(payload)='object' and
   payload->>'questionId'=question_id and
   jsonb_typeof(payload->'questionnaireId')='string' and
   jsonb_typeof(payload->'attempts')='number' and
   jsonb_typeof(payload->'correct')='number' and
   jsonb_typeof(payload->'incorrect')='number' and
   jsonb_typeof(payload->'streak')='number' and
   jsonb_typeof(payload->'favorite')='boolean' and
   length(payload::text)<=16384
 )
);

-- session_key must be stable across browser/device retries (the client must persist
-- clientId before any cloud sync). payload preserves every answer and score field.
-- Sessions are append-only to authenticated clients.
create table public.rc_study_sessions (
 user_id uuid not null references auth.users(id) on delete cascade,
 session_key text not null check(length(session_key) between 1 and 200),
 payload jsonb not null,
 completed_at timestamptz not null,
 primary key (user_id,session_key),
 constraint rc_session_shape check(
   jsonb_typeof(payload)='object' and
   payload->>'clientId'=session_key and
   payload->>'type' in ('study','exam') and
   jsonb_typeof(payload->'answers')='array' and
   jsonb_typeof(payload->'answered')='number' and
   jsonb_typeof(payload->'correct')='number' and
   length(payload::text)<=524288
 )
);
create index rc_study_sessions_user_completed_idx
 on public.rc_study_sessions(user_id,completed_at desc);

alter table public.rc_student_profiles enable row level security;
alter table public.rc_question_progress enable row level security;
alter table public.rc_study_sessions enable row level security;

revoke all on public.rc_student_profiles,public.rc_question_progress,public.rc_study_sessions from PUBLIC,anon,authenticated,service_role;
grant select on public.rc_student_profiles,public.rc_question_progress,public.rc_study_sessions to authenticated;
grant insert(user_id,preferred_region), update(preferred_region) on public.rc_student_profiles to authenticated;
grant insert(user_id,question_id,payload,updated_at),update(payload,updated_at) on public.rc_question_progress to authenticated;
grant insert(user_id,session_key,payload,completed_at) on public.rc_study_sessions to authenticated;

-- Strict owner check with explicit false, so absent/anonymous claims fail closed.
-- No SECURITY DEFINER, no user_metadata, and no browser-accessible DELETE.
create policy rc_student_profiles_select on public.rc_student_profiles
 for select to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous')='false');
create policy rc_student_profiles_insert on public.rc_student_profiles
 for insert to authenticated
 with check ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous')='false');
create policy rc_student_profiles_update on public.rc_student_profiles
 for update to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous')='false')
 with check ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous')='false');
create policy rc_question_progress_select on public.rc_question_progress
 for select to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous')='false');
create policy rc_question_progress_insert on public.rc_question_progress
 for insert to authenticated
 with check ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous')='false');
create policy rc_question_progress_update on public.rc_question_progress
 for update to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous')='false')
 with check ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous')='false');
create policy rc_study_sessions_select on public.rc_study_sessions
 for select to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous')='false');
create policy rc_study_sessions_insert on public.rc_study_sessions
 for insert to authenticated
 with check ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous')='false');
commit;
