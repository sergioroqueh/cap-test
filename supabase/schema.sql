-- CAP Test 2026 · almacenamiento privado por usuario
-- Ejecutar una sola vez en Supabase > SQL Editor.

create table if not exists public.question_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table if not exists public.study_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  completed_at bigint not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

create index if not exists study_sessions_user_completed_idx
  on public.study_sessions (user_id, completed_at desc);

alter table public.question_progress enable row level security;
alter table public.study_sessions enable row level security;

drop policy if exists "Users manage own progress" on public.question_progress;
create policy "Users manage own progress"
on public.question_progress
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own sessions" on public.study_sessions;
create policy "Users manage own sessions"
on public.study_sessions
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on public.question_progress from anon;
revoke all on public.study_sessions from anon;
grant select, insert, update, delete on public.question_progress to authenticated;
grant select, insert, update, delete on public.study_sessions to authenticated;
