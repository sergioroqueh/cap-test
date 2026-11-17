-- C34 DISPOSABLE POSTGRES FIXTURE ONLY. NEVER deploy to Supabase.
-- After C15 auth fixture, C28 schema and C29 immutable event ledger.
-- Contract: BACKEND-owned, immutable, per-user snapshot materialization.
-- The client receives a snapshot_id/checkpoint then reads ordered stored pages.
-- This is NOT a production RPC or migration. RLS is tested, not deployed.
create table public.rc_c34_fixture_snapshots (
 user_id uuid not null references auth.users(id) on delete cascade,
 snapshot_id uuid not null,
 checkpoint text not null check(length(checkpoint) between 1 and 128),
 expires_at timestamptz not null,
 primary key(user_id,snapshot_id)
);
create table public.rc_c34_fixture_snapshot_rows (
 user_id uuid not null,
 snapshot_id uuid not null,
 stream text not null check(stream in ('events','sessions')),
 ordinal bigint not null check(ordinal > 0),
 row_key text not null,
 payload jsonb not null,
 primary key(user_id,snapshot_id,stream,ordinal),
 unique(user_id,snapshot_id,stream,row_key),
 foreign key(user_id,snapshot_id)
  references public.rc_c34_fixture_snapshots(user_id,snapshot_id) on delete cascade
);
create index rc_c34_snapshot_page_idx
 on public.rc_c34_fixture_snapshot_rows(user_id,snapshot_id,stream,ordinal);

alter table public.rc_c34_fixture_snapshots enable row level security;
alter table public.rc_c34_fixture_snapshot_rows enable row level security;
revoke all on public.rc_c34_fixture_snapshots,
 public.rc_c34_fixture_snapshot_rows from PUBLIC,anon,authenticated,service_role;
grant select on public.rc_c34_fixture_snapshots,
 public.rc_c34_fixture_snapshot_rows to authenticated;
create policy rc_c34_owner_snapshot on public.rc_c34_fixture_snapshots
 for select to authenticated
 using ((select auth.uid())=user_id
   and (select auth.jwt()->>'is_anonymous')='false'
   and expires_at>now());
create policy rc_c34_owner_rows on public.rc_c34_fixture_snapshot_rows
 for select to authenticated
 using ((select auth.uid())=user_id
   and (select auth.jwt()->>'is_anonymous')='false'
   and exists(
    select 1 from public.rc_c34_fixture_snapshots s
    where s.user_id=rc_c34_fixture_snapshot_rows.user_id
      and s.snapshot_id=rc_c34_fixture_snapshot_rows.snapshot_id
      and s.expires_at>now()
  ));

-- Insert A's source records as an RLS-limited authenticated user.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims','{"is_anonymous":false}',false);
insert into public.rc_progress_events(user_id,event_id,question_id,payload,occurred_at)
values(auth.uid(),'fixture-c34-e1','c34-q1',
'{"eventId":"fixture-c34-e1","questionId":"c34-q1","questionnaireId":"cap","deviceId":"synthetic","clock":1,"occurredAt":1763500000001,"kind":"answer","answer":"A","correct":true}',now());
insert into public.rc_study_sessions(user_id,session_key,payload,completed_at)
values(auth.uid(),'fixture-c34-s1',
'{"clientId":"fixture-c34-s1","type":"exam","answered":1,"correct":1,"answers":[{"questionId":"c34-q1","questionnaireId":"cap","selected":"A","correctAnswer":"A","correct":true}]}',now());
reset role;

-- Server-only fixture: a stable snapshot is copied into protected tables.
-- A real backend must perform this inside one REPEATABLE READ transaction,
-- limited to the JWT owner and with TTL, quotas and cleanup.
begin isolation level repeatable read;
insert into public.rc_c34_fixture_snapshots(user_id,snapshot_id,checkpoint,expires_at)
values('00000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000034',
 'checkpoint-c34-synthetic',now()+interval '30 minutes');

