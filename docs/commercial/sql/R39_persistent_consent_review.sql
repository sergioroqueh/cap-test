-- R39 REVIEW DRAFT ONLY (19/11/2026). NEVER AUTO-RUN.
-- NO real Supabase queries, migrations, or deployments authorized.
-- Proposed order IN A SEPARATELY AUTHORIZED DEV ENVIRONMENT ONLY:
-- C28_full_fidelity_schema_draft.sql -> C29_event_ledger_draft.sql ->
-- R37_consistent_snapshot_review.sql -> this reviewed R39 draft.
-- One transaction; source tables/policies must already exist. Not idempotent.
-- Uses only database-authenticated JWT claims furnished by a trusted gateway.
-- A SQL console setting fabricated JWT GUCs IS NOT a real Auth/RLS test.
begin;

-- Privileged transitions live OUTSIDE the Data API's exposed schemas.\ncreate schema rc_internal;\nrevoke all on schema rc_internal from public, anon, authenticated, service_role;\ngrant usage on schema rc_internal to authenticated;\n\n-- Record only the opt-in for progress synchronization, not a blanket consent.
-- Keep the row after revocation to prevent revision reuse. Account deletion
-- can cascade after a separately authorized retention/erasure review.
create table public.rc_sync_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null default 'progress-sync'
    constraint rc_sync_consents_purpose check (purpose = 'progress-sync'),
  notice_version text not null
    constraint rc_sync_consents_notice check (notice_version = 'progress-sync-v1'),
  granted boolean not null,
  revision integer not null default 1
    constraint rc_sync_consents_revision check (revision > 0),
  granted_at timestamptz not null,
  revoked_at timestamptz,
  updated_at timestamptz not null default transaction_timestamp(),
  primary key (user_id, purpose),
  constraint rc_sync_consents_state check (
    (granted = true and revoked_at is null)
    or (granted = false and revoked_at is not null)
  )
);

-- History is append-only for browser principals. Updated state + audit append
-- occur in the SAME function transaction (failure rolls back both).
create table public.rc_sync_consent_audit (
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose = 'progress-sync'),
  revision integer not null check (revision > 0),
  action text not null check (action in ('grant', 'revoke')),
  notice_version text not null check (notice_version = 'progress-sync-v1'),
  occurred_at timestamptz not null default transaction_timestamp(),
  primary key (user_id, purpose, revision)
);

alter table public.rc_sync_consents enable row level security;
alter table public.rc_sync_consent_audit enable row level security;
revoke all on public.rc_sync_consents, public.rc_sync_consent_audit
  from public, anon, authenticated, service_role;
grant select on public.rc_sync_consents, public.rc_sync_consent_audit
  to authenticated;
-- No INSERT, UPDATE, DELETE, or TRUNCATE for browser roles.
create policy rc_sync_consents_owner_read on public.rc_sync_consents
 for select to authenticated
 using (
   user_id = (select auth.uid())
   and (select auth.jwt()->>'role') = 'authenticated'
   and (select auth.jwt()->>'is_anonymous') = 'false'
 );
create policy rc_sync_consent_audit_owner_read on public.rc_sync_consent_audit
 for select to authenticated
 using (
   user_id = (select auth.uid())
   and (select auth.jwt()->>'role') = 'authenticated'
   and (select auth.jwt()->>'is_anonymous') = 'false'
 );

