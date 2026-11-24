-- R97 REVIEW DRAFT ONLY. Requires revised R93 and R95; no production execution.
begin;
create table rc_internal.rc_selection_receipts_v1(
 user_id uuid not null,
 madrid_day date not null,
 request_id uuid not null,
 input_digest text not null check(input_digest ~ '^[a-f0-9]{64}$'),
 picks jsonb not null check(jsonb_typeof(picks)='array' and jsonb_array_length(picks) between 1 and 100),
 created_at timestamptz not null default now(),
 primary key(user_id,madrid_day,request_id),
 foreign key(user_id,madrid_day) references rc_internal.rc_quota_daily_v1(user_id,madrid_day) on delete cascade
);
alter table rc_internal.rc_selection_receipts_v1 enable row level security;
revoke all on rc_internal.rc_selection_receipts_v1 from public,anon,authenticated,service_role;

-- Same historical dedup dimensions as examEngine: canonical progress ID and
-- normalized statement. SQL collation parity must be tested on real corpus
-- offline before release. No new scoring rule or editorial transformation.
create function rc_internal.rc_select_stem_v1(p_text text)
returns text language sql immutable strict security invoker set search_path='' as $$
 select btrim(translate(regexp_replace(lower(normalize(p_text,NFKC)), '[[:space:]]+', ' ', 'g'),'¿?¡!.,;:()[]{}',''))
$$;
revoke all on function rc_internal.rc_select_stem_v1(text) from public,anon,authenticated,service_role;

