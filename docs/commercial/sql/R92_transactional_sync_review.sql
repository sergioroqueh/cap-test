-- R92 REVIEW DRAFT. NOT a migration; never apply without explicit approval.
-- Preflight: rc_internal not exposed; owner of private functions is a trusted DBA.
-- All writes and reads of journal/session history go through these RPCs.
begin;

create table rc_internal.rc_sync_generation_v1 (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation bigint not null default 0 check (generation >= 0)
);
alter table rc_internal.rc_sync_generation_v1 enable row level security;
revoke all on rc_internal.rc_sync_generation_v1 from public, anon, authenticated;

-- Lock order is session then consent. Existing grant/revoke functions update the
-- same consent row. FOR SHARE on session conflicts with deletion/updates at logout.
-- Locks live only for one request, not across pages. An already committed request
-- cannot be undone by a later logout/revoke.
create function rc_internal.rc_sync_lock_v1(p_revision integer,p_session uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_revision integer;
begin
  if v_uid is null or (auth.jwt()->>'role') is distinct from 'authenticated'
    or (auth.jwt()->>'is_anonymous') is distinct from 'false'
    or p_session is null or (auth.jwt()->>'session_id') is distinct from p_session::text
    or p_revision is null or p_revision < 1 then
    raise exception using errcode='42501', message='SYNC_DENIED';
  end if;
  perform 1 from auth.sessions s
    where s.id=p_session and s.user_id=v_uid
      and (s.not_after is null or s.not_after > clock_timestamp())
    for share;
  if not found then raise exception using errcode='42501', message='SYNC_SESSION_INACTIVE'; end if;
  select c.revision into v_revision from public.rc_sync_consents c
    where c.user_id=v_uid and c.purpose='progress-sync'
      and c.notice_version='progress-sync-v1' and c.granted and c.revoked_at is null
    for update;
  if v_revision is distinct from p_revision then
    raise exception using errcode='42501', message='SYNC_CONSENT_CHANGED';
  end if;
  return v_uid;
end $$;
revoke all on function rc_internal.rc_sync_lock_v1(integer,uuid) from public,anon,authenticated;

create function rc_internal.rc_sync_page_v1(p_revision integer,p_session uuid,
  p_generation text,p_kind text,p_after text,p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_gen bigint; v_rows jsonb; v_next text; v_count integer;
begin
  v_uid := rc_internal.rc_sync_lock_v1(p_revision,p_session);
  if p_kind is null or p_kind not in ('events','sessions') or p_limit is null
     or p_limit < 1 or p_limit > 100
     or (p_after is not null and (length(p_after)<1 or length(p_after)>200))
     or (p_generation is null and p_after is not null) then
    raise exception using errcode='22023', message='SYNC_PAGE_INVALID';
  end if;
  select generation into v_gen from rc_internal.rc_sync_generation_v1 where user_id=v_uid;
  v_gen := coalesce(v_gen,0);
  if p_generation is not null and p_generation is distinct from v_gen::text then
    return jsonb_build_object('status','changed');
  end if;
  if p_kind='events' then
    with candidates as (
      select e.event_id as k,e.payload from public.rc_progress_events e
      where e.user_id=v_uid and (p_after is null or e.event_id > p_after)
      order by e.event_id limit p_limit+1
    ), sized as (
      select *,sum(octet_length(payload::text)+1) over(order by k rows unbounded preceding) as running_bytes,
        row_number() over(order by k) as rn from candidates
    ), page as (select k,payload from sized where rn<=p_limit and running_bytes<=2097152 order by k)
    select coalesce(jsonb_agg(payload order by k),'[]'::jsonb),max(k),
      (select count(*)::integer from candidates) into v_rows,v_next,v_count from page;
  else
    with candidates as (
      select s.session_key as k,s.payload from public.rc_study_sessions s
      where s.user_id=v_uid and (p_after is null or s.session_key > p_after)
      order by s.session_key limit p_limit+1
    ), sized as (
      select *,sum(octet_length(payload::text)+1) over(order by k rows unbounded preceding) as running_bytes,
        row_number() over(order by k) as rn from candidates
    ), page as (select k,payload from sized where rn<=p_limit and running_bytes<=2097152 order by k)
    select coalesce(jsonb_agg(payload order by k),'[]'::jsonb),max(k),
      (select count(*)::integer from candidates) into v_rows,v_next,v_count from page;
  end if;
  if v_count>0 and jsonb_array_length(v_rows)=0 then
    raise exception using errcode='22023',message='SYNC_PAGE_BUDGET';
  end if;
  return jsonb_build_object('status','ok','schemaVersion',2,'userId',v_uid::text,
    'generation',v_gen::text,'kind',p_kind,'records',v_rows,
    'nextCursor',case when v_count>jsonb_array_length(v_rows) then v_next else null end);
end $$;

create function rc_internal.rc_sync_ingest_v1(p_revision integer,p_session uuid,
  p_generation text,p_events jsonb,p_sessions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_gen bigint; v jsonb; v_existing jsonb; v_key text; v_time numeric;
  v_inserted integer := 0;
begin
  v_uid := rc_internal.rc_sync_lock_v1(p_revision,p_session);
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_typeof(p_sessions) is distinct from 'array'
    or p_generation is null then
    raise exception using errcode='22023',message='SYNC_BATCH_INVALID';
  end if;
  if jsonb_array_length(p_events)>25 or jsonb_array_length(p_sessions)>4
    or jsonb_array_length(p_events)+jsonb_array_length(p_sessions)=0
    or octet_length(p_events::text)+octet_length(p_sessions::text)>3000000 then
    raise exception using errcode='22023',message='SYNC_BATCH_LIMIT';
  end if;
  select generation into v_gen from rc_internal.rc_sync_generation_v1 where user_id=v_uid;
  v_gen := coalesce(v_gen,0);
  if p_generation is distinct from v_gen::text then
    return jsonb_build_object('status','changed');
  end if;
  for v in select value from jsonb_array_elements(p_events) loop
    v_key := v->>'eventId';
    if jsonb_typeof(v) is distinct from 'object' or v_key is null or length(v_key) not between 1 and 200
       or jsonb_typeof(v->'eventId') is distinct from 'string'
       or jsonb_typeof(v->'questionId') is distinct from 'string'
       or length(v->>'questionId') not between 1 and 200
       or jsonb_typeof(v->'questionnaireId') is distinct from 'string'
       or length(v->>'questionnaireId') not between 1 and 200
       or jsonb_typeof(v->'deviceId') is distinct from 'string'
       or length(v->>'deviceId') not between 1 and 200
       or jsonb_typeof(v->'clock') is distinct from 'number'
       or jsonb_typeof(v->'occurredAt') is distinct from 'number'
       or v->>'kind' is null or v->>'kind' not in ('answer','favorite','legacy-baseline')
       or octet_length(v::text)>16384 or v ? 'user_id' or v ? 'userId' then
      raise exception using errcode='22023',message='SYNC_EVENT_INVALID';
    end if;
    if (v->>'clock')::numeric not between 1 and 9007199254740991
      or trunc((v->>'clock')::numeric)<>(v->>'clock')::numeric then
      raise exception using errcode='22023',message='SYNC_CLOCK_INVALID';
    end if;
    if (v->>'kind'='answer' and (coalesce(v->>'answer','') not in ('A','B','C','D')
         or jsonb_typeof(v->'correct') is distinct from 'boolean'))
      or (v->>'kind'='favorite' and jsonb_typeof(v->'favorite') is distinct from 'boolean')
      or (v->>'kind'='legacy-baseline' and jsonb_typeof(v->'progress') is distinct from 'object') then
      raise exception using errcode='22023',message='SYNC_EVENT_INVALID';
    end if;
    v_time := (v->>'occurredAt')::numeric;
    if v_time<0 or v_time>253402300799999 or trunc(v_time)<>v_time then
      raise exception using errcode='22023',message='SYNC_TIME_INVALID';
    end if;
    select payload into v_existing from public.rc_progress_events where user_id=v_uid and event_id=v_key;
    if found then
      if v_existing is distinct from v then raise exception using errcode='23505',message='SYNC_EVENT_COLLISION'; end if;
    else
      insert into public.rc_progress_events(user_id,event_id,question_id,payload,occurred_at)
      values(v_uid,v_key,v->>'questionId',v,to_timestamp((v_time/1000)::double precision));
      v_inserted := v_inserted+1;
    end if;
  end loop;
  for v in select value from jsonb_array_elements(p_sessions) loop
    v_key := v->>'clientId';
    if jsonb_typeof(v) is distinct from 'object' or v_key is null or length(v_key) not between 1 and 200
      or jsonb_typeof(v->'clientId') is distinct from 'string'
      or coalesce(v->>'type','') not in ('study','exam')
      or jsonb_typeof(v->'answers') is distinct from 'array'
      or jsonb_typeof(v->'startedAt') is distinct from 'number'
      or jsonb_typeof(v->'completedAt') is distinct from 'number'
      or jsonb_typeof(v->'answered') is distinct from 'number'
      or jsonb_typeof(v->'correct') is distinct from 'number'
      or octet_length(v::text)>524288 or v ? 'id' or v ? 'user_id' or v ? 'userId' then
      raise exception using errcode='22023',message='SYNC_SESSION_INVALID';
    end if;
    v_time := (v->>'completedAt')::numeric;
    if v_time<0 or v_time>253402300799999 or trunc(v_time)<>v_time then
      raise exception using errcode='22023',message='SYNC_TIME_INVALID';
    end if;
    select payload into v_existing from public.rc_study_sessions where user_id=v_uid and session_key=v_key;
    if found then
      if v_existing is distinct from v then raise exception using errcode='23505',message='SYNC_SESSION_COLLISION'; end if;
    else
      insert into public.rc_study_sessions(user_id,session_key,payload,completed_at)
      values(v_uid,v_key,v,to_timestamp((v_time/1000)::double precision));
      v_inserted := v_inserted+1;
    end if;
  end loop;
  if v_inserted>0 then
    insert into rc_internal.rc_sync_generation_v1(user_id,generation) values(v_uid,v_gen+1)
    on conflict(user_id) do update set generation=excluded.generation;
    v_gen := v_gen+1;
  end if;
  return jsonb_build_object('status','ok','userId',v_uid::text,'generation',v_gen::text,'inserted',v_inserted);
end $$;

-- Public wrappers are invoker, privileged code stays in non-exposed rc_internal.
create function public.rc_sync_page_v1(p_revision integer,p_session uuid,p_generation text,
 p_kind text,p_after text,p_limit integer) returns jsonb language sql security invoker set search_path='' as $$
 select rc_internal.rc_sync_page_v1(p_revision,p_session,p_generation,p_kind,p_after,p_limit)
$$;
create function public.rc_sync_ingest_v1(p_revision integer,p_session uuid,p_generation text,
 p_events jsonb,p_sessions jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select rc_internal.rc_sync_ingest_v1(p_revision,p_session,p_generation,p_events,p_sessions)
$$;
revoke all on function rc_internal.rc_sync_page_v1(integer,uuid,text,text,text,integer) from public,anon,authenticated;
revoke all on function rc_internal.rc_sync_ingest_v1(integer,uuid,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.rc_sync_page_v1(integer,uuid,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.rc_sync_ingest_v1(integer,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant usage on schema rc_internal to authenticated;
grant execute on function rc_internal.rc_sync_page_v1(integer,uuid,text,text,text,integer) to authenticated;
grant execute on function rc_internal.rc_sync_ingest_v1(integer,uuid,text,jsonb,jsonb) to authenticated;
grant execute on function public.rc_sync_page_v1(integer,uuid,text,text,text,integer) to authenticated;
grant execute on function public.rc_sync_ingest_v1(integer,uuid,text,jsonb,jsonb) to authenticated;

-- Mandatory: old client write/read routes cannot bypass the generation/session gate.
-- Existing admin/service maintenance must not mutate history without coordinating generation.
revoke all on public.rc_progress_events,public.rc_study_sessions from public,anon,authenticated;
revoke execute on function public.rc_read_consistent_snapshot_v1() from public,anon,authenticated;
revoke execute on function public.rc_read_consistent_snapshot_v2(integer,uuid) from public,anon,authenticated;
commit;
