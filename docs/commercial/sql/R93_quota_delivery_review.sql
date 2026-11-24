-- R93 REVIEW DRAFT ONLY. Do not apply to any real project without approval.
-- Depends on R85 billing and existing non-exposed rc_internal schema.
begin;

-- Unknown legacy records must never grant Premium. R95 verified webhook will
-- populate this field using Stripe's actual subscription/event mode.
alter table public.rc_billing_subscriptions add column stripe_livemode boolean;
-- Existing table-level service_role writes are trusted; no client write grant.

create table rc_internal.rc_quota_config_v1 (
  singleton boolean primary key default true check(singleton),
  delivery_enabled boolean not null default false,
  guests_enabled boolean not null default false,
  billing_mode text not null default 'off' check(billing_mode in ('off','test','live')),
  approved_price_id text check(approved_price_id ~ '^price_[A-Za-z0-9]+$'),
  check(billing_mode='off' or approved_price_id is not null)
);
insert into rc_internal.rc_quota_config_v1(singleton) values(true);
-- R95: only explicitly allowlisted accounts may receive TEST entitlements.
create table rc_internal.rc_billing_test_users_v1(
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table rc_internal.rc_billing_test_users_v1 enable row level security;
revoke all on rc_internal.rc_billing_test_users_v1 from public,anon,authenticated,service_role;

-- Private delivery catalog. No real corpus loaded by R93. A revision identifies
-- a specific approved payload; publisher MUST change revision on any change.
-- Exam delivery is a single exam unit, not 100 separate question units.
create table rc_internal.rc_delivery_catalog_v1 (
  kind text not null check(kind in ('question','exam')),
  content_id text not null check(content_id ~ '^[A-Za-z0-9_.:-]{1,200}$'),
  revision text not null check(revision ~ '^[A-Za-z0-9_.:-]{1,100}$'),
  minimum_tier text not null check(minimum_tier in ('guest','free','premium')),
  publishable boolean not null default false,
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=2097152),
  primary key(kind,content_id)
);
-- One principal/day across upgrades, devices and question/exam categories.
create table rc_internal.rc_quota_daily_v1 (
  user_id uuid not null references auth.users(id) on delete cascade,
  madrid_day date not null,
  questions_used bigint not null default 0 check(questions_used>=0),
  exams_used bigint not null default 0 check(exams_used>=0),
  primary key(user_id,madrid_day)
);
-- Same key on same day replays only the same kind, id and revision.
-- A later local day starts a new quota window even if the key is reused.
create table rc_internal.rc_quota_receipts_v1 (
  user_id uuid not null,
  madrid_day date not null,
  request_id uuid not null,
  kind text not null check(kind in ('question','exam')),
  content_id text not null,
  revision text not null,
  created_at timestamptz not null default now(),
  primary key(user_id,madrid_day,request_id),
  foreign key(user_id,madrid_day) references rc_internal.rc_quota_daily_v1(user_id,madrid_day) on delete cascade
);
alter table rc_internal.rc_quota_config_v1 enable row level security;
alter table rc_internal.rc_delivery_catalog_v1 enable row level security;
alter table rc_internal.rc_quota_daily_v1 enable row level security;
alter table rc_internal.rc_quota_receipts_v1 enable row level security;
revoke all on rc_internal.rc_quota_config_v1,rc_internal.rc_delivery_catalog_v1,
 rc_internal.rc_quota_daily_v1,rc_internal.rc_quota_receipts_v1 from public,anon,authenticated;

-- Time is server controlled; DST handled by named timezone, not a UTC offset.
create function rc_internal.rc_quota_day_v1(p_now timestamptz)
returns date language sql stable security invoker set search_path='' as $$
 select (p_now at time zone 'Europe/Madrid')::date
$$;
create function rc_internal.rc_quota_reset_v1(p_day date)
returns timestamptz language sql stable security invoker set search_path='' as $$
 select (p_day+1)::timestamp at time zone 'Europe/Madrid'
