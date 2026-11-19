-- R45 READ ONLY: do not mutate rutacap-dev. Verify every boolean and row count.
select
 current_database()='postgres' as correct_database,
 current_setting('server_version_num')::int between 170000 and 179999 as postgres17,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'rc_%' and c.relrowsecurity)=6 as six_rls_tables,
 (select count(*) from pg_policies where schemaname='public' and tablename like 'rc_%')=12 as twelve_policies,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','rc_internal') and p.proname='rc_is_active_session_v1')=0 as r42_not_installed,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='rc_internal' and p.proname in ('rc_grant_progress_sync_consent_v1','rc_revoke_progress_sync_consent_v1') and p.prosecdef and pg_get_userbyid(p.proowner)='postgres')=2 as definer_owners_unchanged,
 has_schema_privilege('authenticated','rc_internal','USAGE') and not has_schema_privilege('anon','rc_internal','USAGE') as internal_schema_acl,
 not has_table_privilege('authenticated','auth.sessions','SELECT') and has_table_privilege('postgres','auth.sessions','SELECT') as auth_sessions_acl,
 (select count(*) from public.rc_student_profiles) as profile_rows,
 (select count(*) from public.rc_question_progress) as progress_rows,
 (select count(*) from public.rc_study_sessions) as study_session_rows,
 (select count(*) from public.rc_progress_events) as event_rows,
 (select count(*) from public.rc_sync_consents) as consent_rows,
 (select count(*) from public.rc_sync_consent_audit) as audit_rows,
 (select md5(string_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||'):'||md5(pg_get_functiondef(p.oid)),'|' order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','rc_internal') and p.proname like 'rc_%') as function_fingerprint,
 (select md5(string_agg(schemaname||'.'||tablename||'.'||policyname||':'||coalesce(qual,'')||':'||coalesce(with_check,''),'|' order by schemaname,tablename,policyname)) from pg_policies where schemaname='public' and tablename like 'rc_%') as policy_fingerprint;