with src as (
 select user_id,'events'::text as stream,event_id as row_key,payload
 from public.rc_progress_events
 where user_id='00000000-0000-4000-8000-000000000001'
 union all
 select user_id,'sessions'::text as stream,session_key as row_key,payload
 from public.rc_study_sessions
 where user_id='00000000-0000-4000-8000-000000000001'
), ordered as (
 select user_id,stream,row_key,payload,
 row_number() over(partition by stream order by row_key) as ordinal from src
)
insert into public.rc_c34_fixture_snapshot_rows(user_id,snapshot_id,stream,ordinal,row_key,payload)
select user_id,'10000000-0000-4000-8000-000000000034',stream,ordinal,row_key,payload
from ordered;
commit;

-- Underlying live store receives NEW events AFTER the pinned snapshot.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims','{"is_anonymous":false}',false);
insert into public.rc_progress_events(user_id,event_id,question_id,payload,occurred_at)
values(auth.uid(),'fixture-c34-e2','c34-q2',
'{"eventId":"fixture-c34-e2","questionId":"c34-q2","questionnaireId":"cap","deviceId":"synthetic","clock":2,"occurredAt":1763500000002,"kind":"answer","answer":"B","correct":false}',now());

do $$begin
 if (select count(*) from public.rc_progress_events)<>2
 then raise exception 'Source event update fixture failed';end if;
 if (select count(*) from public.rc_c34_fixture_snapshot_rows where stream='events')<>1
 then raise exception 'Snapshot absorbed newer source changes';end if;
 if (select count(*) from public.rc_c34_fixture_snapshot_rows where stream='sessions')<>1
 then raise exception 'Session snapshot lost answers';end if;
 if (select jsonb_array_length(payload->'answers') from public.rc_c34_fixture_snapshot_rows where stream='sessions' and ordinal=1)<>1
 then raise exception 'Session payload lost answers';end if;
 if (select row_key from public.rc_c34_fixture_snapshot_rows where stream='events' and ordinal=1)<>'fixture-c34-e1'
 then raise exception 'Ordinal order is unstable';end if;
 begin
  delete from public.rc_c34_fixture_snapshot_rows;
  raise exception 'Client DELETE snapshot rows allowed';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.rc_c34_fixture_snapshot_rows(user_id,snapshot_id,stream,ordinal,row_key,payload)
  values(auth.uid(),'10000000-0000-4000-8000-000000000034','events',3,'forged','{}');
  raise exception 'Client INSERT snapshot rows allowed';
 exception when insufficient_privilege then null;end;
end $$;

-- B can never obtain A's manifest or pages even with leaked snapshotId.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$begin
 if exists(select from public.rc_c34_fixture_snapshots) or
    exists(select from public.rc_c34_fixture_snapshot_rows
      where snapshot_id='10000000-0000-4000-8000-000000000034')
 then raise exception 'Snapshot owner B can see A';end if;
end $$;

-- Anonymous JWT and missing claim must fail closed for both tables.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims','{"is_anonymous":true}',false);
do $$begin
 if exists(select from public.rc_c34_fixture_snapshots) or
    exists(select from public.rc_c34_fixture_snapshot_rows)
 then raise exception 'Anonymous JWT can read snapshot';end if;
end $$;
select set_config('request.jwt.claims','{}',false);
do $$begin
 if exists(select from public.rc_c34_fixture_snapshot_rows)
 then raise exception 'Missing claim opens snapshot';end if;
end $$;
reset role;
set role anon;
do $$begin
 begin perform * from public.rc_c34_fixture_snapshots;
  raise exception 'anon can read manifest';
 exception when insufficient_privilege then null;end;
 begin perform * from public.rc_c34_fixture_snapshot_rows;
  raise exception 'anon can read rows';
 exception when insufficient_privilege then null;end;
end $$;
reset role;

-- Expiration must invalidate existing pages. Maintenance remains backend-only.
update public.rc_c34_fixture_snapshots
 set expires_at=now()-interval '1 second'
 where snapshot_id='10000000-0000-4000-8000-000000000034';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims','{"is_anonymous":false}',false);
do $$begin
 if exists(select from public.rc_c34_fixture_snapshots) or
    exists(select from public.rc_c34_fixture_snapshot_rows)
 then raise exception 'Expired checkpoint is still readable';end if;
end $$;
reset role;
select 'C34 pinned snapshot fixture: MVCC isolation, A/B, anon, expiry and read-only PASS' as result;
