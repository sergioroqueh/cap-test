-- R95 REVIEW ONLY. Requires R93 draft. No real migrations or Stripe access.
begin;
-- Legacy customer mappings have unknown mode. Never reuse them in TEST.
alter table public.rc_billing_customers add column stripe_livemode boolean;
create table rc_internal.rc_billing_fence_v1(
 user_id uuid primary key references auth.users(id) on delete cascade,
 generation bigint not null default 0 check(generation>=0)
);
create table rc_internal.rc_checkout_attempt_v1(
 user_id uuid primary key references auth.users(id) on delete cascade,
 attempt_id uuid not null unique,
 expires_epoch bigint not null,
 price_id text not null
);
alter table rc_internal.rc_billing_fence_v1 enable row level security;
alter table rc_internal.rc_checkout_attempt_v1 enable row level security;
revoke all on rc_internal.rc_billing_test_users_v1,rc_internal.rc_billing_fence_v1,rc_internal.rc_checkout_attempt_v1 from public,anon,authenticated,service_role;

-- No LIVE implementation in R95. Only manually allowlisted verified test users.
create function rc_internal.rc_billing_test_check_v1(p_user uuid,p_price text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_user is null or p_price is null or not exists(
   select 1 from rc_internal.rc_quota_config_v1 c
   where c.singleton and c.billing_mode='test' and c.approved_price_id=p_price for share
 ) or not exists(select 1 from rc_internal.rc_billing_test_users_v1 where user_id=p_user for share)
 or not exists(select 1 from auth.users u where u.id=p_user and not u.is_anonymous
    and u.email_confirmed_at is not null and u.deleted_at is null
    and (u.banned_until is null or u.banned_until<=clock_timestamp()) for share) then
  raise exception using errcode='42501',message='BILLING_TEST_DENIED';
 end if;
end $$;
revoke all on function rc_internal.rc_billing_test_check_v1(uuid,text) from public,anon,authenticated,service_role;

create function rc_internal.rc_billing_begin_v1(p_customer text,p_price text,p_event text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; g bigint;
begin
 if p_event is null or p_event !~ '^evt_[A-Za-z0-9]+$' then raise exception 'BILLING_EVENT_INVALID';end if;
 select user_id into u from public.rc_billing_customers where stripe_customer_id=p_customer and stripe_livemode=false;
 if not found then raise exception 'BILLING_CUSTOMER_UNKNOWN';end if;
 perform rc_internal.rc_billing_test_check_v1(u,p_price);
 if exists(select 1 from public.rc_billing_events where stripe_event_id=p_event and livemode=false) then
  return jsonb_build_object('status','duplicate');
 end if;
 insert into rc_internal.rc_billing_fence_v1(user_id,generation) values(u,1)
 on conflict(user_id) do update set generation=rc_billing_fence_v1.generation+1 returning generation into g;
 return jsonb_build_object('status','ok','generation',g::text);
end $$;

-- A newer reconciliation invalidates an earlier provider snapshot, even when
-- webhooks arrive out of order. Receipt and subscription change are atomic.
-- A stale response MUST get HTTP 500 so Stripe retries, not acknowledge it.
create function rc_internal.rc_billing_apply_v1(p_customer text,p_price text,p_event text,
 p_type text,p_generation text,p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; g bigint; st text; sid text; ending timestamptz; cancel boolean;
begin
 if p_event is null or p_event !~ '^evt_[A-Za-z0-9]+$' or p_type is null or length(p_type)>150 then raise exception 'BILLING_EVENT_INVALID';end if;
 select user_id into u from public.rc_billing_customers where stripe_customer_id=p_customer and stripe_livemode=false;
 if not found then raise exception 'BILLING_CUSTOMER_UNKNOWN';end if;
 perform rc_internal.rc_billing_test_check_v1(u,p_price);
 select generation into g from rc_internal.rc_billing_fence_v1 where user_id=u for update;
 if exists(select 1 from public.rc_billing_events where stripe_event_id=p_event and livemode=false) then
   return jsonb_build_object('status','duplicate');
 end if;
 if g is null or g::text is distinct from p_generation then return jsonb_build_object('status','stale');end if;
 if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' then raise exception 'BILLING_SNAPSHOT_INVALID';end if;
 if p_snapshot='{"empty":true}'::jsonb then
  -- No matching subscription currently exists: revoke any prior TEST entitlement.
  update public.rc_billing_subscriptions set status='canceled',current_period_end=null,
   cancel_at_period_end=false,updated_at=clock_timestamp()
   where user_id=u and stripe_livemode=false;
 else
  sid:=p_snapshot->>'id';st:=p_snapshot->>'status';ending:=(p_snapshot->>'periodEnd')::timestamptz;
  cancel:=(p_snapshot->>'cancelAtPeriodEnd')::boolean;
  if sid is null or sid !~ '^sub_[A-Za-z0-9]+$' or st is null or st not in
    ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
    or p_snapshot->>'priceId' is distinct from p_price or p_snapshot->>'customer' is distinct from p_customer
    or p_snapshot->'livemode' is distinct from 'false'::jsonb or cancel is null
    or (st in ('active','trialing') and ending is null) then raise exception 'BILLING_SNAPSHOT_INVALID';end if;
  if exists(select 1 from public.rc_billing_subscriptions where user_id=u and stripe_livemode is distinct from false) then
   raise exception 'BILLING_LEGACY_OR_LIVE_ROW';
  end if;
  insert into public.rc_billing_subscriptions(user_id,stripe_customer_id,stripe_subscription_id,status,price_id,
   current_period_end,cancel_at_period_end,stripe_livemode,updated_at)
  values(u,p_customer,sid,st,p_price,ending,cancel,false,clock_timestamp())
  on conflict(user_id) do update set stripe_customer_id=excluded.stripe_customer_id,
   stripe_subscription_id=excluded.stripe_subscription_id,status=excluded.status,price_id=excluded.price_id,
   current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,
   stripe_livemode=false,updated_at=excluded.updated_at;
 end if;
 insert into public.rc_billing_events(stripe_event_id,event_type,livemode) values(p_event,p_type,false);
 return jsonb_build_object('status','applied');
end $$;

-- Persistent reservation and stable Stripe idempotency key across devices/retries.
-- Checkout expires 60 min after reservation; no new reservation before expiry.
-- If <30 min remain and Stripe never created it, creation may fail: fail closed.
create function rc_internal.rc_checkout_reserve_v1(p_user uuid,p_price text,p_attempt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a rc_internal.rc_checkout_attempt_v1%rowtype; n bigint;
begin
 perform rc_internal.rc_billing_test_check_v1(p_user,p_price);
 if p_attempt is null then raise exception 'CHECKOUT_ATTEMPT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('rutacap-checkout-test-v1:'||p_user::text,0));
 n:=floor(extract(epoch from clock_timestamp()))::bigint;
 select * into a from rc_internal.rc_checkout_attempt_v1 where user_id=p_user for update;
 if found and a.expires_epoch+60>n then
  if a.price_id<>p_price then raise exception 'CHECKOUT_PRICE_CHANGED';end if;
 else
  insert into rc_internal.rc_checkout_attempt_v1(user_id,attempt_id,expires_epoch,price_id)
  values(p_user,p_attempt,n+3600,p_price) on conflict(user_id) do update
   set attempt_id=excluded.attempt_id,expires_epoch=excluded.expires_epoch,price_id=excluded.price_id returning * into a;
 end if;
 return jsonb_build_object('attemptId',a.attempt_id,'expiresAt',a.expires_epoch);
end $$;

create function rc_internal.rc_billing_test_session_v1(p_user uuid,p_price text,p_session uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.sessions where id=p_session and user_id=p_user
  and (not_after is null or not_after>clock_timestamp()) for share) then
  raise exception using errcode='42501',message='BILLING_SESSION_DENIED';
 end if;
 perform rc_internal.rc_billing_test_check_v1(p_user,p_price);
end $$;
create function rc_internal.rc_billing_test_status_v1(p_user uuid,p_price text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.rc_billing_subscriptions%rowtype; active boolean;
begin
 perform rc_internal.rc_billing_test_check_v1(p_user,p_price);
 select * into s from public.rc_billing_subscriptions where user_id=p_user and stripe_livemode=false;
 active:=coalesce(s.status in ('active','trialing') and s.price_id=p_price and s.current_period_end>clock_timestamp(),false);
 return jsonb_build_object('tier',case when active then 'premium' else 'free' end,
   'subscriptionStatus',s.status,'renewalAt',s.current_period_end,'cancelAtPeriodEnd',coalesce(s.cancel_at_period_end,false));
end $$;
create function public.rc_billing_test_authorize_v1(p_user uuid,p_price text,p_session uuid)
returns void language sql security invoker set search_path='' as $$
 select rc_internal.rc_billing_test_session_v1(p_user,p_price,p_session)
$$;
create function public.rc_billing_test_status_v1(p_user uuid,p_price text)
returns jsonb language sql security invoker set search_path='' as $$
 select rc_internal.rc_billing_test_status_v1(p_user,p_price)
$$;
create function public.rc_billing_begin_v1(p_customer text,p_price text,p_event text)
returns jsonb language sql security invoker set search_path='' as $$
 select rc_internal.rc_billing_begin_v1(p_customer,p_price,p_event)
$$;
create function public.rc_billing_apply_v1(p_customer text,p_price text,p_event text,p_type text,p_generation text,p_snapshot jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select rc_internal.rc_billing_apply_v1(p_customer,p_price,p_event,p_type,p_generation,p_snapshot)
$$;
create function public.rc_checkout_reserve_v1(p_user uuid,p_price text,p_attempt uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select rc_internal.rc_checkout_reserve_v1(p_user,p_price,p_attempt)
$$;
revoke all on function public.rc_billing_test_authorize_v1(uuid,text,uuid),public.rc_billing_test_status_v1(uuid,text),
 rc_internal.rc_billing_test_session_v1(uuid,text,uuid),rc_internal.rc_billing_test_status_v1(uuid,text),public.rc_billing_begin_v1(text,text,text),
 public.rc_billing_apply_v1(text,text,text,text,text,jsonb),public.rc_checkout_reserve_v1(uuid,text,uuid),
 rc_internal.rc_billing_begin_v1(text,text,text),rc_internal.rc_billing_apply_v1(text,text,text,text,text,jsonb),
 rc_internal.rc_checkout_reserve_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant usage on schema rc_internal to service_role;
grant execute on function public.rc_billing_test_authorize_v1(uuid,text,uuid),public.rc_billing_test_status_v1(uuid,text),
 rc_internal.rc_billing_test_session_v1(uuid,text,uuid),rc_internal.rc_billing_test_status_v1(uuid,text),public.rc_billing_begin_v1(text,text,text),
 public.rc_billing_apply_v1(text,text,text,text,text,jsonb),public.rc_checkout_reserve_v1(uuid,text,uuid),
 rc_internal.rc_billing_test_check_v1(uuid,text),rc_internal.rc_billing_begin_v1(text,text,text),
 rc_internal.rc_billing_apply_v1(text,text,text,text,text,jsonb),rc_internal.rc_checkout_reserve_v1(uuid,text,uuid) to service_role;
-- Service role is trusted but the Edge runtime may not bypass the atomic write path.
revoke insert,update,delete on public.rc_billing_subscriptions,public.rc_billing_events from service_role;
revoke update,delete on public.rc_billing_customers from service_role;
commit;
