create policy "users_update_all" on public.users for update using (true) with check (true);
create policy "users_delete_all" on public.users for delete using (true);
