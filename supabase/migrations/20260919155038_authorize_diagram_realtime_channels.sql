-- Closes the third gap from the RLS security review: subscribeToDiagram's
-- Broadcast channel wasn't private, so anyone holding the (intentionally
-- public) anon key could join `diagram:<id>` and see live cursors/emails or
-- inject forged edits without ever signing in - completely bypassing the
-- Postgres RLS/RPC work in secure_diagram_sharing. Realtime doesn't have
-- the same "can't tell a filtered query from a full scan" problem RLS has:
-- a client must name one topic to join, there's no "list all channels"
-- capability, so a namespace-level check is enough here - it only needs to
-- confirm "this is a diagram channel and you're signed in," matching the
-- same "know the id, be logged in" bar as the RPC path. See STAGE_10.md.
create policy "authenticated read diagram channels" on realtime.messages for select to authenticated using (realtime.topic () like 'diagram:%');

create policy "authenticated write diagram channels" on realtime.messages
for insert
  to authenticated
with
  check (realtime.topic () like 'diagram:%');
