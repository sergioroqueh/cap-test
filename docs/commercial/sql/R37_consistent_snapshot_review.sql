-- R37 REVIEW DRAFT ONLY. DO NOT RUN AGAINST ANY CONNECTED SUPABASE PROJECT.
-- Depends on C28_full_fidelity_schema_draft.sql and C29_event_ledger_draft.sql.
-- SINGLE-STATEMENT snapshot under caller RLS; NOT a migration or deployment.
-- No elevated privilege, no dynamic SQL, no user ID argument, no mutations.
--
-- PostgreSQL STABLE SQL function sees the snapshot of the calling statement.
-- The future service must verify the real JWT + active user consent, keep
-- isolation for every call, and materialize the JSON response before pagination.
-- Hard cap 5,000 rows/resource (returns NULL rather than partial data).
create or replace function public.rc_read_consistent_snapshot_v1()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with principal as materialized (
    select (select auth.uid()) as uid
    where (select auth.uid()) is not null
      and (select auth.jwt()->>'is_anonymous') = 'false'
  ),
  event_rows as materialized (
    select e.event_id, e.payload
    from public.rc_progress_events e
    join principal p on e.user_id = p.uid
    order by e.event_id
    limit 5001
  ),
  session_rows as materialized (
    select s.session_key, s.payload
    from public.rc_study_sessions s
    join principal p on s.user_id = p.uid
    order by s.session_key
    limit 5001
  )
  select case
    when (select count(*) from event_rows) > 5000
      or (select count(*) from session_rows) > 5000
      then null
    else jsonb_build_object(
      'schemaVersion', 1,
      'userId', p.uid::text,
      'events', coalesce(
        (select jsonb_agg(e.payload order by e.event_id) from event_rows e),
        '[]'::jsonb),
      'sessions', coalesce(
        (select jsonb_agg(s.payload order by s.session_key) from session_rows s),
        '[]'::jsonb)
    )
  end
  from principal p;
$$;

-- SECURITY INVOKER means base-table RLS is still enforced.
-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default: revoke it.
revoke all on function public.rc_read_consistent_snapshot_v1()
  from public, anon, authenticated;
grant execute on function public.rc_read_consistent_snapshot_v1()
  to authenticated;

comment on function public.rc_read_consistent_snapshot_v1()
  is 'R37 read-only snapshot proposal. Not authorized for production use.';
