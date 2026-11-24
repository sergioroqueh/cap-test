-- R98 REVIEW ONLY. Requires deployed R39 consent functions and R92 draft.
-- Run only after approval, and only after the disposable integration passes.
begin;
create function rc_internal.rc_sync_consent_session_v1(p_action text,p_session uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c public.rc_sync_consents%rowtype; rev integer;
begin
 if u is null or auth.jwt()->>'role' is distinct from 'authenticated'
 or auth.jwt()->>'is_anonymous' is distinct from 'false' or p_session is null
 or auth.jwt()->>'session_id' is distinct from p_session::text
 or not exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=u
  and (s.not_after is null or s.not_after>clock_timestamp()) for share)
 or not exists(select 1 from auth.users a where a.id=u and not a.is_anonymous
  and a.email_confirmed_at is not null and a.deleted_at is null
  and (a.banned_until is null or a.banned_until<=clock_timestamp()) for share) then
   raise exception using errcode='42501',message='SYNC_CONSENT_SESSION_DENIED';
 end if;
 if p_action='grant' then rev:=rc_internal.rc_grant_progress_sync_consent_v1('progress-sync-v1');
 elsif p_action='revoke' then rev:=rc_internal.rc_revoke_progress_sync_consent_v1();
 elsif p_action is distinct from 'status' then raise exception using errcode='22023',message='SYNC_CONSENT_ACTION_INVALID';
 end if;
 select * into c from public.rc_sync_consents where user_id=u and purpose='progress-sync' for share;
 return jsonb_build_object('userId',u,'granted',coalesce(c.granted and c.revoked_at is null and c.notice_version='progress-sync-v1',false),
 'revision',c.revision,'noticeVersion','progress-sync-v1');
end $$;
create function public.rc_sync_consent_session_v1(p_action text,p_session uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select rc_internal.rc_sync_consent_session_v1(p_action,p_session)
$$;
revoke all on function rc_internal.rc_sync_consent_session_v1(text,uuid),public.rc_sync_consent_session_v1(text,uuid)
 from public,anon,authenticated,service_role;
grant execute on function rc_internal.rc_sync_consent_session_v1(text,uuid),public.rc_sync_consent_session_v1(text,uuid) to authenticated;
-- Close obsolete grant/revoke APIs; only session-bound entry remains.
revoke execute on function rc_internal.rc_grant_progress_sync_consent_v1(text),rc_internal.rc_revoke_progress_sync_consent_v1(),
 public.rc_grant_progress_sync_consent_v1(text),public.rc_revoke_progress_sync_consent_v1() from public,anon,authenticated,service_role;
commit;
