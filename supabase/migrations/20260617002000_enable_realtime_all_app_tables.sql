do $$
declare
  app_table text;
begin
  foreach app_table in array array[
    'users',
    'templates',
    'template_criteria',
    'sessions',
    'session_criteria',
    'session_judges',
    'scores'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = app_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', app_table);
    end if;
  end loop;
end $$;
