-- R42 DRAFT ONLY. NO APPLY AUTHORIZED for this additional migration.
-- Requires existing R39 internal schema; must be reviewed before dev use.
-- Does NOT expose auth.sessions or auth.users to Data API roles.
begin;
create function rc_internal.rc_is_active_session_v1()
returns boolean language sql stable security definer set search_path = ''
as $r42$
  select (select auth.uid()) is not null
    and (select auth.jwt()->>'role') = 'authenticated'
    and (select auth.jwt()->>'is_anonymous') = 'false'
    and exists (
      select 1 from auth.sessions s
      join auth.users u on u.id = s.user_id
      where s.user_id = (select auth.uid())
        and s.id::text = (select auth.jwt()->>'session_id')
        and (s.not_after is null or s.not_after > statement_timestamp())
        and u.deleted_at is null and not u.is_anonymous
        and (u.banned_until is null or u.banned_until <= statement_timestamp())
    );
$r42$;
create function public.rc_is_active_session_v1()
returns boolean language sql stable security invoker set search_path = ''
as $r42$ select rc_internal.rc_is_active_session_v1(); $r42$;
revoke all on function rc_internal.rc_is_active_session_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.rc_is_active_session_v1()
  from public, anon, authenticated, service_role;
grant execute on function rc_internal.rc_is_active_session_v1()
  to authenticated;
grant execute on function public.rc_is_active_session_v1()
  to authenticated;
comment on function public.rc_is_active_session_v1()
  is 'R42 proposed owner-scoped active session check. Not yet deployed.';
commit;
