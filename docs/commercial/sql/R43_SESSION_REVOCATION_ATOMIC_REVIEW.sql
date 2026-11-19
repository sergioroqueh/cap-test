-- R43 REVIEW ONLY: PROPOSED ATOMIC R42+R43 UPGRADE. NOT EXECUTED.
-- Requires the R40-installed C28+C29+R37+R39 schema on rutacap-dev.
-- DO NOT run R42 in isolation: R39 direct Data API routes currently only
-- check consent, not whether the JWT session was terminated.
-- This bundle is NON-IDEMPOTENT due to CREATE FUNCTION; one authorized
-- developer-only migration, never a production execution.
-- Do not apply until explicit SQL approval and a live Auth A/B test plan.
-- No UI, scoring, bank, Vercel, cloud or main changes.
begin;

-- 1. Install R42 internal session predicate and authenticated invoker RPC.
-- R42 DRAFT ONLY. NO APPLY AUTHORIZED for this additional migration.
-- Requires existing R39 internal schema; must be reviewed before dev use.
-- Does NOT expose auth.sessions or auth.users to Data API roles.

create function rc_internal.rc_is_active_session_v1()
returns boolean language sql stable security definer set search_path = ''
as $r42$
  select (select auth.uid()) is not null
    and (select auth.jwt()->>'role') = 'authenticated'
    and (select auth.jwt()->>'is_anonymous') = 'false'
    and exists (
      select 1 from auth.sessions s
      join auth.users u on u.id = s.user_id
      where s.user_id = (select auth.uid())
        and s.id::text = (select auth.jwt()->>'session_id')
        and (s.not_after is null or s.not_after > statement_timestamp())
        and u.deleted_at is null and not u.is_anonymous
        and (u.banned_until is null or u.banned_until <= statement_timestamp())
    );
$r42$;
create function public.rc_is_active_session_v1()
returns boolean language sql stable security invoker set search_path = ''
as $r42$ select rc_internal.rc_is_active_session_v1(); $r42$;
revoke all on function rc_internal.rc_is_active_session_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rc_is_active_session_v1()
  from public, anon, authenticated, service_role;
grant execute on function rc_internal.rc_is_active_session_v1()
  to authenticated;
grant execute on function public.rc_is_active_session_v1()
  to authenticated;
comment on function public.rc_is_active_session_v1()
  is 'R42 proposed owner-scoped active session check. Not yet deployed.';

-- 2. Enforce session state on ALL commercial data paths.
-- R43 security fix for the exposed Data API surface:
-- even after a browser signOut, a pre-existing JWT can remain valid until exp.
-- The R42 RPC alone protects only callers using the dedicated server gate.
-- This patch guards DIRECT RLS reads/writes and grant/revoke transitions.

-- Direct owner RLS reads of consent and audit must check session membership.
alter policy rc_sync_consents_owner_read on public.rc_sync_consents
  using (
    user_id = (select auth.uid())
    and (select auth.jwt()->>'role') = 'authenticated'
    and (select auth.jwt()->>'is_anonymous') = 'false'
    and (select rc_internal.rc_is_active_session_v1())
  );

alter policy rc_sync_consent_audit_owner_read on public.rc_sync_consent_audit
  using (
    user_id = (select auth.uid())
    and (select auth.jwt()->>'role') = 'authenticated'
    and (select auth.jwt()->>'is_anonymous') = 'false'
    and (select rc_internal.rc_is_active_session_v1())
  );

-- Existing 10 source-table RLS policies call this helper.
-- Guarding it adds session liveness to read/write paths without duplicating
-- every policy and without granting direct read on auth.sessions.
create or replace function public.rc_has_active_progress_sync_consent_v1()
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select coalesce((select rc_internal.rc_is_active_session_v1()), false)
    and coalesce(
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

-- SECURITY DEFINER consent transitions also need a session-membership
-- check: role + signed JWT alone do not prove a still-active session.
create or replace function rc_internal.rc_grant_progress_sync_consent_v1(p_notice_version text)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_revision integer;
begin
  v_uid := auth.uid();
  if not coalesce(rc_internal.rc_is_active_session_v1(), false) then
    raise exception using errcode = '42501', message = 'SESSION_INACTIVE';
  end if;
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

create or replace function rc_internal.rc_revoke_progress_sync_consent_v1()
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_revision integer;
begin
  v_uid := auth.uid();
  if not coalesce(rc_internal.rc_is_active_session_v1(), false) then
    raise exception using errcode = '42501', message = 'SESSION_INACTIVE';
  end if;
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

-- Defense in depth: no escalation of function privileges.
revoke execute on function rc_internal.rc_grant_progress_sync_consent_v1(text)
 from public, anon, service_role;
revoke execute on function rc_internal.rc_revoke_progress_sync_consent_v1()
 from public, anon, service_role;
revoke execute on function public.rc_grant_progress_sync_consent_v1(text)
 from public, anon, service_role;
revoke execute on function public.rc_revoke_progress_sync_consent_v1()
 from public, anon, service_role;
revoke execute on function public.rc_has_active_progress_sync_consent_v1()
 from public, anon, service_role;

comment on function public.rc_has_active_progress_sync_consent_v1() is
 'R43 protected: requires live Auth session and active consent';

commit;
