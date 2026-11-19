-- C35 BACKEND LIFECYCLE FIXTURE ONLY. Run in a fresh disposable
-- PostgreSQL 17 AFTER C15, C28, C29 and C34 fixtures; NEVER on live Supabase.
-- Tests bounded owner snapshots, safe retries, TTL, source row/byte quotas,
-- backend-only cleanup, and RLS isolation. No production RPC or permissions.
--
-- CRITICAL: "owner" below is a server-side argument from a trusted backend.
-- This function is SECURITY INVOKER and EXECUTE is revoked from web roles.
-- A production endpoint must derive user_id from verified JWT, never client input.

create function public.rc_c35_fixture_begin(
 p_owner uuid, p_snapshot uuid, p_checkpoint text
) returns text
language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare
 existing public.rc_c34_fixture_snapshots%rowtype;
 active_count integer;
 source_count bigint;
 source_bytes bigint;
begin
 if p_owner is null or p_snapshot is null or p_checkpoint is null
    or length(p_checkpoint) not between 1 and 128 then
  raise exception 'BAD_MANIFEST';
 end if;

 -- Serialize snapshots for one owner so parallel begin calls cannot bypass
 -- the active snapshot limit. Advisory locking is a fixture; production
 -- needs robust tenant-level locking and lock timeouts.
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(p_owner::text, 35001)
 );

 select * into existing from public.rc_c34_fixture_snapshots
  where user_id=p_owner and snapshot_id=p_snapshot;
 if found then
  if existing.checkpoint<>p_checkpoint then
   raise exception 'SNAPSHOT_ID_COLLISION';
  end if;
  if existing.expires_at<=now() then
   raise exception 'SNAPSHOT_EXPIRED';
  end if;
  return 'existing'; -- Safe retry cannot duplicate materialized rows.
 end if;

 select count(*) into active_count
  from public.rc_c34_fixture_snapshots
  where user_id=p_owner and expires_at>now();
 if active_count>=2 then raise exception 'ACTIVE_QUOTA';end if;

 select count(*),coalesce(sum(octet_length(payload::text)),0)
  into source_count,source_bytes
  from (
   select payload from public.rc_progress_events where user_id=p_owner
   union all
   select payload from public.rc_study_sessions where user_id=p_owner
  ) source;
 if source_count>3 then raise exception 'ROW_QUOTA';end if;
 if source_bytes>2048 then raise exception 'BYTE_QUOTA';end if;

 insert into public.rc_c34_fixture_snapshots
  (user_id,snapshot_id,checkpoint,expires_at)
 values(p_owner,p_snapshot,p_checkpoint,now()+interval '10 minutes');

 with src as (
  select user_id,'events'::text as stream,event_id as row_key,payload
   from public.rc_progress_events where user_id=p_owner
  union all
  select user_id,'sessions'::text as stream,session_key as row_key,payload
   from public.rc_study_sessions where user_id=p_owner
 ), ordered as (
  select user_id,stream,row_key,payload,
   row_number() over(partition by stream order by row_key) as ordinal
   from src
 )
 insert into public.rc_c34_fixture_snapshot_rows
  (user_id,snapshot_id,stream,ordinal,row_key,payload)
 select user_id,p_snapshot,stream,ordinal,row_key,payload from ordered;

 return 'created';
end $$;

create function public.rc_c35_fixture_cleanup() returns integer
language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare deleted_count integer;
begin
 delete from public.rc_c34_fixture_snapshots where expires_at<=now();
 get diagnostics deleted_count = row_count;
 return deleted_count;
end $$;

revoke all on function public.rc_c35_fixture_begin(uuid,uuid,text)
 from PUBLIC,anon,authenticated,service_role;
revoke all on function public.rc_c35_fixture_cleanup()
 from PUBLIC,anon,authenticated,service_role;

