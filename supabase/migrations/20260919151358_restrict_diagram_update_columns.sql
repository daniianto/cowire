-- The "authenticated update" RLS policy (see loosen_diagram_rls_for_sharing)
-- intentionally lets any signed-in user edit a shared diagram's content, but
-- its `using`/`with check` only test `auth.role() = 'authenticated'` -
-- neither references `user_id`, so nothing stopped a client from reassigning
-- a diagram's ownership to itself via a plain UPDATE. Combined with the
-- owner-only DELETE policy, that meant: update user_id to your own uid, then
-- delete - full destroy-any-diagram capability for any authenticated user,
-- not just the ones they were ever given a link to.
--
-- RLS policies can't see "which columns changed", only whether a row
-- passes/fails as a whole - so this needs column-level privileges on top,
-- which combine with RLS (both must pass). Only the columns collaborative
-- editing actually needs stay writable; id/user_id/created_at are never
-- writable by a client again.
revoke update on diagrams
from authenticated;

grant
update (name, data, crdt_state) on diagrams to authenticated;

-- updated_at was never actually written by any code path (no trigger, and
-- the client never set it), so "My Diagrams" has been sorting on a
-- perpetually-stale timestamp since Stage 3. Making it a server-side
-- trigger fixes that and lets it stay out of the client's grant entirely -
-- a client shouldn't be able to backdate/forward-date it anyway.
create or replace function set_diagrams_updated_at () returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger diagrams_set_updated_at before update on diagrams for each row
execute function set_diagrams_updated_at ();
