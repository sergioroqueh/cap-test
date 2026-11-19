-- C32: DISPOSABLE PostgreSQL ONLY. No live Supabase URL or credentials.
-- Run AFTER C15_auth_fixture.sql + C28_full_fidelity_schema_draft.sql
-- and C29_event_ledger_draft.sql in a fresh CI PostgreSQL container.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);

insert into public.rc_progress_events(user_id,event_id,question_id,payload,occurred_at)
values(auth.uid(),'fixture-a-e1','fixture-q1',
'{"eventId":"fixture-a-e1","questionId":"fixture-q1","questionnaireId":"cap","deviceId":"fixture","clock":1,"occurredAt":1763400000001,"kind":"answer","answer":"A","correct":true}',now());
insert into public.rc_study_sessions(user_id,session_key,payload,completed_at)
values(auth.uid(),'fixture-a-s1',
'{"clientId":"fixture-a-s1","type":"exam","answered":1,"correct":1,"answers":[{"questionId":"fixture-q1","questionnaireId":"cap","selected":"A","correctAnswer":"A","correct":true}]}',now());
do $$begin
 if (select count(*) from public.rc_progress_events)<>1 then raise exception 'A cannot read own ledger';end if;
 if (select jsonb_array_length(payload->'answers') from public.rc_study_sessions where session_key='fixture-a-s1')<>1 then raise exception 'A session lost answers';end if;
end$$;

-- B knows exact keys of A but cannot read/insert/update/delete them.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$begin
 if exists(select from public.rc_progress_events) or exists(select from public.rc_study_sessions)
 then raise exception 'cross-user read leaked';end if;
 begin
  insert into public.rc_progress_events(user_id,event_id,question_id,payload,occurred_at)
  values('00000000-0000-4000-8000-000000000001','fixture-b-intrusion','fixture-q1',
  '{"eventId":"fixture-b-intrusion","questionId":"fixture-q1","questionnaireId":"cap","deviceId":"fixture","clock":2,"occurredAt":1763400000002,"kind":"favorite","favorite":true}',now());
  raise exception 'cross-user insert unexpectedly accepted';
 exception when insufficient_privilege then null;end;
 begin
  update public.rc_progress_events set occurred_at=now();
  raise exception 'client UPDATE unexpectedly allowed';
 exception when insufficient_privilege then null;end;
 begin
  delete from public.rc_progress_events;
  raise exception 'client DELETE unexpectedly allowed';
 exception when insufficient_privilege then null;end;
end$$;

insert into public.rc_progress_events(user_id,event_id,question_id,payload,occurred_at)
values(auth.uid(),'fixture-b-e1','fixture-b-q1',
'{"eventId":"fixture-b-e1","questionId":"fixture-b-q1","questionnaireId":"cap","deviceId":"fixture","clock":1,"occurredAt":1763400000003,"kind":"answer","answer":"B","correct":false}',now());
do $$begin
 if (select count(*) from public.rc_progress_events)<>1 then raise exception 'B cannot see own ledger';end if;
end$$;

-- Authenticated but anonymous JWT may not read, even if assigned a UUID.
select set_config('request.jwt.claims','{"is_anonymous":true}',true);
do $$begin
 if exists(select from public.rc_progress_events) or exists(select from public.rc_study_sessions)
 then raise exception 'anonymous authenticated role leaked';end if;
end$$;
select set_config('request.jwt.claims','{}',true);
do $$begin
 if exists(select from public.rc_progress_events) then raise exception 'missing is_anonymous claim leaked';end if;
end$$;
reset role;
set local role anon;
do $$begin
 begin perform * from public.rc_progress_events;
  raise exception 'anon read ledger';
 exception when insufficient_privilege then null;end;
 begin perform * from public.rc_study_sessions;
  raise exception 'anon read session';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
select 'C32 disposable RLS owner A/B, anon, append-only PASS' as result;