-- SECURITY DEFINER is needed ONLY for controlled state transitions:
-- users cannot arbitrarily set revision, owner, purpose or timestamps.
-- Function owner must be a reviewed trusted DB migration role.
-- The function receives NO user_id and performs no dynamic SQL.
create function rc_internal.rc_grant_progress_sync_consent_v1(p_notice_version text)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_revision integer;
begin
  v_uid := auth.uid();
  if v_uid is null
     or (auth.jwt()->>'role') is distinct from 'authenticated'
     or (auth.jwt()->>'is_anonymous') is distinct from 'false' then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;
  if p_notice_version is distinct from 'progress-sync-v1' then
    raise exception using errcode = '22023', message = 'NOTICE_VERSION_MISMATCH';
  end if;

  -- Concurrent grant/revoke requests serialize through row conflict locks.
  -- No-op grant does NOT increment the revision or duplicate audit.
  insert into public.rc_sync_consents
    (user_id, purpose, notice_version, granted, revision, granted_at, revoked_at)
  values
    (v_uid, 'progress-sync', 'progress-sync-v1', true, 1,
     transaction_timestamp(), null)
  on conflict (user_id, purpose) do update
    set granted = true,
        notice_version = excluded.notice_version,
        revision = public.rc_sync_consents.revision + 1,
        granted_at = transaction_timestamp(),
        revoked_at = null,
        updated_at = transaction_timestamp()
    where public.rc_sync_consents.granted = false
       or public.rc_sync_consents.notice_version is distinct from excluded.notice_version
  returning revision into v_revision;

  if v_revision is not null then
    insert into public.rc_sync_consent_audit
      (user_id, purpose, revision, action, notice_version)
    values (v_uid, 'progress-sync', v_revision, 'grant', 'progress-sync-v1');
  else
    select c.revision into v_revision
    from public.rc_sync_consents c
    where c.user_id = v_uid and c.purpose = 'progress-sync';
  end if;
  if v_revision is null then
    raise exception using errcode = '40001', message = 'CONSENT_RACE_RETRY';
  end if;
  return v_revision;
end;
$$;

create function rc_internal.rc_revoke_progress_sync_consent_v1()
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_revision integer;
begin
  v_uid := auth.uid();
  if v_uid is null
     or (auth.jwt()->>'role') is distinct from 'authenticated'
     or (auth.jwt()->>'is_anonymous') is distinct from 'false' then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;

  -- No active consent means fail-closed already: do not create a fake row.
  -- Repeated revoke does not roll the revision or add duplicate audit entries.
  update public.rc_sync_consents c
     set granted = false,
         revision = c.revision + 1,
         revoked_at = transaction_timestamp(),
         updated_at = transaction_timestamp()
   where c.user_id = v_uid and c.purpose = 'progress-sync' and c.granted
   returning c.revision into v_revision;

  if v_revision is not null then
    insert into public.rc_sync_consent_audit
      (user_id, purpose, revision, action, notice_version)
    values (v_uid, 'progress-sync', v_revision, 'revoke', 'progress-sync-v1');
  else
    select c.revision into v_revision
    from public.rc_sync_consents c
    where c.user_id = v_uid and c.purpose = 'progress-sync';
  end if;
  return v_revision; -- NULL means no prior consent; still revoked.
end;
$$;

-- Invoker RPC wrappers deliberately expose only the authenticated opt-in API,
-- never a privileged function in the public PostgREST schema.
create function public.rc_grant_progress_sync_consent_v1(p_notice_version text)
returns integer language sql volatile security invoker
set search_path = ''
as $ select rc_internal.rc_grant_progress_sync_consent_v1(p_notice_version); $;

create function public.rc_revoke_progress_sync_consent_v1()
returns integer language sql volatile security invoker
set search_path = ''
as $ select rc_internal.rc_revoke_progress_sync_consent_v1(); $;

revoke all on function rc_internal.rc_grant_progress_sync_consent_v1(text)
 from public, anon, authenticated;
revoke all on function rc_internal.rc_revoke_progress_sync_consent_v1()
 from public, anon, authenticated;
revoke all on function public.rc_grant_progress_sync_consent_v1(text)
 from public, anon, authenticated;
revoke all on function public.rc_revoke_progress_sync_consent_v1()
 from public, anon, authenticated;
grant execute on function rc_internal.rc_grant_progress_sync_consent_v1(text)
 to authenticated;
grant execute on function rc_internal.rc_revoke_progress_sync_consent_v1()
 to authenticated;
