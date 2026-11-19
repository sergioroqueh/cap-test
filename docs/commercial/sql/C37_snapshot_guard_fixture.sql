-- C37 disposable-only patch after sequential C35 fixtures. NEVER Supabase.
-- Fail closed on RR/SERIALIZABLE before advisory lock/quota read; no production RPC.
create or replace function public.rc_c35_fixture_begin(
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
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'C37_ISOLATION_REQUIRED: READ COMMITTED only';
 end if;
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


-- Trusted backend reads one immutable page with WALL-CLOCK expiry check.
-- p_owner is NOT client controlled; this function has no web EXECUTE.
create function public.rc_c37_fixture_page(
 p_owner uuid, p_snapshot uuid, p_stream text, p_after bigint, p_limit integer
) returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare
 checkpoint_value text;
 result_rows jsonb;
 expiry_time timestamptz;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'C37_ISOLATION_REQUIRED: READ COMMITTED only';
 end if;
 if p_owner is null or p_snapshot is null or p_stream not in ('events','sessions')
    or p_after is null or p_after < 0 or p_limit not between 1 and 50 then
  raise exception 'BAD_PAGE_REQUEST';
 end if;
 select checkpoint,expires_at into checkpoint_value,expiry_time
 from public.rc_c34_fixture_snapshots
 where user_id=p_owner and snapshot_id=p_snapshot;
 if not found or expiry_time <= clock_timestamp() then
  raise exception 'SNAPSHOT_EXPIRED';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'ordinal', ordinal, 'rowKey',row_key,'payload',payload) order by ordinal),'[]'::jsonb)
 into result_rows
 from (
  select ordinal,row_key,payload
  from public.rc_c34_fixture_snapshot_rows
  where user_id=p_owner and snapshot_id=p_snapshot
    and stream=p_stream and ordinal>p_after
  order by ordinal limit p_limit
 ) page_rows;
 if expiry_time <= clock_timestamp() then
  raise exception 'SNAPSHOT_EXPIRED';
 end if;
 return jsonb_build_object('checkpoint',checkpoint_value,'rows',result_rows);
end $$;
revoke all on function public.rc_c37_fixture_page(uuid,uuid,text,bigint,integer)
 from PUBLIC,anon,authenticated,service_role;
do $$ begin
 if has_function_privilege('authenticated',
 'public.rc_c37_fixture_page(uuid,uuid,text,bigint,integer)','execute')
 then raise exception 'C37 page unexpectedly granted to web'; end if;
end $$;
select 'C37 disposable guard and clock expiry page installed (not deployed)' as result;
