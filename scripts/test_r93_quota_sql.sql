-- R93 synthetic PostgreSQL integration. Run ONLY after R92 fixture in CI.
\set ON_ERROR_STOP on
do $$begin
 if current_database()<>'rutacap_r92_synthetic' or not exists(select 1 from pg_namespace where nspname='rc_internal')
 or exists(select 1 from pg_class where relname='rc_billing_subscriptions') then raise exception 'WRONG_FIXTURE';end if;
end$$;
\ir ../docs/commercial/sql/R82_BILLING_DRAFT.sql
\ir ../docs/commercial/sql/R93_quota_delivery_review.sql
insert into auth.users(id,is_anonymous,email_confirmed_at) values
 ('55555555-5555-4555-8555-555555555555',true,null),
 ('66666666-6666-4666-8666-666666666666',false,now()),
 ('77777777-7777-4777-8777-777777777777',true,null),
 ('88888888-8888-4888-8888-888888888888',false,null);
insert into auth.sessions(id,user_id,not_after) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-4555-8555-555555555555',null),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','66666666-6666-4666-8666-666666666666',null),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','77777777-7777-4777-8777-777777777777',null),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','88888888-8888-4888-8888-888888888888',null);
insert into rc_internal.rc_delivery_catalog_v1(kind,content_id,revision,minimum_tier,publishable,payload) values
 ('question','q1','v1','guest',true,'{"synthetic":"q1"}'),
 ('question','q2','v1','guest',true,'{"synthetic":"q2"}'),
 ('question','hidden','v1','guest',false,'{"synthetic":"hidden"}'),
 ('question','premium1','v1','premium',true,'{"synthetic":"premium"}'),
 ('exam','e1','v1','guest',true,'{"synthetic":"e1"}');

-- Madrid local day and 23h/25h DST days; no caller clock in delivery RPC.
do $$begin
 if rc_internal.rc_quota_day_v1('2026-11-24 22:59:59+00')<>'2026-11-24'::date
 or rc_internal.rc_quota_day_v1('2026-11-24 23:00:00+00')<>'2026-11-25'::date
 or rc_internal.rc_quota_day_v1('2026-07-01 22:00:00+00')<>'2026-07-02'::date
 or rc_internal.rc_quota_reset_v1('2026-03-29')-rc_internal.rc_quota_reset_v1('2026-03-28')<>interval '23 hours'
 or rc_internal.rc_quota_reset_v1('2026-10-25')-rc_internal.rc_quota_reset_v1('2026-10-24')<>interval '25 hours' then raise exception 'MADRID_DAY';end if;
end$$;

set role authenticated;
select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated","is_anonymous":true,"session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',false);
do $$begin
 if has_table_privilege(current_user,'rc_internal.rc_quota_daily_v1','UPDATE')
 or has_table_privilege(current_user,'rc_internal.rc_delivery_catalog_v1','SELECT')
 or has_table_privilege(current_user,'rc_internal.rc_quota_receipts_v1','INSERT')
 or has_function_privilege('anon','public.rc_deliver_v1(text,text,uuid)','EXECUTE') then raise exception 'BYPASS';end if;
 begin
  perform public.rc_deliver_v1('question','q1',md5('disabled')::uuid);
  raise exception 'DISABLED_NOT_DENIED';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
update rc_internal.rc_quota_config_v1 set delivery_enabled=true,guests_enabled=true;

set role authenticated;
do $$declare r jsonb; i integer;begin
 r:=public.rc_deliver_v1('question','hidden',md5('hidden')::uuid);
 if r->>'status' is distinct from 'unavailable' or r ? 'content' then raise exception 'HIDDEN';end if;
 r:=public.rc_deliver_v1('question','premium1',md5('premium-denied')::uuid);
 if r->>'status' is distinct from 'unavailable' or r ? 'content' then raise exception 'PREMIUM_DENIED';end if;
 for i in 1..25 loop
   r:=public.rc_deliver_v1('question','q1',md5('guest-q'||i)::uuid);
   if r->>'status' is distinct from 'ok' or (r->>'questionsRemaining')::int is distinct from 25-i
   or r->>'tier' is distinct from 'guest' then raise exception 'GUEST_QUESTION_CAP';end if;
 end loop;
 r:=public.rc_deliver_v1('question','q1',md5('guest-q26')::uuid);
 if r->>'status' is distinct from 'quota_exhausted' or r ? 'content' then raise exception 'GUEST_26';end if;
 r:=public.rc_deliver_v1('question','q1',md5('guest-q1')::uuid);
 if r->>'replayed' is distinct from 'true' or r->>'questionsRemaining' is distinct from '0' then raise exception 'RETRY';end if;
 begin
  perform public.rc_deliver_v1('question','q2',md5('guest-q1')::uuid);
  raise exception 'IDEMPOTENCY_NOT_REJECTED';
 exception when unique_violation then null;end;
 r:=public.rc_deliver_v1('exam','e1',md5('guest-exam1')::uuid);
 if r->>'status' is distinct from 'ok' or r->>'examsRemaining' is distinct from '0' then raise exception 'GUEST_EXAM';end if;
 r:=public.rc_deliver_v1('exam','e1',md5('guest-exam2')::uuid);
 if r->>'status' is distinct from 'quota_exhausted' or r ? 'content' then raise exception 'GUEST_EXAM2';end if;