grant execute on function public.rc_grant_progress_sync_consent_v1(text)
 to authenticated;
grant execute on function public.rc_revoke_progress_sync_consent_v1()
 to authenticated;

-- Invoker helper for every source-table RLS policy. Reads consent with
-- caller RLS, never with SECURITY DEFINER or a client-supplied user ID.
create function public.rc_has_active_progress_sync_consent_v1()
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select coalesce(
    (select c.granted and c.revoked_at is null
     from public.rc_sync_consents c
     where c.user_id = (select auth.uid())
       and c.purpose = 'progress-sync'
       and c.notice_version = 'progress-sync-v1'
       and (select auth.jwt()->>'role') = 'authenticated'
       and (select auth.jwt()->>'is_anonymous') = 'false'),
    false
  );
$$;
revoke all on function public.rc_has_active_progress_sync_consent_v1()
 from public, anon, authenticated;
grant execute on function public.rc_has_active_progress_sync_consent_v1()
 to authenticated;

-- Tighten EVERY C28/C29 browser source-table policy: R37's previous owner
-- check alone is insufficient to prevent direct reads/writes after revoke.
-- Keep their existing column-level GRANTs; RLS adds consent as a requirement.
drop policy if exists rc_student_profiles_select on public.rc_student_profiles;
create policy rc_student_profiles_select on public.rc_student_profiles
 for select to authenticated using (
   user_id = (select auth.uid())
   and (select auth.jwt()->>'is_anonymous') = 'false'
   and (select public.rc_has_active_progress_sync_consent_v1())
 );
drop policy if exists rc_student_profiles_insert on public.rc_student_profiles;
create policy rc_student_profiles_insert on public.rc_student_profiles
 for insert to authenticated with check (
   user_id = (select auth.uid())
   and (select auth.jwt()->>'is_anonymous') = 'false'
   and (select public.rc_has_active_progress_sync_consent_v1())
 );
drop policy if exists rc_student_profiles_update on public.rc_student_profiles;
create policy rc_student_profiles_update on public.rc_student_profiles
 for update to authenticated
 using (
   user_id = (select auth.uid())
   and (select auth.jwt()->>'is_anonymous') = 'false'
   and (select public.rc_has_active_progress_sync_consent_v1())
 )
 with check (
   user_id = (select auth.uid())
   and (select auth.jwt()->>'is_anonymous') = 'false'
   and (select public.rc_has_active_progress_sync_consent_v1())
 );

drop policy if exists rc_question_progress_select on public.rc_question_progress;
create policy rc_question_progress_select on public.rc_question_progress
 for select to authenticated using (
   user_id = (select auth.uid())
   and (select auth.jwt()->>'is_anonymous') = 'false'
   and (select public.rc_has_active_progress_sync_consent_v1())
 );
drop policy if exists rc_question_progress_insert on public.rc_question_progress;
create policy rc_question_progress_insert on public.rc_question_progress
 for insert to authenticated with check (
   user_id = (select auth.uid())
   and (select auth.jwt()->>'is_anonymous') = 'false'
   and (select public.rc_has_active_progress_sync_consent_v1())
 );
drop policy if exists rc_question_progress_update on public.rc_question_progress;
create policy rc_question_progress_update on public.rc_question_progress
 for update to authenticated
 using (
   user_id = (select auth.uid())
   and (select auth.jwt()->>'is_anonymous') = 'false'
   and (select public.rc_has_active_progress_sync_consent_v1())
 )
 with check (
   user_id = (select auth.uid())
   and (select auth.jwt()->>'is_anonymous') = 'false'
   and (select public.rc_has_active_progress_sync_consent_v1())
 );

drop policy if exists rc_study_sessions_select on public.rc_study_sessions;
create policy rc_study_sessions_select on public.rc_study_sessions
 for select to authenticated using (
   user_id = (select auth.uid())
   and (select auth.jwt()->>'is_anonymous') = 'false'
   and (select public.rc_has_active_progress_sync_consent_v1())
 );
