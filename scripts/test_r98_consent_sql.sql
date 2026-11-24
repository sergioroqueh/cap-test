-- R98 disposable fixture only. Exact existing R39 consent routines extracted for integration.
\set ON_ERROR_STOP on
do $$begin
 if current_database()<>'rutacap_r92_synthetic' or not exists(select 1 from pg_namespace where nspname='rc_internal') then raise exception 'WRONG_FIXTURE';end if;
end$$;
alter table public.rc_sync_consents add column granted_at timestamptz default now(),add column updated_at timestamptz default now();
create table public.rc_sync_consent_audit(user_id uuid,purpose text,revision integer,action text,notice_version text,primary key(user_id,purpose,revision));
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
as $$ select rc_internal.rc_grant_progress_sync_consent_v1(p_notice_version); $$;

create function public.rc_revoke_progress_sync_consent_v1()
returns integer language sql volatile security invoker
set search_path = ''
as $$ select rc_internal.rc_revoke_progress_sync_consent_v1(); $$;

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


\ir ../docs/commercial/sql/R98_consent_session_review.sql
insert into auth.users(id,email_confirmed_at) values('98111111-1111-4111-8111-111111111111',now());
insert into auth.sessions(id,user_id) values('98222222-2222-4222-8222-222222222222','98111111-1111-4111-8111-111111111111');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"98111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":false,"session_id":"98222222-2222-4222-8222-222222222222"}',false);
do $$declare s uuid:='98222222-2222-4222-8222-222222222222'; r jsonb;begin
 if has_function_privilege(current_user,'public.rc_grant_progress_sync_consent_v1(text)','EXECUTE')
 or has_function_privilege('anon','public.rc_sync_consent_session_v1(text,uuid)','EXECUTE') then raise exception 'CONSENT_BYPASS';end if;
 r:=public.rc_sync_consent_session_v1('status',s);
 if r->>'granted' is distinct from 'false' then raise exception 'CONSENT_DEFAULT';end if;
 r:=public.rc_sync_consent_session_v1('grant',s);
 if r->>'granted' is distinct from 'true' or r->>'revision' is distinct from '1' then raise exception 'GRANT';end if;
 r:=public.rc_sync_consent_session_v1('grant',s);
 if r->>'revision' is distinct from '1' then raise exception 'GRANT_RETRY';end if;
 r:=public.rc_sync_page_v1(1,s,null,'events',null,100);
 if r->>'status' is distinct from 'ok' then raise exception 'CONSENT_SYNC';end if;
 r:=public.rc_sync_consent_session_v1('revoke',s);
 if r->>'granted' is distinct from 'false' or r->>'revision' is distinct from '2' then raise exception 'REVOKE';end if;
 begin perform public.rc_sync_page_v1(1,s,null,'events',null,100);raise exception 'OLD_CONSENT';
 exception when insufficient_privilege then null;end;
 begin perform public.rc_sync_consent_session_v1('grant','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');raise exception 'FOREIGN_SESSION';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
delete from auth.sessions where id='98222222-2222-4222-8222-222222222222';
set role authenticated;
do $$begin
 begin perform public.rc_sync_consent_session_v1('grant','98222222-2222-4222-8222-222222222222');raise exception 'LOGOUT_NOT_DENIED';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
select 'R98 consent/session integration passed' as result;
