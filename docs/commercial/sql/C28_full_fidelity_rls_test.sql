-- C28: separate disposable PostgreSQL A/B test using synthetic users only.
-- No real credentials, no live Supabase access, no migration/deployment.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);

insert into public.rc_student_profiles(user_id,preferred_region) values (auth.uid(),'clm');
insert into public.rc_question_progress(user_id,question_id,payload) values
(auth.uid(),'synthetic-question', '{"questionId":"synthetic-question","questionnaireId":"synthetic-bank","attempts":3,"correct":2,"incorrect":1,"streak":2,"favorite":true,"lastAnswer":"C","lastCorrect":true,"lastAnsweredAt":1795000000000,"updatedAt":1795000000000}');
insert into public.rc_study_sessions(user_id,session_key,payload,completed_at) values
(auth.uid(),'synthetic-session-1',
'{"clientId":"synthetic-session-1","type":"exam","label":"Simulacro","startedAt":1795000000000,"completedAt":1795001200000,"total":100,"answered":2,"correct":1,"incorrect":1,"score":0.5,"netPoints":0.5,"timed":true,"durationMinutes":120,"answers":[{"questionId":"a","questionnaireId":"b","selected":"C","correctAnswer":"C","correct":true},{"questionId":"d","questionnaireId":"b","selected":"B","correctAnswer":"A","correct":false}]}',
now());

do $$ begin
 if (select payload->>'lastAnswer' from public.rc_question_progress where question_id='synthetic-question')<>'C'
 then raise exception 'progress payload lost fields';end if;
 if (select jsonb_array_length(payload->'answers') from public.rc_study_sessions where session_key='synthetic-session-1')<>2
 then raise exception 'session answer details lost';end if;
 if (select count(*) from public.rc_question_progress)<>1 or (select count(*) from public.rc_study_sessions)<>1 then raise exception 'own reads failed';end if;
 begin
  insert into public.rc_question_progress(user_id,question_id,payload) values
  (auth.uid(),'other','{"questionId":"wrong","questionnaireId":"q","attempts":1,"correct":1,"incorrect":0,"streak":1,"favorite":false}');
  raise exception 'mismatching question id allowed';
 exception when check_violation then null;end;
 begin
  insert into public.rc_study_sessions(user_id,session_key,payload,completed_at) values
  (auth.uid(),'other','{"clientId":"wrong","type":"exam","answered":0,"correct":0,"answers":[]}',now());
  raise exception 'mismatching session key allowed';
 exception when check_violation then null;end;
 begin
  update public.rc_question_progress set question_id='stolen';
  raise exception 'question identity update allowed';
 exception when insufficient_privilege then null;end;
 begin
  update public.rc_student_profiles set user_id='00000000-0000-4000-8000-000000000002';
  raise exception 'owner update allowed';
 exception when insufficient_privilege then null;end;
 begin
  update public.rc_study_sessions set completed_at=now();
  raise exception 'append-only session update allowed';
 exception when insufficient_privilege then null;end;
 begin
  delete from public.rc_question_progress;
  raise exception 'client deletion allowed';
 exception when insufficient_privilege then null;end;
end $$;

-- User B must not see or mutate user A data, even when guessing all keys.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ declare countrows integer;begin
 if exists(select from public.rc_question_progress) or exists(select from public.rc_study_sessions)
 or exists(select from public.rc_student_profiles) then raise exception 'cross-owner SELECT allowed';end if;
 update public.rc_question_progress set payload='{"questionId":"synthetic-question","questionnaireId":"q","attempts":0,"correct":0,"incorrect":0,"streak":0,"favorite":false}' where question_id='synthetic-question';
 get diagnostics countrows=row_count;
 if countrows<>0 then raise exception 'cross-owner UPDATE allowed';end if;
 begin
  insert into public.rc_question_progress(user_id,question_id,payload) values
  ('00000000-0000-4000-8000-000000000001','synthetic-question-2',
  '{"questionId":"synthetic-question-2","questionnaireId":"q","attempts":0,"correct":0,"incorrect":0,"streak":0,"favorite":false}');
  raise exception 'cross-owner INSERT allowed';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.rc_study_sessions(user_id,session_key,payload,completed_at) values
  ('00000000-0000-4000-8000-000000000001','other',
  '{"clientId":"other","type":"exam","answered":0,"correct":0,"answers":[]}',now());
  raise exception 'cross-owner SESSION INSERT allowed';
 exception when insufficient_privilege then null;end;
end $$;
insert into public.rc_student_profiles(user_id,preferred_region) values(auth.uid(),'md');
insert into public.rc_question_progress(user_id,question_id,payload) values
(auth.uid(),'synthetic-question','{"questionId":"synthetic-question","questionnaireId":"q","attempts":1,"correct":1,"incorrect":0,"streak":1,"favorite":false}');
do $$ begin if (select count(*) from public.rc_question_progress)<>1 then raise exception 'B cannot read own progress';end if;end $$;

-- JWT marked anonymous, or missing is_anonymous, must fail closed.
select set_config('request.jwt.claims','{"is_anonymous":true}',true);
do $$ begin
 if exists(select from public.rc_student_profiles) or exists(select from public.rc_question_progress)
 then raise exception 'anonymous authenticated role can read';end if;
 begin
  update public.rc_question_progress set payload='{"questionId":"synthetic-question","questionnaireId":"q","attempts":0,"correct":0,"incorrect":0,"streak":0,"favorite":false}';
  if FOUND then raise exception 'anonymous authenticated role can write';end if;
 end;
 begin
  insert into public.rc_question_progress(user_id,question_id,payload) values
  (auth.uid(),'anonymous-case','{"questionId":"anonymous-case","questionnaireId":"q","attempts":0,"correct":0,"incorrect":0,"streak":0,"favorite":false}');
  raise exception 'anonymous role can insert';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{}',true);
do $$ begin if exists(select from public.rc_student_profiles) then raise exception 'missing claim fails open';end if;end $$;

reset role;
set local role anon;
do $$ begin
 begin perform * from public.rc_student_profiles;raise exception 'anon read profiles';exception when insufficient_privilege then null;end;
 begin perform * from public.rc_question_progress;raise exception 'anon read progress';exception when insufficient_privilege then null;end;
 begin perform * from public.rc_study_sessions;raise exception 'anon read sessions';exception when insufficient_privilege then null;end;
end $$;
reset role;
delete from auth.users where id='00000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select from public.rc_question_progress where user_id='00000000-0000-4000-8000-000000000001')
 or exists(select from public.rc_study_sessions where user_id='00000000-0000-4000-8000-000000000001')
 or exists(select from public.rc_student_profiles where user_id='00000000-0000-4000-8000-000000000001')
 then raise exception 'A cascades failed';end if;
 if (select count(*) from public.rc_student_profiles)<>1 or (select count(*) from public.rc_question_progress)<>1
 then raise exception 'B data lost after A deletion';end if;
end $$;
rollback;
select 'C28 full-fidelity RLS A/B checks PASS' as result;
