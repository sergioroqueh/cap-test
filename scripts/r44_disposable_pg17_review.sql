-- R44 disposable PostgreSQL 17; requires bootstrap + C28 C29 R37 R39 R43.
\set ON_ERROR_STOP on

-- Assert roles and executable surfaces before using mocked JWT claims.
do $r44$
begin
 if has_function_privilege('anon','public.rc_is_active_session_v1()','EXECUTE')
    or has_function_privilege('anon','rc_internal.rc_is_active_session_v1()','EXECUTE')
    or has_function_privilege('service_role','public.rc_is_active_session_v1()','EXECUTE')
    or has_function_privilege('anon','public.rc_grant_progress_sync_consent_v1(text)','EXECUTE')
    or has_table_privilege('authenticated','auth.sessions','SELECT')
 then raise exception 'R44 FAIL: role surface not restricted'; end if;
 if not has_function_privilege('authenticated','public.rc_is_active_session_v1()','EXECUTE')
    or not has_function_privilege('authenticated','rc_internal.rc_is_active_session_v1()','EXECUTE')
 then raise exception 'R44 FAIL: authenticated RPC not usable'; end if;
 if (select count(*) from pg_policies
     where schemaname='public' and tablename like 'rc_%') <> 12
 then raise exception 'R44 FAIL: altered policy count'; end if;
end
$r44$;

-- A: verified-claim analogue, live session, no consent.
set role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":false,"session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',false);
do $r44$
begin
 if not public.rc_is_active_session_v1() then
  raise exception 'R44 FAIL: valid A session refused'; end if;
 if public.rc_read_consistent_snapshot_v2(1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') is not null
 then raise exception 'R44 FAIL: snapshot before consent'; end if;
end
$r44$;
select public.rc_grant_progress_sync_consent_v1('progress-sync-v1') as revision_a;
insert into public.rc_progress_events(user_id,event_id,question_id,payload,occurred_at)
values ('11111111-1111-4111-8111-111111111111','r44-a-1','r44-q1',
 '{"eventId":"r44-a-1","questionId":"r44-q1","questionnaireId":"hist","deviceId":"r44","clock":1,"occurredAt":1795000000000,"kind":"answer","answer":"A","correct":true}'::jsonb,
 now());
do $r44$
declare snap jsonb;
begin
 snap := public.rc_read_consistent_snapshot_v2(1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 if snap->>'userId' <> '11111111-1111-4111-8111-111111111111'
    or jsonb_array_length(snap->'events') <> 1
    or (select count(*) from public.rc_sync_consents) <> 1
    or (select count(*) from public.rc_progress_events) <> 1
 then raise exception 'R44 FAIL: A consented read incomplete'; end if;
end
$r44$;

-- B: different live principal, no consent, cannot see A (read-only).
select set_config('request.jwt.claims',
 '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":false,"session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}',false);
do $r44$
begin
 if not public.rc_is_active_session_v1()
   or (select count(*) from public.rc_progress_events) <> 0
   or (select count(*) from public.rc_sync_consents) <> 0
   or public.rc_read_consistent_snapshot_v2(1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') is not null
 then raise exception 'R44 FAIL: B isolation'; end if;
end
$r44$;

-- Synthetic Auth logout: remove session ROW as trusted DB fixture admin.
reset role;
delete from auth.sessions where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;
-- Old JWT claim is still valid syntactically: deny by lack of auth.sessions row.
select set_config('request.jwt.claims',
 '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":false,"session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',false);
do $r44$
declare rejected boolean := false;
begin
 if public.rc_is_active_session_v1()
   or (select count(*) from public.rc_progress_events) <> 0
   or (select count(*) from public.rc_sync_consents) <> 0
   or (select count(*) from public.rc_sync_consent_audit) <> 0
   or public.rc_read_consistent_snapshot_v2(1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') is not null
 then raise exception 'R44 FAIL: stale JWT can read after logout'; end if;
 begin
   perform public.rc_grant_progress_sync_consent_v1('progress-sync-v1');
 exception when insufficient_privilege then rejected := true;
 end;
 if not rejected then raise exception 'R44 FAIL: stale JWT grant accepted'; end if;
 rejected := false;
 begin
   perform public.rc_revoke_progress_sync_consent_v1();
 exception when insufficient_privilege then rejected := true;
 end;
 if not rejected then raise exception 'R44 FAIL: stale JWT revoke accepted'; end if;
 rejected := false;
 begin
   insert into public.rc_progress_events(user_id,event_id,question_id,payload,occurred_at)
   values ('11111111-1111-4111-8111-111111111111','r44-stale-insert','r44-q2',
     '{"eventId":"r44-stale-insert","questionId":"r44-q2","questionnaireId":"hist","deviceId":"r44","clock":2,"occurredAt":1795000000001,"kind":"answer","answer":"B","correct":false}'::jsonb,
     now());
 exception when insufficient_privilege then rejected := true;
 end;
 if not rejected then raise exception 'R44 FAIL: stale JWT direct INSERT accepted'; end if;
end
$r44$;

-- Fresh A session can still revoke and regrant after login, but old revision
-- never revives when calling the new session with pinned old revision.
reset role;
insert into auth.sessions(id,user_id,not_after)
values ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',null);
set role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":false,"session_id":"aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"}',false);
do $r44$
begin
 if not public.rc_is_active_session_v1() then raise exception 'R44 FAIL: new session rejected'; end if;
end
$r44$;
select public.rc_revoke_progress_sync_consent_v1() as revision_2;
select public.rc_grant_progress_sync_consent_v1('progress-sync-v1') as revision_3;
do $r44$
begin
 if public.rc_read_consistent_snapshot_v2(1,'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa') is not null
   or public.rc_read_consistent_snapshot_v2(3,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') is not null
   or jsonb_array_length(public.rc_read_consistent_snapshot_v2(3,
       'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')->'events') <> 1
 then raise exception 'R44 FAIL: revision/session pin'; end if;
end
$r44$;
reset role;
-- Expired auth.sessions.not_after must disable even a signed-looking claim.
update auth.sessions set not_after=now()-interval '1 second'
  where id='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
set role authenticated;
do $r44$
begin
 if public.rc_is_active_session_v1()
    or (select count(*) from public.rc_progress_events) <> 0
 then raise exception 'R44 FAIL: expired session retained direct access'; end if;
end
$r44$;
reset role;
\echo 'R44 PG17 disposable PASS: SQL, RLS, stale JWT reads/INSERT/RPC, consent, not_after, grants; NOT REAL AUTH.'
