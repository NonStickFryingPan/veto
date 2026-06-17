create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.users(id),
  is_default boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.template_criteria (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.templates(id) on delete cascade,
  name text not null,
  description text,
  sort_order int not null default 0
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  cohort text,
  phase text,
  template_id uuid references public.templates(id),
  status text default 'open' check (status in ('open', 'scoring', 'complete')),
  created_by uuid references public.users(id),
  created_at timestamptz default now()
);

create table if not exists public.session_criteria (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete cascade,
  name text not null,
  description text,
  is_session_specific boolean default false,
  sort_order int not null default 0
);

create table if not exists public.session_judges (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete cascade,
  user_id uuid references public.users(id),
  joined_at timestamptz default now(),
  completed_at timestamptz,
  unique(session_id, user_id)
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete cascade,
  criterion_id uuid references public.session_criteria(id) on delete cascade,
  judge_id uuid references public.users(id),
  score int check (score between 1 and 4),
  updated_at timestamptz default now(),
  unique(session_id, criterion_id, judge_id)
);

alter table public.users enable row level security;
alter table public.templates enable row level security;
alter table public.template_criteria enable row level security;
alter table public.sessions enable row level security;
alter table public.session_criteria enable row level security;
alter table public.session_judges enable row level security;
alter table public.scores enable row level security;

create policy "users_read_all" on public.users for select using (true);
create policy "users_insert_all" on public.users for insert with check (true);
create policy "templates_read_all" on public.templates for select using (true);
create policy "templates_insert_all" on public.templates for insert with check (true);
create policy "templates_update_all" on public.templates for update using (true) with check (true);
create policy "templates_delete_all" on public.templates for delete using (true);
create policy "template_criteria_read_all" on public.template_criteria for select using (true);
create policy "template_criteria_insert_all" on public.template_criteria for insert with check (true);
create policy "template_criteria_update_all" on public.template_criteria for update using (true) with check (true);
create policy "template_criteria_delete_all" on public.template_criteria for delete using (true);
create policy "sessions_read_all" on public.sessions for select using (true);
create policy "sessions_insert_all" on public.sessions for insert with check (true);
create policy "sessions_update_creator" on public.sessions for update using (true) with check (true);
create policy "sessions_delete_all" on public.sessions for delete using (true);
create policy "session_criteria_read_all" on public.session_criteria for select using (true);
create policy "session_criteria_insert_all" on public.session_criteria for insert with check (true);
create policy "session_criteria_update_all" on public.session_criteria for update using (true) with check (true);
create policy "session_criteria_delete_all" on public.session_criteria for delete using (true);
create policy "session_judges_read_all" on public.session_judges for select using (true);
create policy "session_judges_insert_all" on public.session_judges for insert with check (true);
create policy "session_judges_update_all" on public.session_judges for update using (true) with check (true);
create policy "session_judges_delete_all" on public.session_judges for delete using (true);
create policy "scores_read_all" on public.scores for select using (true);
create policy "scores_insert_all" on public.scores for insert with check (true);
create policy "scores_update_all" on public.scores for update using (true) with check (true);
create policy "scores_delete_all" on public.scores for delete using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'scores'
  ) then
    alter publication supabase_realtime add table public.scores;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'session_judges'
  ) then
    alter publication supabase_realtime add table public.session_judges;
  end if;
end $$;
