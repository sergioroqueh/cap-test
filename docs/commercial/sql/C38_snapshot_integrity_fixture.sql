-- C38 DISPOSABLE ONLY, after C15/C28/C29/C34/C35/C37. NEVER Supabase real.
-- C37 preflight/source quota and REPEATABLE READ guard stay in place.
-- C38 seals manifest only from ACTUALLY materialized immutable rows.
create table public.rc_c38_fixture_integrity (
  user_id uuid not null,
  snapshot_id uuid not null,
  row_count bigint not null check(row_count>=0),
  byte_count bigint not null check(byte_count>=0),
  digest text not null check(length(digest)=32),
  finished_at timestamptz,
  primary key(user_id,snapshot_id),
  foreign key(user_id,snapshot_id) references public.rc_c34_fixture_snapshots(user_id,snapshot_id) on delete cascade
);
revoke all on public.rc_c38_fixture_integrity from PUBLIC,anon,authenticated,service_role;

-- Keep C37 implementation available only to the trusted fixture.
alter function public.rc_c35_fixture_begin(uuid,uuid,text) rename to rc_c38_fixture_begin_base;
revoke all on function public.rc_c38_fixture_begin_base(uuid,uuid,text) from PUBLIC,anon,authenticated,service_role;

create function public.rc_c35_fixture_begin(
 p_owner uuid,p_snapshot uuid,p_checkpoint text
) returns text language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare result text;
 n bigint; bytes bigint; hash text;
 meta public.rc_c38_fixture_integrity%rowtype;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'C37_ISOLATION_REQUIRED: READ COMMITTED only';
 end if;
 result:=public.rc_c38_fixture_begin_base(p_owner,p_snapshot,p_checkpoint);
 select count(*),coalesce(sum(octet_length(payload::text)),0),
  md5(coalesce(jsonb_agg(jsonb_build_array(stream,ordinal,row_key,payload)
      order by stream,ordinal)::text,'[]'))
 into n,bytes,hash
 from public.rc_c34_fixture_snapshot_rows
 where user_id=p_owner and snapshot_id=p_snapshot;
 if n>3 then raise exception 'C38_MATERIALIZED_ROW_QUOTA'; end if;
 if bytes>2048 then raise exception 'C38_MATERIALIZED_BYTE_QUOTA'; end if;
 if result='created' then
  insert into public.rc_c38_fixture_integrity(user_id,snapshot_id,row_count,byte_count,digest)
  values(p_owner,p_snapshot,n,bytes,hash);
 else
  select * into meta from public.rc_c38_fixture_integrity
  where user_id=p_owner and snapshot_id=p_snapshot;
  if not found or meta.row_count<>n or meta.byte_count<>bytes or meta.digest<>hash
  then raise exception 'C38_INTEGRITY_MISMATCH'; end if;
 end if;
 return result;
end $$;
revoke all on function public.rc_c35_fixture_begin(uuid,uuid,text)
 from PUBLIC,anon,authenticated,service_role;

-- C37 page remains the TTL authority; append stored integrity evidence.
alter function public.rc_c37_fixture_page(uuid,uuid,text,bigint,integer)
 rename to rc_c38_fixture_page_base;
revoke all on function public.rc_c38_fixture_page_base(uuid,uuid,text,bigint,integer)
 from PUBLIC,anon,authenticated,service_role;

create function public.rc_c37_fixture_page(
 p_owner uuid,p_snapshot uuid,p_stream text,p_after bigint,p_limit integer
) returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare page_data jsonb; meta public.rc_c38_fixture_integrity%rowtype;
 n bigint; bytes bigint; hash text;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'C37_ISOLATION_REQUIRED: READ COMMITTED only';
 end if;
 page_data:=public.rc_c38_fixture_page_base(p_owner,p_snapshot,p_stream,p_after,p_limit);
 select * into meta from public.rc_c38_fixture_integrity
 where user_id=p_owner and snapshot_id=p_snapshot;
 if not found then raise exception 'C38_INTEGRITY_MISSING'; end if;
 select count(*),coalesce(sum(octet_length(payload::text)),0),
  md5(coalesce(jsonb_agg(jsonb_build_array(stream,ordinal,row_key,payload)
   order by stream,ordinal)::text,'[]'))
 into n,bytes,hash from public.rc_c34_fixture_snapshot_rows
 where user_id=p_owner and snapshot_id=p_snapshot;
 if n<>meta.row_count or bytes<>meta.byte_count or hash<>meta.digest
 then raise exception 'C38_INTEGRITY_MISMATCH'; end if;
 return page_data || jsonb_build_object(
  'rowCount',meta.row_count,'byteCount',meta.byte_count,'digest',meta.digest);
end $$;
revoke all on function public.rc_c37_fixture_page(uuid,uuid,text,bigint,integer)
 from PUBLIC,anon,authenticated,service_role;

-- Finish is backend-only, idempotent, and cannot certify incomplete/tampered snapshots.
create function public.rc_c38_fixture_finish(
 p_owner uuid,p_snapshot uuid,p_digest text,p_row_count bigint
) returns text language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare meta public.rc_c38_fixture_integrity%rowtype;
 n bigint; bytes bigint; hash text; expiry timestamptz;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'C37_ISOLATION_REQUIRED: READ COMMITTED only';
 end if;
 select expires_at into expiry from public.rc_c34_fixture_snapshots
 where user_id=p_owner and snapshot_id=p_snapshot;
 if not found or expiry<=clock_timestamp() then raise exception 'SNAPSHOT_EXPIRED'; end if;
 select * into meta from public.rc_c38_fixture_integrity
 where user_id=p_owner and snapshot_id=p_snapshot for update;
 if not found then raise exception 'C38_INTEGRITY_MISSING';end if;
 select count(*),coalesce(sum(octet_length(payload::text)),0),
  md5(coalesce(jsonb_agg(jsonb_build_array(stream,ordinal,row_key,payload)
    order by stream,ordinal)::text,'[]'))
 into n,bytes,hash from public.rc_c34_fixture_snapshot_rows
 where user_id=p_owner and snapshot_id=p_snapshot;
 if p_digest is distinct from meta.digest or p_row_count is distinct from meta.row_count
    or n<>meta.row_count or bytes<>meta.byte_count or hash<>meta.digest
 then raise exception 'C38_INTEGRITY_MISMATCH';end if;
 if meta.finished_at is not null then return 'already_finished';end if;
 update public.rc_c38_fixture_integrity set finished_at=clock_timestamp()
 where user_id=p_owner and snapshot_id=p_snapshot;
 return 'finished';
end $$;
revoke all on function public.rc_c38_fixture_finish(uuid,uuid,text,bigint)
 from PUBLIC,anon,authenticated,service_role;
select 'C38 disposable materialized digest/count and finish functions installed' as result;
