-- R95 ONLY on disposable R92/R93 PostgreSQL fixture. No provider secrets.
\set ON_ERROR_STOP on
do $$begin
 if current_database()<>'rutacap_r92_synthetic' or not exists(select 1 from pg_namespace where nspname='rc_internal')
 or exists(select 1 from pg_class where relname='rc_billing_fence_v1') then raise exception 'WRONG_FIXTURE';end if;
end$$;
\ir ../docs/commercial/sql/R95_billing_test_review.sql
insert into auth.users(id,is_anonymous,email_confirmed_at) values('99999999-9999-4999-8999-999999999999',false,now());
insert into auth.sessions(id,user_id,not_after) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','99999999-9999-4999-8999-999999999999',null);
insert into rc_internal.rc_billing_test_users_v1 values('99999999-9999-4999-8999-999999999999');
insert into public.rc_billing_customers(user_id,stripe_customer_id,stripe_livemode) values('99999999-9999-4999-8999-999999999999','cus_r95synthetic',false);
update rc_internal.rc_quota_config_v1 set billing_mode='test',approved_price_id='price_synthetic';
-- Synthetic collision with a different mode: applying it must roll back.
insert into public.rc_billing_events(stripe_event_id,event_type,livemode) values('evt_collision','customer.subscription.updated',true);
set role authenticated;
do $$begin
 if has_function_privilege(current_user,'public.rc_billing_apply_v1(text,text,text,text,text,jsonb)','EXECUTE')
 or has_function_privilege('anon','public.rc_checkout_reserve_v1(uuid,text,uuid)','EXECUTE') then raise exception 'PUBLIC_BYPASS';end if;
end$$;
reset role;
set role service_role;
do $$
declare u uuid:='99999999-9999-4999-8999-999999999999'; g text; oldg text; r jsonb; a jsonb; b jsonb; snap jsonb;
begin
 if has_table_privilege(current_user,'public.rc_billing_subscriptions','UPDATE') or has_table_privilege(current_user,'public.rc_billing_events','INSERT') then raise exception 'DIRECT_WRITE_BYPASS';end if;
 perform public.rc_billing_test_authorize_v1(u,'price_synthetic','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
 begin
  perform public.rc_billing_test_authorize_v1(u,'price_synthetic','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  raise exception 'SESSION_NOT_DENIED';
 exception when insufficient_privilege then null;end;
 a:=public.rc_checkout_reserve_v1(u,'price_synthetic','aaaaaaaa-1111-4111-8111-111111111111');
 b:=public.rc_checkout_reserve_v1(u,'price_synthetic','bbbbbbbb-1111-4111-8111-111111111111');
 if a is distinct from b then raise exception 'CHECKOUT_RETRY';end if;
 snap:=jsonb_build_object('id','sub_r95synthetic','customer','cus_r95synthetic','priceId','price_synthetic','livemode',false,'status','active','periodEnd',now()+interval '30 days','cancelAtPeriodEnd',false);
 oldg:=public.rc_billing_begin_v1('cus_r95synthetic','price_synthetic','evt_old')->>'generation';
 g:=public.rc_billing_begin_v1('cus_r95synthetic','price_synthetic','evt_new')->>'generation';
 r:=public.rc_billing_apply_v1('cus_r95synthetic','price_synthetic','evt_old','customer.subscription.updated',oldg,snap);
 if r->>'status' is distinct from 'stale' then raise exception 'STALE_ACCEPTED';end if;
 r:=public.rc_billing_apply_v1('cus_r95synthetic','price_synthetic','evt_new','customer.subscription.updated',g,snap);
 if r->>'status' is distinct from 'applied' then raise exception 'NOT_APPLIED';end if;
 r:=public.rc_billing_begin_v1('cus_r95synthetic','price_synthetic','evt_new');
 if r->>'status' is distinct from 'duplicate' then raise exception 'NOT_DUPLICATE';end if;
 r:=public.rc_billing_test_status_v1(u,'price_synthetic');
 if r->>'tier' is distinct from 'premium' then raise exception 'NO_PREMIUM';end if;
 g:=public.rc_billing_begin_v1('cus_r95synthetic','price_synthetic','evt_collision')->>'generation';
 begin
  perform public.rc_billing_apply_v1('cus_r95synthetic','price_synthetic','evt_collision','customer.subscription.updated',g,'{"empty":true}');
  raise exception 'COLLISION_NOT_REJECTED';
 exception when unique_violation then null;end;
 r:=public.rc_billing_test_status_v1(u,'price_synthetic');
 if r->>'tier' is distinct from 'premium' then raise exception 'PARTIAL_COMMIT';end if;
 g:=public.rc_billing_begin_v1('cus_r95synthetic','price_synthetic','evt_renew')->>'generation';
 snap:=snap||jsonb_build_object('periodEnd',now()+interval '60 days','cancelAtPeriodEnd',true);
 perform public.rc_billing_apply_v1('cus_r95synthetic','price_synthetic','evt_renew','invoice.paid',g,snap);
 r:=public.rc_billing_test_status_v1(u,'price_synthetic');
 if r->>'tier' is distinct from 'premium' or r->>'cancelAtPeriodEnd' is distinct from 'true' then raise exception 'RENEW_CANCEL_SCHEDULE';end if;
end$$;
reset role;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated","is_anonymous":false,"session_id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"}',false);
do $$declare r jsonb;begin
 r:=public.rc_deliver_v1('question','premium1',md5('r95-premium')::uuid);
 if r->>'tier' is distinct from 'premium' or r->>'status' is distinct from 'ok' then raise exception 'R93_ENTITLEMENT';end if;
end$$;
reset role;
set role service_role;
do $$declare g text; r jsonb;begin
 g:=public.rc_billing_begin_v1('cus_r95synthetic','price_synthetic','evt_cancel')->>'generation';
 perform public.rc_billing_apply_v1('cus_r95synthetic','price_synthetic','evt_cancel','customer.subscription.deleted',g,'{"empty":true}');
 r:=public.rc_billing_test_status_v1('99999999-9999-4999-8999-999999999999','price_synthetic');
 if r->>'tier' is distinct from 'free' then raise exception 'CANCEL_NOT_REVOKED';end if;
end$$;
reset role;
set role authenticated;
do $$declare r jsonb;begin
 r:=public.rc_deliver_v1('question','premium1',md5('r95-premium')::uuid);
 if r->>'status' is distinct from 'unavailable' then raise exception 'REPLAY_AFTER_CANCEL';end if;
end$$;
reset role;
select 'R95 disposable SQL checks passed' as result;
