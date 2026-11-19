-- R45 POSTFLIGHT READ ONLY: run only after separately authorized R43 install.
select
 current_setting('server_version_num')::int between 170000 and 179999 as postgres17,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','rc_internal') and p.proname='rc_is_active_session_v1')=2 as both_r42_functions,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='rc_internal' and p.proname='rc_is_active_session_v1' and p.prosecdef and pg_get_userbyid(p.proowner)='postgres')=1 as internal_owner_definer,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rc_is_active_session_v1' and not p.prosecdef)=1 as public_invoker,
 (select count(*) from pg_policies where schemaname='public' and tablename like 'rc_%')=12 as twelve_policies,
 (select count(*) from pg_policies where schemaname='public' and tablename in ('rc_sync_consents','rc_sync_consent_audit') and coalesce(qual,'') like '%rc_is_active_session_v1%')=2 as direct_consent_guards,
 (select count(*) from pg_policies where schemaname='public' and tablename in ('rc_student_profiles','rc_question_progress','rc_study_sessions','rc_progress_events') and (coalesce(qual,'')||' '||coalesce(with_check,'')) like '%rc_has_active_progress_sync_consent_v1%')=10 as progression_guards,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ((n.nspname='rc_internal' and p.proname in ('rc_grant_progress_sync_consent_v1','rc_revoke_progress_sync_consent_v1')) or (n.nspname='public' and p.proname='rc_has_active_progress_sync_consent_v1')) and pg_get_functiondef(p.oid) like '%rc_is_active_session_v1%')=3 as consent_function_guards,
 has_function_privilege('authenticated','public.rc_is_active_session_v1()','EXECUTE') and has_function_privilege('authenticated','rc_internal.rc_is_active_session_v1()','EXECUTE') and not has_function_privilege('anon','public.rc_is_active_session_v1()','EXECUTE') and not has_function_privilege('anon','rc_internal.rc_is_active_session_v1()','EXECUTE') and not has_function_privilege('service_role','public.rc_is_active_session_v1()','EXECUTE') as session_rpc_acl,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'rc_%' and c.relrowsecurity)=6 as six_rls_tables,
 (select count(*) from public.rc_student_profiles) as profile_rows,
 (select count(*) from public.rc_question_progress) as progress_rows,
 (select count(*) from public.rc_study_sessions) as study_session_rows,
 (select count(*) from public.rc_progress_events) as event_rows,
 (select count(*) from public.rc_sync_consents) as consent_rows,
 (select count(*) from public.rc_sync_consent_audit) as audit_rows;
