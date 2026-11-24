-- R97 disposable integration fixture, run only after R92/R93/R95 tests.
\set ON_ERROR_STOP on
do $$begin
 if current_database()<>'rutacap_r92_synthetic' or not exists(select 1 from pg_namespace where nspname='rc_internal')
 or exists(select 1 from pg_class where relname='rc_selection_receipts_v1') then raise exception 'WRONG_FIXTURE';end if;
end$$;
\ir ../docs/commercial/sql/R97_selection_review.sql
insert into auth.users(id,is_anonymous,email_confirmed_at) values
 ('a1111111-1111-4111-8111-111111111111',true,null),
 ('a2222222-2222-4222-8222-222222222222',false,now());
insert into auth.sessions(id,user_id,not_after) values
 ('b1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',null),
 ('b2222222-2222-4222-8222-222222222222','a2222222-2222-4222-8222-222222222222',null);
-- 130 synthetic historical units, no real exam content.
insert into rc_internal.rc_delivery_catalog_v1(kind,content_id,revision,minimum_tier,publishable,payload)
select 'question','cap:r97:'||i,'v1','guest',true,
 jsonb_build_object('questions',jsonb_build_array(jsonb_build_object(
 'id','cap:r97:'||i,'progressId','r97-'||i,'examId','r97','category','mercancias','section','1','questionnaireId','synthetic',
 'question','SYNTHETIC R97 '||i,'options',jsonb_build_object('A','a','B','b','C','c','D','d'),
 'correctAnswer','A','originalSheetAnswer','A','scoringEligible',true,'examFrequency',case when i<=110 then 4 else 2 end)))
from generate_series(1,130) i;
-- Higher frequency excluded, unpublished, premium-only, or duplicated.
insert into rc_internal.rc_delivery_catalog_v1(kind,content_id,revision,minimum_tier,publishable,payload)
select 'question','cap:r97:'||i,'v1',case when i=134 then 'premium' else 'guest' end,i<>133,
 jsonb_build_object('questions',jsonb_build_array(jsonb_build_object(
 'id','cap:r97:'||i,'progressId',case when i=131 then 'r97-1' else 'r97-'||i end,'examId','r97','category','mercancias','section','1','questionnaireId','synthetic',
 'question',case when i=132 then '¿synthetic  r97 2?' else 'SYNTHETIC R97 '||i end,
 'options',jsonb_build_object('A','a','B','b','C','c','D','d'),'correctAnswer','A','originalSheetAnswer','A',
 'scoringEligible',i<>135,'examFrequency',99)))
from generate_series(131,135) i;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated","is_anonymous":true,"session_id":"b1111111-1111-4111-8111-111111111111"}',false);
do $$declare a jsonb;b jsonb;begin
 if has_table_privilege(current_user,'rc_internal.rc_selection_receipts_v1','SELECT')
 or has_function_privilege(current_user,'rc_internal.rc_delivery_context_v1()','EXECUTE')
 or has_function_privilege('anon','public.rc_deliver_selection_v1(text,text,integer,jsonb,uuid)','EXECUTE') then raise exception 'BYPASS';end if;
 a:=public.rc_deliver_v1('question','cap:r97:1',md5('single-r97')::uuid);
 if a->>'questionsRemaining' is distinct from '24' then raise exception 'SINGLE';end if;
 a:=public.rc_deliver_selection_v1('top100','mercancias',100,'{}',md5('top-r97')::uuid);
 if a->>'status' is distinct from 'ok' or a->>'count' is distinct from '24' or a->>'questionsRemaining' is distinct from '0' then raise exception 'SHARED_QUOTA';end if;
 if exists(select 1 from jsonb_array_elements(a->'content'->'questions') x where x->>'id' in ('cap:r97:133','cap:r97:134','cap:r97:135') or (x->>'examFrequency')::int<4) then raise exception 'BAD_SELECTION';end if;
 b:=public.rc_deliver_selection_v1('top100','mercancias',100,'{}',md5('top-r97')::uuid);
 if b->>'replayed' is distinct from 'true' or b->'content' is distinct from a->'content' then raise exception 'REPLAY';end if;
 begin
  perform public.rc_deliver_selection_v1('top4','mercancias',100,'{}',md5('top-r97')::uuid);
  raise exception 'CONFLICT_NOT_DENIED';
 exception when unique_violation then null;end;
 a:=public.rc_deliver_selection_v1('mixed-study','mercancias',20,'{}',md5('full-r97')::uuid);
 if a->>'status' is distinct from 'quota_exhausted' or a ? 'content' then raise exception 'QUOTA_DENIAL';end if;
 a:=public.rc_deliver_selection_v1('mixed-exam','mercancias',100,'{}',md5('exam-r97')::uuid);
 if a->>'count' is distinct from '100' or a->>'examsRemaining' is distinct from '0' or a->>'questionsRemaining' is distinct from '0' then raise exception 'EXAM_CAP';end if;
 if (select count(distinct x->>'progressId') from jsonb_array_elements(a->'content'->'questions') x)<>100 then raise exception 'CANONICAL_DUP';end if;
 a:=public.rc_deliver_v1('exam','e1',md5('second-r97')::uuid);
 if a->>'status' is distinct from 'quota_exhausted' then raise exception 'SINGLE_EXAM_SHARED_QUOTA';end if;
end$$;
select set_config('request.jwt.claims','{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated","is_anonymous":false,"session_id":"b2222222-2222-4222-8222-222222222222"}',false);
do $$declare a jsonb;begin
 a:=public.rc_deliver_selection_v1('favorites','mercancias',20,'{"r97-5":1}',md5('favorite-r97')::uuid);
 if a->>'count' is distinct from '1' or a->'content'->'questions'->0->>'progressId' is distinct from 'r97-5' or a->>'questionsRemaining' is distinct from '99' then raise exception 'FAVORITE';end if;
 a:=public.rc_deliver_selection_v1('errors','mercancias',20,'{"r97-6":1}',md5('error-r97')::uuid);
 if a->>'count' is distinct from '1' or a->'content'->'questions'->0->>'progressId' is distinct from 'r97-6' then raise exception 'ERROR';end if;
 a:=public.rc_deliver_selection_v1('review','mercancias',1,'{"r97-10":100}',md5('review-r97')::uuid);
 if a->'content'->'questions'->0->>'progressId' is distinct from 'r97-10' then raise exception 'REVIEW_PRIORITY';end if;
 a:=public.rc_deliver_selection_v1('mixed-exam','viajeros',100,'{}',md5('unavailable-r97')::uuid);
 if a->>'status' is distinct from 'unavailable' or a ? 'content' then raise exception 'NO_POOL';end if;
 a:=public.rc_deliver_selection_v1('top4','mercancias',20,'{}',md5('top4-r97')::uuid);
 if a->>'count' is distinct from '20' then raise exception 'TOP4';end if;
end$$;
reset role;
update rc_internal.rc_delivery_catalog_v1 set publishable=false where content_id='cap:r97:5';
set role authenticated;
do $$declare a jsonb;begin
 a:=public.rc_deliver_selection_v1('favorites','mercancias',20,'{"r97-5":1}',md5('favorite-r97')::uuid);
 if a->>'status' is distinct from 'unavailable' then raise exception 'WITHDRAWN_REPLAY';end if;
end$$;
reset role;
select 'R97 shared quota, eligibility, preference and receipt checks passed' as result;
