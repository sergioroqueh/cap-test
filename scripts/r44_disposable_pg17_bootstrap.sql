-- R44 isolated PostgreSQL 17 audit; NEVER connect to Supabase.
-- Creates a disposable stand-in for auth users/sessions and applies the
-- actual repository C28+C29+R37+R39+R43 SQL sources to verify parsing,
-- grants, RLS and post-logout rejection. Claims are synthetic, NOT real Auth.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
 id uuid primary key,
 deleted_at timestamptz,
 banned_until timestamptz,
 is_anonymous boolean not null default false
);
create table auth.sessions (
 id uuid primary key,
 user_id uuid not null references auth.users(id),
 not_after timestamptz
);
create function auth.jwt() returns jsonb language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.jwt(),auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
insert into auth.sessions(id,user_id,not_after) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',null),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',null);

-- Actual C28/C29/R37/R39/R43 SQL applied separately by workflow.
