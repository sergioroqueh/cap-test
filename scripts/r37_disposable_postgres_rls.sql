-- R37 only in disposable PostgreSQL. NO REAL SUPABASE PROJECT.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.jwt()
returns jsonb language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb,'{}'::jsonb) $$;
create function auth.uid()
returns uuid language sql stable
as $$ select nullif((auth.jwt()->>'sub'),'')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.jwt(),auth.uid() to authenticated, anon;
grant usage on schema public to authenticated, anon;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');

-- Execute proposed C28/C29 schema on the throwaway instance, not Supabase.
\ir ../docs/commercial/sql/C28_full_fidelity_schema_draft.sql
\ir ../docs/commercial/sql/C29_event_ledger_draft.sql
\ir ../docs/commercial/sql/R37_consistent_snapshot_review.sql

insert into public.rc_progress_events(user_id,event_id,question_id,payload,occurred_at)
values
 ('11111111-1111-4111-8111-111111111111','a-e1','q-a',
 '{"eventId":"a-e1","questionId":"q-a","questionnaireId":"hist","deviceId":"test-a","clock":1,"occurredAt":1795000000000,"kind":"answer","answer":"A","correct":true}'::jsonb,
 '2026-11-18T20:00:00Z'),
 ('22222222-2222-4222-8222-222222222222','b-e1','q-b',
 '{"eventId":"b-e1","questionId":"q-b","questionnaireId":"hist","deviceId":"test-b","clock":1,"occurredAt":1795000000000,"kind":"answer","answer":"B","correct":false}'::jsonb,
 '2026-11-18T20:00:00Z');
insert into public.rc_study_sessions(user_id,session_key,payload,completed_at)
values
 ('11111111-1111-4111-8111-111111111111','a-s1',
 '{"clientId":"a-s1","type":"exam","startedAt":100,"completedAt":200,"answered":1,"correct":1,"answers":[]}'::jsonb,
 '2026-11-18T20:01:00Z'),
 ('22222222-2222-4222-8222-222222222222','b-s1',
 '{"clientId":"b-s1","type":"exam","startedAt":100,"completedAt":200,"answered":1,"correct":0,"answers":[]}'::jsonb,
 '2026-11-18T20:01:00Z');

-- Deliberately switch to a real low-privilege PG role; RLS must apply.
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","is_anonymous":false}';
do $$
declare snapshot jsonb;
begin
  select public.rc_read_consistent_snapshot_v1() into snapshot;
  if snapshot->>'userId' <> '11111111-1111-4111-8111-111111111111'
     or jsonb_array_length(snapshot->'events') <> 1
     or jsonb_array_length(snapshot->'sessions') <> 1
     or snapshot#>>'{events,0,eventId}' <> 'a-e1'
     or snapshot#>>'{sessions,0,clientId}' <> 'a-s1'
     or (select count(*) from public.rc_progress_events where user_id =
        '22222222-2222-4222-8222-222222222222') <> 0
  then raise exception 'R37 FAIL: A saw B or incomplete snapshot'; end if;
end $$;

set request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","is_anonymous":false}';
do $$
declare snapshot jsonb;
begin
  select public.rc_read_consistent_snapshot_v1() into snapshot;
  if snapshot->>'userId' <> '22222222-2222-4222-8222-222222222222'
     or jsonb_array_length(snapshot->'events') <> 1
     or jsonb_array_length(snapshot->'sessions') <> 1
     or snapshot#>>'{events,0,eventId}' <> 'b-e1'
     or snapshot#>>'{sessions,0,clientId}' <> 'b-s1'
  then raise exception 'R37 FAIL: B saw A or incomplete snapshot'; end if;
end $$;

-- A logged-in role with an anonymous Auth claim is denied.
set request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","is_anonymous":true}';
do $$
begin
 if public.rc_read_consistent_snapshot_v1() is not null
    or (select count(*) from public.rc_progress_events) <> 0
 then raise exception 'R37 FAIL: anonymous auth claim allowed'; end if;
end $$;

-- No claim yields no rows (and no snapshot).
set request.jwt.claims = '{}';
do $$
begin
 if public.rc_read_consistent_snapshot_v1() is not null
 then raise exception 'R37 FAIL: identity absent'; end if;
end $$;

reset role;
set role anon;
do $$
begin
 if has_function_privilege(current_user, 'public.rc_read_consistent_snapshot_v1()', 'EXECUTE')
 then raise exception 'R37 FAIL: anon may execute snapshot'; end if;
end $$;
reset role;

do $$
begin
 if (select prosecdef from pg_proc where oid =
     'public.rc_read_consistent_snapshot_v1()'::regprocedure)
 then raise exception 'R37 FAIL: function unexpectedly SECURITY DEFINER'; end if;
end $$;
\echo 'R37 PASS: physical PostgreSQL RLS owner A/B, anon/guest, safe invoker and single SQL-statement snapshot'
