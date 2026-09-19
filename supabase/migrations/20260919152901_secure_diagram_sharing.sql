-- Closes the two vulnerabilities found in the RLS security review that
-- restrict_diagram_update_columns didn't cover: "authenticated read"/
-- "authenticated update" matched every row for every signed-in user, not
-- just a row whose id the client was actually asking for - so an
-- unfiltered select dumped every diagram in the database, and an
-- unfiltered update overwrote every diagram in one request. RLS can't
-- express "only if you already knew this specific id" (a USING/WITH CHECK
-- boolean is evaluated per row, blind to how the query was shaped) - the
-- only way to make "possession of the id" a real boundary is to force
-- non-owner access through a function that takes exactly one id as an
-- explicit argument. See STAGE_10.md for the full reasoning.
create function get_shared_diagram (diagram_id uuid) returns table (
  id uuid,
  name text,
  data jsonb,
  crdt_state bytea,
  updated_at timestamptz
) language sql security definer
set
  search_path = public as $$
  select d.id, d.name, d.data, d.crdt_state, d.updated_at
  from diagrams d
  where d.id = diagram_id;
$$;

create function update_shared_diagram (
  diagram_id uuid,
  new_data jsonb,
  new_crdt_state bytea
) returns void language plpgsql security definer
set
  search_path = public as $$
begin
  update diagrams
  set data = coalesce(new_data, data),
      crdt_state = coalesce(new_crdt_state, crdt_state)
  where id = diagram_id;
end;
$$;

-- new functions in this project get an automatic EXECUTE grant to `anon`
-- (a default privilege Supabase sets up per-project) in addition to the
-- implicit PUBLIC grant every function starts with - revoking only from
-- `public` leaves that separate `anon` grant in place, which would let a
-- client with nothing but the (intentionally public) anon key call these
-- without ever signing in. Both revokes are needed.
revoke all on function get_shared_diagram (uuid)
from
  public,
  anon;

grant
execute on function get_shared_diagram (uuid) to authenticated;

revoke all on function update_shared_diagram (uuid, jsonb, bytea)
from
  public,
  anon;

grant
execute on function update_shared_diagram (uuid, jsonb, bytea) to authenticated;

-- non-owner read/write now only happens through the functions above; the
-- owner keeps direct table access for "My Diagrams", create, and delete
drop policy "authenticated read" on diagrams;

drop policy "authenticated update" on diagrams;

revoke update on diagrams
from authenticated;

create policy "owner read" on diagrams for select using (auth.uid () = user_id);
