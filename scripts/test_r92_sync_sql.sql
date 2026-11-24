-- R92 synthetic database ONLY. Run on a disposable empty PostgreSQL 16 database.
-- psql -X -v ON_ERROR_STOP=1 -f scripts/test_r92_sync_sql.sql
-- Do not run against Supabase or any existing project.
\set ON_ERROR_STOP on
do $$begin
  if exists(select 1 from pg_namespace where nspname in ('auth','rc_internal')) then
    raise exception 'NOT_AN_EMPTY_SYNTHETIC_DATABASE';
  end if;
end$$;
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema rc_internal;
create table auth.users(id uuid primary key);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select (auth.jwt()->>'sub')::uuid
$$;
grant usage on schema auth to authenticated,anon;
create table public.rc_sync_consents(user_id uuid references auth.users(id),purpose text,notice_version text,
  granted boolean,revision integer,revoked_at timestamptz,primary key(user_id,purpose));
create table public.rc_progress_events(user_id uuid references auth.users(id),event_id text,question_id text,
  payload jsonb,occurred_at timestamptz,primary key(user_id,event_id));
create table public.rc_study_sessions(user_id uuid references auth.users(id),session_key text,
  payload jsonb,completed_at timestamptz,primary key(user_id,session_key));
alter table public.rc_progress_events enable row level security;
alter table public.rc_study_sessions enable row level security;
grant all on public.rc_progress_events,public.rc_study_sessions to authenticated;
create function public.rc_read_consistent_snapshot_v1() returns jsonb language sql as $$select null::jsonb$$;
create function public.rc_read_consistent_snapshot_v2(integer,uuid) returns jsonb language sql as $$select null::jsonb$$;
\ir ../docs/commercial/sql/R92_transactional_sync_review.sql

insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into auth.sessions values
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',null),
 ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',null);
insert into public.rc_sync_consents values
 ('11111111-1111-4111-8111-111111111111','progress-sync','progress-sync-v1',true,1,null),
 ('22222222-2222-4222-8222-222222222222','progress-sync','progress-sync-v1',true,1,null);

set role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":false,"session_id":"33333333-3333-4333-8333-333333333333"}',false);
do $$
declare s uuid:='33333333-3333-4333-8333-333333333333'; r jsonb;
 e jsonb:='{"eventId":"e1","questionId":"q1","questionnaireId":"x","deviceId":"d","clock":1,"occurredAt":1700000000000,"kind":"answer","answer":"A","correct":true}';
 h jsonb:='{"clientId":"s1","type":"exam","startedAt":1700000000000,"completedAt":1700000000001,"answers":[],"answered":0,"correct":0}';
begin
 if has_table_privilege(current_user,'public.rc_progress_events','INSERT') or
    has_table_privilege(current_user,'public.rc_progress_events','SELECT') or
    has_function_privilege(current_user,'public.rc_read_consistent_snapshot_v2(integer,uuid)','EXECUTE') then
    raise exception 'BYPASS_PERMISSION';
 end if;
 r:=public.rc_sync_page_v1(1,s,null,'events',null,100);
 if r->>'generation' is distinct from '0' or jsonb_array_length(r->'records')<>0 then raise exception 'EMPTY';end if;
 r:=public.rc_sync_ingest_v1(1,s,'0',jsonb_build_array(e),jsonb_build_array(h));
 if r->>'generation' is distinct from '1' or r->>'inserted' is distinct from '2' then raise exception 'INSERT';end if;
 r:=public.rc_sync_ingest_v1(1,s,'1',jsonb_build_array(e),jsonb_build_array(h));
 if r->>'generation' is distinct from '1' or r->>'inserted' is distinct from '0' then raise exception 'RETRY';end if;
 r:=public.rc_sync_ingest_v1(1,s,'0',jsonb_build_array(e), '[]');
 if r->>'status' is distinct from 'changed' then raise exception 'STALE_WRITE';end if;
 begin
   perform public.rc_sync_ingest_v1(1,s,'1',jsonb_build_array(e||'{"eventId":"rollback"}',e||'{"answer":"B"}'),'[]');
   raise exception 'COLLISION_NOT_REJECTED';
 exception when unique_violation then null; end;
 r:=public.rc_sync_page_v1(1,s,'1','events',null,100);
 if jsonb_array_length(r->'records')<>1 or r->'records'->0->>'eventId' is distinct from 'e1' then raise exception 'PARTIAL_COMMIT';end if;
 begin
   perform public.rc_sync_page_v1(2,s,null,'events',null,100);
   raise exception 'REVISION_NOT_DENIED';
 exception when insufficient_privilege then null;end;
 begin
   perform public.rc_sync_page_v1(1,'44444444-4444-4444-8444-444444444444',null,'events',null,100);
   raise exception 'SESSION_NOT_DENIED';
 exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":false,"session_id":"44444444-4444-4444-8444-444444444444"}',false);
do $$declare r jsonb;begin
 r:=public.rc_sync_page_v1(1,'44444444-4444-4444-8444-444444444444',null,'events',null,100);
 if jsonb_array_length(r->'records')<>0 then raise exception 'CROSS_ACCOUNT';end if;
end$$;
reset role;
-- Seed existing history in disposable fixture only, before paging.
insert into public.rc_progress_events(user_id,event_id,question_id,payload,occurred_at)
select '11111111-1111-4111-8111-111111111111','z'||lpad(i::text,5,'0'),'q',
 jsonb_build_object('eventId','z'||lpad(i::text,5,'0')),now()
from generate_series(1,5000) i;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":false,"session_id":"33333333-3333-4333-8333-333333333333"}',false);
do $$declare r jsonb; c text:=null; n integer:=0; pages integer:=0;begin
 loop
   r:=public.rc_sync_page_v1(1,'33333333-3333-4333-8333-333333333333','1','events',c,100);
   n:=n+jsonb_array_length(r->'records'); pages:=pages+1;c:=r->>'nextCursor';
   if pages>52 then raise exception 'CURSOR_LOOP';end if;
   exit when c is null;
 end loop;
 if n<>5001 or pages<>51 then raise exception 'PAGINATION_COUNT';end if;
end$$;
reset role;
update public.rc_sync_consents set granted=false,revision=2,revoked_at=now() where user_id='11111111-1111-4111-8111-111111111111';
set role authenticated;
do $$begin
 begin
  perform public.rc_sync_page_v1(1,'33333333-3333-4333-8333-333333333333',null,'events',null,100);
  raise exception 'REVOKED_NOT_DENIED';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
update public.rc_sync_consents set granted=true,revision=3,revoked_at=null where user_id='11111111-1111-4111-8111-111111111111';
delete from auth.sessions where id='33333333-3333-4333-8333-333333333333';
set role authenticated;
do $$begin
 begin
  perform public.rc_sync_page_v1(3,'33333333-3333-4333-8333-333333333333',null,'events',null,100);
  raise exception 'LOGOUT_NOT_DENIED';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
select 'R92 synthetic PostgreSQL checks passed' as result;
