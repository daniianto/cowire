drop policy "owner full access" on diagrams;

create policy "authenticated read" on diagrams for select using (
  auth.role () = 'authenticated'
);

create policy "authenticated update" on diagrams
for update
  using (auth.role () = 'authenticated')
with
  check (auth.role () = 'authenticated');

create policy "owner insert" on diagrams for insert
with
  check (auth.uid () = user_id);

create policy "owner delete" on diagrams for delete using (auth.uid () = user_id);
