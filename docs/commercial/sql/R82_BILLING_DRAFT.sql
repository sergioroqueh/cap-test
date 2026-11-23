-- R82: DRAFT ADDITIVE billing model. Review and apply ONLY to isolated RutaCAP Supabase.
-- Never use in other projects. No edits to CAP scores, answers or existing progress.
begin;
create table public.rc_billing_customers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
 created_at timestamptz not null default now()
);
create table public.rc_billing_subscriptions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 stripe_customer_id text not null references public.rc_billing_customers(stripe_customer_id),
 stripe_subscription_id text not null unique check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
 status text not null check (status in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
 price_id text not null,
 current_period_end timestamptz,
 cancel_at_period_end boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.rc_billing_events (
 stripe_event_id text primary key check (stripe_event_id ~ '^evt_[A-Za-z0-9]+$'),
 event_type text not null,
 livemode boolean not null,
 processed_at timestamptz not null default now()
);
-- These are future server-side policy values, not a claim of enforced public limits.
-- Do NOT enforce quotas on static /data JSON files (clients can download those).
create table public.rc_access_policies (
 tier text primary key check (tier in ('guest','free','premium')),
 daily_question_cap integer check (daily_question_cap is null or daily_question_cap between 1 and 100000),
 daily_exam_cap integer check (daily_exam_cap is null or daily_exam_cap between 1 and 1000),
 cloud_sync boolean not null default false,
 pdf_export boolean not null default false,
 full_archive boolean not null default false
);
insert into public.rc_access_policies(tier,daily_question_cap,daily_exam_cap,cloud_sync,pdf_export,full_archive) values
 ('guest',25,1,false,false,false),
 ('free',100,3,true,false,false),
 ('premium',null,null,true,true,true);
alter table public.rc_billing_customers enable row level security;
alter table public.rc_billing_subscriptions enable row level security;
alter table public.rc_billing_events enable row level security;
alter table public.rc_access_policies enable row level security;
-- The browser is forbidden to write payments, plan grants or event receipts.
revoke all on public.rc_billing_customers,public.rc_billing_subscriptions,
 public.rc_billing_events,public.rc_access_policies from PUBLIC,anon,authenticated;
-- Do not rely on default API grants (new Supabase tables can be unexposed).
grant select,insert,update on public.rc_billing_customers,
 public.rc_billing_subscriptions,public.rc_billing_events to service_role;
grant select on public.rc_access_policies to service_role;
grant select (user_id,status,current_period_end,cancel_at_period_end)
 on public.rc_billing_subscriptions to authenticated;
create policy rc_billing_subscription_self on public.rc_billing_subscriptions
 for select to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous')='false');
-- Internal service role reads/writes billing. No PUBLIC SECURITY DEFINER functions.
commit;