drop policy if exists rc_study_sessions_insert on public.rc_study_sessions;
create policy rc_study_sessions_insert on public.rc_study_sessions
 for insert to authenticated with check (
   user_id = (select auth.uid())
   and (select auth.jwt()->>'is_anonymous') = 'false'
   and (select public.rc_has_active_progress_sync_consent_v1())
 );

drop policy if exists rc_progress_events_select on public.rc_progress_events;
create policy rc_progress_events_select on public.rc_progress_events
 for select to authenticated using (
   user_id = (select auth.uid())
   and (select auth.jwt()->>'is_anonymous') = 'false'
   and (select public.rc_has_active_progress_sync_consent_v1())
 );
drop policy if exists rc_progress_events_insert on public.rc_progress_events;
create policy rc_progress_events_insert on public.rc_progress_events
 for insert to authenticated with check (
   user_id = (select auth.uid())
   and (select auth.jwt()->>'is_anonymous') = 'false'
   and (select public.rc_has_active_progress_sync_consent_v1())
 );

-- R37 was still callable without a bound consent revision: retire it.
-- In the proposed application order R37 must already exist.
revoke execute on function public.rc_read_consistent_snapshot_v1()
 from public, anon, authenticated;

-- Revised one-statement snapshot. The expected revision and session must match
-- the VERIFIED database-side JWT identity + active consent. R38 independently
-- checks Auth session liveness before and after this DB read.
create function public.rc_read_consistent_snapshot_v2(
  p_expected_consent_revision integer,
  p_expected_session_id uuid
)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with principal as materialized (
    select (select auth.uid()) as uid
    where (select auth.uid()) is not null
      and (select auth.jwt()->>'role') = 'authenticated'
      and (select auth.jwt()->>'is_anonymous') = 'false'
      and p_expected_consent_revision > 0
      and p_expected_session_id is not null
      and (select auth.jwt()->>'session_id') = p_expected_session_id::text
  ), consent as materialized (
    select c.user_id, c.revision
    from public.rc_sync_consents c
    join principal p on c.user_id = p.uid
    where c.purpose = 'progress-sync'
      and c.notice_version = 'progress-sync-v1'
      and c.granted
      and c.revoked_at is null
      and c.revision = p_expected_consent_revision
  ), event_rows as materialized (
    select e.event_id, e.payload
    from public.rc_progress_events e
    join consent c on c.user_id = e.user_id
    order by e.event_id
    limit 5001
  ), session_rows as materialized (
    select s.session_key, s.payload
    from public.rc_study_sessions s
    join consent c on c.user_id = s.user_id
    order by s.session_key
    limit 5001
  )
  select case
    when (select count(*) from event_rows) > 5000
      or (select count(*) from session_rows) > 5000 then null
    else jsonb_build_object(
      'schemaVersion', 1,
      'userId', c.user_id::text,
      'events', coalesce(
        (select jsonb_agg(e.payload order by e.event_id) from event_rows e),
        '[]'::jsonb),
      'sessions', coalesce(
        (select jsonb_agg(s.payload order by s.session_key) from session_rows s),
        '[]'::jsonb)
    )
  end
  from consent c;
$$;
revoke all on function public.rc_read_consistent_snapshot_v2(integer, uuid)
 from public, anon, authenticated;
grant execute on function public.rc_read_consistent_snapshot_v2(integer, uuid)
 to authenticated;

comment on table public.rc_sync_consents is
 'R39 DRAFT: revocable owner-only progress synchronization opt-in. Not deployed.';
comment on table public.rc_sync_consent_audit is
 'R39 DRAFT: append-only grant/revoke revisions. Not deployed.';
comment on function public.rc_read_consistent_snapshot_v2(integer, uuid) is
 'R39 DRAFT: one-statement owner+session+consent-revision snapshot. Not deployed.';
commit;
