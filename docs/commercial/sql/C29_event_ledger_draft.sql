-- C29 PROPOSAL ONLY. DO NOT APPLY TO rutacap-dev OR ANY OTHER LIVE DB.
-- Companion table for C28 draft. Full-fidelity snapshots alone cannot resolve
-- concurrent offline attempts without losing or double-counting operations.
-- Reviewed as documentation; no workflow invokes this file.
begin;
create table public.rc_progress_events (
 user_id uuid not null references auth.users(id) on delete cascade,
 event_id text not null check(length(event_id) between 1 and 200),
 question_id text not null check(length(question_id) between 1 and 200),
 payload jsonb not null,
 occurred_at timestamptz not null,
 primary key (user_id,event_id),
 constraint rc_event_shape check (
  jsonb_typeof(payload)='object'
  and payload->>'eventId'=event_id
  and payload->>'questionId'=question_id
  and payload->>'kind' in ('answer','favorite','legacy-baseline')
  and jsonb_typeof(payload->'deviceId')='string'
  and jsonb_typeof(payload->'clock')='number'
  and jsonb_typeof(payload->'occurredAt')='number'
  and length(payload::text)<=16384
 )
);
create index rc_progress_events_owner_question_idx on public.rc_progress_events(user_id,question_id);
alter table public.rc_progress_events enable row level security;
revoke all on public.rc_progress_events from PUBLIC,anon,authenticated,service_role;
grant select on public.rc_progress_events to authenticated;
grant insert(user_id,event_id,question_id,payload,occurred_at) on public.rc_progress_events to authenticated;
create policy rc_progress_events_select on public.rc_progress_events for select to authenticated
 using ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous')='false');
create policy rc_progress_events_insert on public.rc_progress_events for insert to authenticated
 with check ((select auth.uid())=user_id and (select auth.jwt()->>'is_anonymous')='false');
-- No UPDATE / DELETE for web clients. Server-owned maintenance needs independent review.
commit;