do $$begin
 if has_function_privilege('authenticated',
   'public.rc_c35_fixture_begin(uuid,uuid,text)','execute')
  or has_function_privilege('authenticated',
   'public.rc_c35_fixture_cleanup()','execute')
  or has_function_privilege('anon',
   'public.rc_c35_fixture_begin(uuid,uuid,text)','execute')
 then raise exception 'Web role can invoke privileged lifecycle function';end if;
end $$;

-- The C34 fixture left its A snapshot expired. Backend cleanup removes
-- its manifest and all rows via FK ON DELETE CASCADE.
do $$declare n integer;begin
 n=public.rc_c35_fixture_cleanup();
 if n<>1 then raise exception 'Initial expired snapshot cleanup did not remove one row: %',n;end if;
 if exists(select 1 from public.rc_c34_fixture_snapshot_rows
   where snapshot_id='10000000-0000-4000-8000-000000000034')
 then raise exception 'Cleanup left orphaned rows';end if;
end $$;

-- A has 2 immutable events and 1 completed session in C34.
begin isolation level repeatable read;
do $$begin
 if public.rc_c35_fixture_begin(
  '00000000-0000-4000-8000-000000000001',
  '35000000-0000-4000-8000-000000000001','c35-checkpoint-1')<>'created'
 then raise exception 'A first snapshot not materialized';end if;
end $$;
commit;

-- Idempotent retry returns original rows even if repeated by a backend.
do $$begin
 if public.rc_c35_fixture_begin(
  '00000000-0000-4000-8000-000000000001',
  '35000000-0000-4000-8000-000000000001','c35-checkpoint-1')<>'existing'
 then raise exception 'Idempotent retry not recognized';end if;
 if (select count(*) from public.rc_c34_fixture_snapshot_rows
   where snapshot_id='35000000-0000-4000-8000-000000000001')<>3
 then raise exception 'Retry duplicated/lost snapshot rows';end if;
 begin
  perform public.rc_c35_fixture_begin(
   '00000000-0000-4000-8000-000000000001',
   '35000000-0000-4000-8000-000000000001','divergent-checkpoint');
  raise exception 'Same ID with altered checkpoint accepted';
 exception when others then
  if sqlerrm not like '%SNAPSHOT_ID_COLLISION%' then raise;end if;
 end;
end $$;

select public.rc_c35_fixture_begin(
 '00000000-0000-4000-8000-000000000001',
 '35000000-0000-4000-8000-000000000002','c35-checkpoint-2');

-- A now has exactly two active snapshots. Third begin is rejected.
do $$begin
 begin
  perform public.rc_c35_fixture_begin(
   '00000000-0000-4000-8000-000000000001',
   '35000000-0000-4000-8000-000000000003','c35-checkpoint-3');
  raise exception 'Active snapshot cap incorrectly bypassed';
 exception when others then
  if sqlerrm not like '%ACTIVE_QUOTA%' then raise;end if;
 end;
 if exists(select 1 from public.rc_c34_fixture_snapshots
    where snapshot_id='35000000-0000-4000-8000-000000000003')
 then raise exception 'Quota failure left partial manifest';end if;
end $$;

-- Expire one A snapshot, then cleanup; the other A snapshot survives.
update public.rc_c34_fixture_snapshots
 set expires_at=now()-interval '1 second'
 where snapshot_id='35000000-0000-4000-8000-000000000001';
do $$declare removed integer;begin
 removed=public.rc_c35_fixture_cleanup();
 if removed<>1 then raise exception 'Cleanup must delete one expired manifest';end if;
 if exists(select 1 from public.rc_c34_fixture_snapshot_rows
   where snapshot_id='35000000-0000-4000-8000-000000000001')
 then raise exception 'TTL cleanup did not cascade to pages';end if;
 if (select count(*) from public.rc_c34_fixture_snapshots
   where user_id='00000000-0000-4000-8000-000000000001')<>1
 then raise exception 'Cleanup deleted a valid A snapshot';end if;
end $$;

