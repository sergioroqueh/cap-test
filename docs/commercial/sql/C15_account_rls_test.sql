-- Assertions against the C15 draft on disposable PostgreSQL. No real JWT verification here.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"is_anonymous":false}',true);
insert into public.rc_student_profiles(user_id,preferred_region) values(auth.uid(),'clm');
update public.rc_student_profiles set preferred_region='md' where user_id=auth.uid();
insert into public.rc_question_progress(user_id,question_id,attempts,correct) values(auth.uid(),'synthetic-1',2,1);
update public.rc_question_progress set favorite=true where question_id='synthetic-1';
insert into public.rc_study_sessions(user_id,session_id,catalog_version,source_id,completed_at,attempted,correct) values(auth.uid(),'00000000-0000-4000-8000-000000000011','synthetic-v1','synthetic-exam',now(),2,1);
do $$ begin
 if (select count(*) from public.rc_student_profiles where preferred_region='md')<>1 or (select count(*) from public.rc_question_progress where favorite)<>1 or (select count(*) from public.rc_study_sessions)<>1 then raise exception 'own writes failed';end if;
 begin update public.rc_student_profiles set user_id='00000000-0000-4000-8000-000000000002';raise exception 'ownership update allowed';exception when insufficient_privilege then null;end;
 begin update public.rc_question_progress set question_id='other';raise exception 'identity update allowed';exception when insufficient_privilege then null;end;
 begin update public.rc_study_sessions set correct=2;raise exception 'session mutation allowed';exception when insufficient_privilege then null;end;
 begin delete from public.rc_question_progress;raise exception 'client deletion allowed';exception when insufficient_privilege then null;end;
 begin update public.rc_question_progress set correct=3;raise exception 'invalid counters allowed';exception when check_violation then null;end;
 begin update public.rc_student_profiles set preferred_region='invalid';raise exception 'invalid region allowed';exception when check_violation then null;end;
 begin insert into public.rc_study_sessions(user_id,session_id,catalog_version,source_id,completed_at,attempted,correct) values(auth.uid(),'00000000-0000-4000-8000-000000000011','v1','exam',now(),2,1);raise exception 'duplicate session allowed';exception when unique_violation then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$ declare n integer;begin
 if (select count(*) from public.rc_student_profiles)<>0 or (select count(*) from public.rc_question_progress)<>0 or (select count(*) from public.rc_study_sessions)<>0 then raise exception 'cross-account read';end if;
 update public.rc_student_profiles set preferred_region='an';get diagnostics n=row_count;if n<>0 then raise exception 'cross-account profile write';end if;
 update public.rc_question_progress set favorite=false;get diagnostics n=row_count;if n<>0 then raise exception 'cross-account progress write';end if;
 begin insert into public.rc_student_profiles(user_id,preferred_region) values('00000000-0000-4000-8000-000000000001','clm');raise exception 'cross-account profile insert';exception when insufficient_privilege then null;end;
 begin insert into public.rc_question_progress(user_id,question_id) values('00000000-0000-4000-8000-000000000001','other');raise exception 'cross-account progress insert';exception when insufficient_privilege then null;end;
 begin insert into public.rc_study_sessions(user_id,session_id,catalog_version,source_id,completed_at,attempted,correct) values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012','v1','exam',now(),0,0);raise exception 'cross-account session insert';exception when insufficient_privilege then null;end;
end $$;
insert into public.rc_student_profiles(user_id,preferred_region) values(auth.uid(),'clm');
select set_config('request.jwt.claims','{"is_anonymous":true}',true);
do $$ begin
 if (select count(*) from public.rc_student_profiles)<>0 or (select count(*) from public.rc_question_progress)<>0 or (select count(*) from public.rc_study_sessions)<>0 then raise exception 'anonymous auth read allowed';end if;
 begin insert into public.rc_question_progress(user_id,question_id) values(auth.uid(),'other');raise exception 'anonymous auth insert allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{}',true);
do $$ begin if (select count(*) from public.rc_student_profiles)<>0 then raise exception 'missing identity claim fails open';end if;end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.rc_student_profiles;raise exception 'anon profile read';exception when insufficient_privilege then null;end;
 begin perform * from public.rc_question_progress;raise exception 'anon progress read';exception when insufficient_privilege then null;end;
 begin perform * from public.rc_study_sessions;raise exception 'anon session read';exception when insufficient_privilege then null;end;
 begin insert into public.rc_student_profiles(user_id,preferred_region) values('00000000-0000-4000-8000-000000000001','clm');raise exception 'anon insert';exception when insufficient_privilege then null;end;
end $$;
reset role;
delete from auth.users where id='00000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select from public.rc_question_progress) or exists(select from public.rc_study_sessions) or exists(select from public.rc_student_profiles where user_id='00000000-0000-4000-8000-000000000001') then raise exception 'cascade failed';end if;
 if (select count(*) from public.rc_student_profiles)<>1 then raise exception 'other owner deleted';end if;
end $$;
rollback;
select 'C15 PostgreSQL RLS draft checks PASS' as result;