create function rc_internal.rc_deliver_selection_v1(
 p_mode text,p_category text,p_count integer,p_hints jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 ctx jsonb; u uuid; tier text; d date; qcap integer; ecap integer;
 daily rc_internal.rc_quota_daily_v1%rowtype;
 receipt rc_internal.rc_selection_receipts_v1%rowtype;
 inp text; pool jsonb:='[]'; picks jsonb:='[]'; questions jsonb:='[]';
 seen_ids text[]:='{}';seen_stems text[]:='{}';
 r record; pick jsonb; v_q jsonb; qid text; stem text;
 is_exam boolean; desired integer; actual integer:=0;
 replay boolean:=false; status text:='ok'; qleft bigint; eleft bigint;
begin
 if p_mode is null or p_mode not in ('mixed-study','mixed-exam','top100','top3','top4','favorites','errors','review')
 or p_category is null or p_category not in ('mercancias','viajeros')
 or p_count is null or p_count not between 1 and 100 or p_request_id is null
 or p_hints is null or jsonb_typeof(p_hints)<>'object' or octet_length(p_hints::text)>524288 then
  raise exception using errcode='22023',message='SELECTION_INVALID';
 end if;
 is_exam:=p_mode='mixed-exam';
 if (is_exam and p_count<>100) or (p_mode not in ('mixed-study','mixed-exam') and p_category<>'mercancias')
 or (p_mode not in ('favorites','errors','review') and p_hints<>'{}'::jsonb)
 or (select count(*) from jsonb_each(p_hints))>5000
 or exists(select 1 from jsonb_each(p_hints) h where h.key !~ '^[A-Za-z0-9_.:-]{1,200}$'
  or jsonb_typeof(h.value)<>'number' or case when jsonb_typeof(h.value)='number' then abs((h.value::text)::numeric)>1000000 else false end) then
  raise exception using errcode='22023',message='SELECTION_INVALID';
 end if;
 ctx:=rc_internal.rc_delivery_context_v1();
 u:=(ctx->>'uid')::uuid;tier:=ctx->>'tier';d:=(ctx->>'day')::date;
 qcap:=(ctx->>'questionCap')::integer;ecap:=(ctx->>'examCap')::integer;
 inp:=encode(sha256(convert_to(jsonb_build_object('mode',p_mode,'category',p_category,'count',p_count,'hints',p_hints)::text,'UTF8')),'hex');
 -- Lock order: common identity/config/per-user advisory lock, then catalog
 -- shared lock. Publisher must not obtain a user advisory lock while holding
 -- catalog write lock. Prevent retraction/revision race in selection and replay.
 lock table rc_internal.rc_delivery_catalog_v1 in share mode;
 insert into rc_internal.rc_quota_daily_v1(user_id,madrid_day) values(u,d)
 on conflict(user_id,madrid_day) do nothing;
 select * into strict daily from rc_internal.rc_quota_daily_v1 where user_id=u and madrid_day=d for update;
 select * into receipt from rc_internal.rc_selection_receipts_v1 where user_id=u and madrid_day=d and request_id=p_request_id;
 if found then
  if receipt.input_digest is distinct from inp then raise exception using errcode='23505',message='SELECTION_IDEMPOTENCY_CONFLICT';end if;
  picks:=receipt.picks;replay:=true;
 else
  desired:=case when is_exam then 100 when qcap is null then p_count else least(p_count,greatest(0,qcap-daily.questions_used)::integer) end;
  if (is_exam and ecap is not null and daily.exams_used>=ecap) or desired=0 then
   status:='quota_exhausted';
  else
   -- Read only eligible historical question units. Hints are untrusted
   -- personal preferences, never access credentials or authority.
   for r in
    with candidates as (
     select c.content_id,c.revision,c.payload->'questions'->0 as q
     from rc_internal.rc_delivery_catalog_v1 c
     where c.kind='question' and c.publishable
     and (c.minimum_tier='guest' or (c.minimum_tier='free' and tier in ('free','premium')) or (c.minimum_tier='premium' and tier='premium'))
     and jsonb_typeof(c.payload->'questions')='array'
     and case when jsonb_typeof(c.payload->'questions')='array' then jsonb_array_length(c.payload->'questions')=1 else false end
    ), filtered as (
     select *,coalesce(nullif(q->>'progressId',''),q->>'id') as pid,
      case when jsonb_typeof(q->'examFrequency')='number' then (q->>'examFrequency')::numeric else 0 end as freq
     from candidates
     where q->>'id'=content_id and content_id like 'cap:%' and q->>'category'=p_category
     and q->>'examId' is not null and q->>'originalSheetAnswer' in ('A','B','C','D')
     and q->>'correctAnswer' in ('A','B','C','D') and coalesce(q->'scoringEligible','true'::jsonb)='true'::jsonb
     and jsonb_typeof(q->'question')='string' and length(q->>'question')>0
    )
    select * from filtered
    where (p_mode not in ('favorites','errors') or p_hints ? pid)
     and (p_mode<>'top100' or freq>0) and (p_mode<>'top3' or freq>=3) and (p_mode<>'top4' or freq>=4)
    order by case when p_mode in ('top100','top3','top4') then freq end desc nulls last,
      case when p_mode in ('top100','top3','top4') then coalesce(q->>'reviewRequired','false')='true' end asc nulls last,
      case when p_mode in ('top100','top3','top4') then q->>'examId' end desc nulls last,
      case when p_mode='review' then coalesce((p_hints->>pid)::numeric,8) end desc nulls last,
      case when p_mode in ('mixed-study','mixed-exam','favorites','errors') then random() end,
      content_id
   loop
    qid:=r.pid;stem:=rc_internal.rc_select_stem_v1(r.q->>'question');
    if qid is null or stem='' or qid=any(seen_ids) or stem=any(seen_stems) then continue;end if;
    seen_ids:=array_append(seen_ids,qid);seen_stems:=array_append(seen_stems,stem);
    pool:=pool||jsonb_build_array(jsonb_build_object('id',r.content_id,'revision',r.revision));
    if p_mode='top100' and jsonb_array_length(pool)=100 then exit;end if;
    if p_mode not in ('top100','top3','top4') and jsonb_array_length(pool)>=desired then exit;end if;
   end loop;
   if (is_exam or p_mode='top100') and jsonb_array_length(pool)<100 then
    status:='unavailable'; -- never fabricate a full exam or a Top 100
   elsif jsonb_array_length(pool)=0 then status:='unavailable';
   elsif p_mode in ('top100','top3','top4') then
    select coalesce(jsonb_agg(x order by rnd),'[]'::jsonb) into picks from
      (select x,random() rnd from jsonb_array_elements(pool) x order by rnd limit desired) s;
   else picks:=pool;end if;
  end if;
 end if;
 if status='ok' then
  for pick in select value from jsonb_array_elements(picks) loop
   select c.payload->'questions'->0 into v_q from rc_internal.rc_delivery_catalog_v1 c
   where c.kind='question' and c.content_id=pick->>'id' and c.revision=pick->>'revision'
    and c.publishable and (c.minimum_tier='guest' or (c.minimum_tier='free' and tier in ('free','premium')) or (c.minimum_tier='premium' and tier='premium'));
   if not found or v_q is null then
    -- No partial replay of withdrawn/changed/now-forbidden content.
    return jsonb_build_object('status','unavailable');
   end if;
   questions:=questions||jsonb_build_array(v_q);
  end loop;
  actual:=jsonb_array_length(questions);
  if actual<1 or actual>100 or (is_exam and actual<>100) or octet_length(questions::text)>2097152 then
    raise exception 'SELECTION_PAYLOAD_INVALID';
  end if;
  if not replay then
   update rc_internal.rc_quota_daily_v1 set
    questions_used=questions_used+case when is_exam then 0 else actual end,
    exams_used=exams_used+case when is_exam then 1 else 0 end
   where user_id=u and madrid_day=d returning * into daily;
   insert into rc_internal.rc_selection_receipts_v1(user_id,madrid_day,request_id,input_digest,picks) values(u,d,p_request_id,inp,picks);
  end if;
 end if;
 if status='unavailable' then return jsonb_build_object('status','unavailable');end if;
 qleft:=case when qcap is null then null else greatest(0,qcap-daily.questions_used) end;
 eleft:=case when ecap is null then null else greatest(0,ecap-daily.exams_used) end;
 return jsonb_build_object('status',status,'tier',tier,'day',d,'resetAt',rc_internal.rc_quota_reset_v1(d),
  'questionsRemaining',qleft,'examsRemaining',eleft,'replayed',replay,'mode',p_mode,'category',p_category,
  'requestId',p_request_id,'requested',p_count)
  ||case when status='ok' then jsonb_build_object('count',actual,'content',jsonb_build_object('questions',questions)) else '{}'::jsonb end;
end $$;
create function public.rc_deliver_selection_v1(p_mode text,p_category text,p_count integer,p_hints jsonb,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select rc_internal.rc_deliver_selection_v1(p_mode,p_category,p_count,p_hints,p_request_id)
$$;
revoke all on function rc_internal.rc_deliver_selection_v1(text,text,integer,jsonb,uuid),
 public.rc_deliver_selection_v1(text,text,integer,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function rc_internal.rc_deliver_selection_v1(text,text,integer,jsonb,uuid),
 public.rc_deliver_selection_v1(text,text,integer,jsonb,uuid) to authenticated;
commit;
