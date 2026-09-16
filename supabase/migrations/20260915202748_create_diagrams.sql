create table diagrams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table diagrams enable row level security;

create policy "owner full access" on diagrams for all using (auth.uid () = user_id)
with
  check (auth.uid () = user_id);