end$$;
select set_config('request.jwt.claims','{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated","is_anonymous":false,"session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}',false);
do $$declare r jsonb; i integer;begin
 for i in 1..100 loop
  r:=public.rc_deliver_v1('question','q1',md5('free-q'||i)::uuid);
  if r->>'status' is distinct from 'ok' or (r->>'questionsRemaining')::int is distinct from 100-i or r->>'tier' is distinct from 'free' then raise exception 'FREE_CAP';end if;
 end loop;
 r:=public.rc_deliver_v1('question','q1',md5('free-q101')::uuid);
 if r->>'status' is distinct from 'quota_exhausted' or r ? 'content' then raise exception 'FREE_101';end if;
 for i in 1..3 loop
  r:=public.rc_deliver_v1('exam','e1',md5('free-e'||i)::uuid);
  if r->>'status' is distinct from 'ok' or (r->>'examsRemaining')::int is distinct from 3-i then raise exception 'FREE_EXAM';end if;
 end loop;
 r:=public.rc_deliver_v1('exam','e1',md5('free-e4')::uuid);
 if r->>'status' is distinct from 'quota_exhausted' or r ? 'content' then raise exception 'FREE_EXAM4';end if;
end$$;
reset role;
insert into public.rc_billing_customers(user_id,stripe_customer_id) values('66666666-6666-4666-8666-666666666666','cus_synthetic');
insert into public.rc_billing_subscriptions(user_id,stripe_customer_id,stripe_subscription_id,status,price_id,current_period_end,stripe_livemode) values
 ('66666666-6666-4666-8666-666666666666','cus_synthetic','sub_synthetic','active','price_synthetic',now()+interval '1 day',false);
update rc_internal.rc_quota_config_v1 set billing_mode='live',approved_price_id='price_synthetic';
set role authenticated;
do $$declare r jsonb;begin
 r:=public.rc_deliver_v1('question','q1',md5('test-not-live')::uuid);
 if r->>'tier' is distinct from 'free' or r->>'status' is distinct from 'quota_exhausted' then raise exception 'TEST_AS_LIVE';end if;
end$$;
reset role;
update rc_internal.rc_quota_config_v1 set billing_mode='test',approved_price_id='price_wrong';
set role authenticated;
do $$declare r jsonb;begin
 r:=public.rc_deliver_v1('question','q1',md5('wrong-price')::uuid);
 if r->>'tier' is distinct from 'free' then raise exception 'WRONG_PRICE';end if;
end$$;
reset role;
insert into rc_internal.rc_billing_test_users_v1 values('66666666-6666-4666-8666-666666666666');
update rc_internal.rc_quota_config_v1 set approved_price_id='price_synthetic';
set role authenticated;
do $$declare r jsonb;begin
 r:=public.rc_deliver_v1('question','premium1',md5('premium-q')::uuid);
 if r->>'tier' is distinct from 'premium' or r->>'status' is distinct from 'ok'
 or r->'questionsRemaining' is distinct from 'null'::jsonb or r->'examsRemaining' is distinct from 'null'::jsonb then raise exception 'PREMIUM';end if;
 r:=public.rc_deliver_v1('exam','e1',md5('premium-e')::uuid);
 if r->>'status' is distinct from 'ok' then raise exception 'PREMIUM_EXAM';end if;
end$$;
reset role;
update public.rc_billing_subscriptions set current_period_end=now()-interval '1 second';
set role authenticated;
do $$declare r jsonb;begin
 r:=public.rc_deliver_v1('question','premium1',md5('premium-q')::uuid);
 if r->>'status' is distinct from 'unavailable' then raise exception 'PREMIUM_REPLAY_AFTER_EXPIRY';end if;
 r:=public.rc_deliver_v1('question','q1',md5('downgrade')::uuid);
 if r->>'status' is distinct from 'quota_exhausted' or r->>'tier' is distinct from 'free' then raise exception 'DOWNGRADE_USAGE_RESET';end if;
end$$;
select set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated","is_anonymous":false,"session_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}',false);
do $$begin
 begin
  perform public.rc_deliver_v1('question','q1',md5('unverified')::uuid);
  raise exception 'UNVERIFIED_NOT_DENIED';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
delete from auth.sessions where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated","is_anonymous":true,"session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',false);
do $$begin
 begin
  perform public.rc_deliver_v1('question','q1',md5('logged-out')::uuid);
  raise exception 'LOGOUT_NOT_DENIED';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
select 'R93 quota SQL checks passed' as result;