$$;
revoke all on function rc_internal.rc_quota_day_v1(timestamptz),
 rc_internal.rc_quota_reset_v1(date) from public,anon,authenticated;

-- Private trusted implementation: no caller-controlled user, tier, date, count,
-- price, billing mode, revision or quota override. The returned payload and
-- accounting commit together; any exception rolls the entire statement back.
create function rc_internal.rc_deliver_v1(p_kind text,p_content_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid := auth.uid();
 v_session uuid;
 v_anon boolean;
 v_verified_at timestamptz;
 v_banned timestamptz;
 v_deleted timestamptz;
 v_session_end timestamptz;
 v_now timestamptz;
 v_day date;
 v_tier text;
 v_question_cap integer;
 v_exam_cap integer;
 v_config rc_internal.rc_quota_config_v1%rowtype;
 v_content rc_internal.rc_delivery_catalog_v1%rowtype;
 v_daily rc_internal.rc_quota_daily_v1%rowtype;
 v_receipt rc_internal.rc_quota_receipts_v1%rowtype;
 v_replay boolean:=false;
 v_status text:='ok';
 v_q_left bigint;
 v_e_left bigint;
begin
 if v_uid is null or (auth.jwt()->>'role') is distinct from 'authenticated'
    or coalesce(auth.jwt()->>'is_anonymous','') not in ('true','false')
    or coalesce(auth.jwt()->>'session_id','') !~ '^[0-9a-fA-F-]{36}$' then
   raise exception using errcode='42501',message='DELIVERY_AUTH_REQUIRED';
 end if;
 v_session := (auth.jwt()->>'session_id')::uuid;
 if p_kind is null or p_kind not in ('question','exam') or p_request_id is null
   or p_content_id is null or p_content_id !~ '^[A-Za-z0-9_.:-]{1,200}$' then
   raise exception using errcode='22023',message='DELIVERY_REQUEST_INVALID';
 end if;
 -- Lock principal/session rows; no membership means fail closed. Shared locks
 -- allow concurrent readers but prevent the rows changing during the delivery.
 select s.not_after into v_session_end from auth.sessions s
 where s.id=v_session and s.user_id=v_uid for share;
 if not found then raise exception using errcode='42501',message='DELIVERY_SESSION_INACTIVE';end if;
 select u.is_anonymous,u.email_confirmed_at,u.banned_until,u.deleted_at
 into v_anon,v_verified_at,v_banned,v_deleted from auth.users u where u.id=v_uid for share;
 if not found or v_anon is null or v_anon::text is distinct from auth.jwt()->>'is_anonymous' then
   raise exception using errcode='42501',message='DELIVERY_IDENTITY_DENIED';
 end if;
 -- Per-user lock also serializes rollover and concurrent deliveries on two devices.
 -- The key namespace is specific to R93; hash collisions only add contention.
 perform pg_advisory_xact_lock(hashtextextended('rutacap-quota-v1:'||v_uid::text,0));
 v_now := clock_timestamp();
 if v_deleted is not null or (v_banned is not null and v_banned>v_now)
   or (v_session_end is not null and v_session_end<=v_now)
   or (not v_anon and v_verified_at is null) then
   raise exception using errcode='42501',message='DELIVERY_IDENTITY_DENIED';
 end if;
 select * into v_config from rc_internal.rc_quota_config_v1 where singleton for share;
 if not found or not v_config.delivery_enabled or (v_anon and not v_config.guests_enabled) then
   raise exception using errcode='42501',message='DELIVERY_DISABLED';
 end if;
 v_tier:=case when v_anon then 'guest' else 'free' end;
 if not v_anon and v_config.billing_mode in ('test','live')
 and (v_config.billing_mode='live' or exists(select 1 from rc_internal.rc_billing_test_users_v1 where user_id=v_uid for share)) and exists(
   select 1 from public.rc_billing_subscriptions b
   where b.user_id=v_uid and b.status in ('active','trialing')
   and b.current_period_end>v_now and b.price_id=v_config.approved_price_id
   and b.stripe_livemode=(v_config.billing_mode='live')
   for share
 ) then v_tier:='premium';end if;
 select daily_question_cap,daily_exam_cap into v_question_cap,v_exam_cap
 from public.rc_access_policies where tier=v_tier for share;
 if not found or (v_tier='guest' and (v_question_cap is distinct from 25 or v_exam_cap is distinct from 1))
   or (v_tier='free' and (v_question_cap is distinct from 100 or v_exam_cap is distinct from 3))
   or (v_tier='premium' and (v_question_cap is not null or v_exam_cap is not null)) then
   raise exception using errcode='55000',message='DELIVERY_POLICY_INVALID';
 end if;
 select * into v_content from rc_internal.rc_delivery_catalog_v1
 where kind=p_kind and content_id=p_content_id and publishable for share;
 if not found or (v_content.minimum_tier='premium' and v_tier<>'premium')
   or (v_content.minimum_tier='free' and v_tier='guest') then
   -- No receipt or consumption on unavailable / unlicensed / unauthorized content.
   return jsonb_build_object('status','unavailable');
 end if;
 v_day:=rc_internal.rc_quota_day_v1(v_now);
 insert into rc_internal.rc_quota_daily_v1(user_id,madrid_day) values(v_uid,v_day)
 on conflict(user_id,madrid_day) do nothing;
 select * into strict v_daily from rc_internal.rc_quota_daily_v1
 where user_id=v_uid and madrid_day=v_day for update;
 select * into v_receipt from rc_internal.rc_quota_receipts_v1
 where user_id=v_uid and madrid_day=v_day and request_id=p_request_id;
 if found then
   if v_receipt.kind is distinct from p_kind or v_receipt.content_id is distinct from p_content_id
      or v_receipt.revision is distinct from v_content.revision then
     raise exception using errcode='23505',message='DELIVERY_IDEMPOTENCY_CONFLICT';
   end if;
   v_replay:=true;
 elsif (p_kind='question' and v_question_cap is not null and v_daily.questions_used>=v_question_cap)
     or (p_kind='exam' and v_exam_cap is not null and v_daily.exams_used>=v_exam_cap) then
   v_status:='quota_exhausted';
 else
   update rc_internal.rc_quota_daily_v1 set
     questions_used=questions_used+case when p_kind='question' then 1 else 0 end,
     exams_used=exams_used+case when p_kind='exam' then 1 else 0 end
   where user_id=v_uid and madrid_day=v_day returning * into v_daily;
   insert into rc_internal.rc_quota_receipts_v1(user_id,madrid_day,request_id,kind,content_id,revision)
   values(v_uid,v_day,p_request_id,p_kind,p_content_id,v_content.revision);
 end if;
 v_q_left:=case when v_question_cap is null then null else greatest(0,v_question_cap-v_daily.questions_used) end;
 v_e_left:=case when v_exam_cap is null then null else greatest(0,v_exam_cap-v_daily.exams_used) end;
 return jsonb_build_object('status',v_status,'tier',v_tier,'day',v_day,
    'resetAt',rc_internal.rc_quota_reset_v1(v_day),'questionsRemaining',v_q_left,
    'examsRemaining',v_e_left,'replayed',v_replay)
    || case when v_status='ok' then jsonb_build_object('kind',p_kind,'contentId',p_content_id,
         'revision',v_content.revision,'content',v_content.payload) else '{}'::jsonb end;
end $$;

create function public.rc_deliver_v1(p_kind text,p_content_id text,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select rc_internal.rc_deliver_v1(p_kind,p_content_id,p_request_id)
$$;
revoke all on function rc_internal.rc_deliver_v1(text,text,uuid),
 public.rc_deliver_v1(text,text,uuid) from public,anon,authenticated;
grant usage on schema rc_internal to authenticated;
grant execute on function rc_internal.rc_deliver_v1(text,text,uuid),
 public.rc_deliver_v1(text,text,uuid) to authenticated;
-- Anonymous Auth users use authenticated role; plain anon API key is not identity.
-- Private config stays disabled and catalog empty until separately approved.
commit;