-- Source grows after A materialization. Older A snapshot stays pinned;
-- any new source count above quota fails before manifest insertion.
set role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims','{"is_anonymous":false}',false);
insert into public.rc_progress_events(user_id,event_id,question_id,payload,occurred_at)
 values(auth.uid(),'fixture-c35-a-e3','c35-a-q3',
 '{"eventId":"fixture-c35-a-e3","questionId":"c35-a-q3","questionnaireId":"cap","deviceId":"synthetic","clock":3,"occurredAt":1763500000003,"kind":"answer","answer":"C","correct":false}',now());
reset role;
do $$begin
 begin
  perform public.rc_c35_fixture_begin(
   '00000000-0000-4000-8000-000000000001',
   '35000000-0000-4000-8000-000000000004','a-now-over-row-quota');
  raise exception 'Source count quota accepted';
 exception when others then
  if sqlerrm not like '%ROW_QUOTA%' then raise;end if;
 end;
 if (select count(*) from public.rc_c34_fixture_snapshot_rows
   where snapshot_id='35000000-0000-4000-8000-000000000002'
    and stream='events')<>2
 then raise exception 'Existing snapshot changed after later source write';end if;
end $$;

-- B gets one large, shape-valid immutable event. It stays below
-- source row count but exceeds BYTE_QUOTA. Backend later deletes only
-- the deliberately synthetic oversized source event for a clean B test.
set role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claims','{"is_anonymous":false}',false);
insert into public.rc_progress_events(user_id,event_id,question_id,payload,occurred_at)
values(auth.uid(),'fixture-c35-b-large','c35-b-q1',
 jsonb_build_object(
 'eventId','fixture-c35-b-large','questionId','c35-b-q1',
 'questionnaireId','cap','deviceId','synthetic',
 'clock',1,'occurredAt',1763500000004::bigint,
 'kind','favorite','favorite',true,'padding',repeat('x',3000)),now());
reset role;
do $$begin
 begin
  perform public.rc_c35_fixture_begin(
   '00000000-0000-4000-8000-000000000002',
   '35000000-0000-4000-8000-000000000005','b-too-many-bytes');
  raise exception 'Byte quota accepted';
 exception when others then
  if sqlerrm not like '%BYTE_QUOTA%' then raise;end if;
 end;
 if exists(select 1 from public.rc_c34_fixture_snapshots
   where snapshot_id='35000000-0000-4000-8000-000000000005')
 then raise exception 'Byte quota left partial manifest';end if;
end $$;

-- Server-only synthetic source cleanup; authenticated clients have no DELETE.
delete from public.rc_progress_events
 where user_id='00000000-0000-4000-8000-000000000002'
 and event_id='fixture-c35-b-large';

-- B's clean materialization and RLS checks. B cannot see A's checkpoint
-- although both users know the UUIDs. No client INSERT/UPDATE/DELETE.
select public.rc_c35_fixture_begin(
 '00000000-0000-4000-8000-000000000002',
 '35000000-0000-4000-8000-000000000006','b-clean');
set role authenticated;
select set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claims','{"is_anonymous":false}',false);
do $$begin
 if (select count(*) from public.rc_c34_fixture_snapshots)<>1
 then raise exception 'B can see A or not see B';end if;
 if exists(select 1 from public.rc_c34_fixture_snapshot_rows
  where user_id='00000000-0000-4000-8000-000000000001')
 then raise exception 'B can see A materialized rows';end if;
 begin
  perform public.rc_c35_fixture_cleanup();
  raise exception 'Authenticated client invoked backend cleanup';
 exception when insufficient_privilege then null;end;
 begin
  perform public.rc_c35_fixture_begin(
   '00000000-0000-4000-8000-000000000001',
   '35000000-0000-4000-8000-000000000007','forged-A');
  raise exception 'Authenticated client invoked backend begin';
 exception when insufficient_privilege then null;end;
end $$;
reset role;

select 'C35 PASS disposable lifecycle: idempotence, active/row/byte quota, TTL cascade, owner isolation, backend ACL' as result;
