# Stage 10 — Secure Diagram Sharing (RLS/Realtime Hardening)

Not on the original roadmap - this stage exists because a security review of the migrations/RLS turned up two real vulnerabilities in how "anyone with the link" sharing (Stage 4's decision) was actually enforced. `restrict_diagram_update_columns` (already shipped, before this stage) closed a related ownership-hijack bug found in the same review; this stage closes the remaining two.

### Goal

Keep the existing product behavior - a diagram is loadable/editable by anyone who has its link, no invite system - but make the database actually enforce "you must already know this specific diagram's id," instead of granting blanket access to every authenticated user regardless of which row they're asking for.

### The vulnerabilities

1. **Full-table exposure.** `authenticated read`'s `using (auth.role() = 'authenticated')` matches every row for every signed-in user, not just a row whose id the client happens to be filtering on. Since RLS evaluates row-visibility independent of the query's `WHERE` shape, any authenticated client can run an unfiltered `select *` (bypassing the app's own client-side `.eq("user_id", ...)` convenience filter in `listDiagrams`) and dump every user's diagrams.
2. **Blind mass-update.** The same reasoning applies to `authenticated update`: an UPDATE with no `id` filter at all matches (and overwrites) every row the policy allows - i.e. every diagram in the database, in one request.
3. **(separately) Realtime Broadcast has no authorization at all** - `client.channel(\`diagram:${diagramId}\`)` isn't a private channel, so anyone holding the anon key (public by design, shipped in every page load) can join any diagram's live-editing channel without ever signing in, seeing other users' emails via Awareness and injecting forged edits.

### Why this needs more than another RLS tweak

Postgres RLS can't distinguish "the client queried for this one id" from "the client ran a full scan that happens to include this row" - a `USING`/`WITH CHECK` boolean is evaluated per row, blind to how the query was shaped. There is no RLS policy expression that means "only if you already knew this specific id." The only way to make "possession of the id" a real boundary is to stop exposing the table to ad-hoc queries for the shared-access path, and instead force every non-owner access through a function that takes exactly one id as an explicit argument - which can never be satisfied by an unfiltered scan, no matter how the policy is worded.

Realtime doesn't have this problem the same way: a client must name one topic to join, there's no "list all topics" capability exposed to clients, so per-topic authorization (Realtime's private-channel RLS) doesn't reintroduce an enumeration vector the way a raw table policy does.

### Scope

1. **Two `security definer` RPC functions**, callable only by `authenticated`, replacing non-owner table access entirely:
   - `get_shared_diagram(diagram_id uuid)` - returns the one matching row (`id`, `name`, `data`, `crdt_state`, `updated_at`; no `user_id`).
   - `update_shared_diagram(diagram_id uuid, new_data jsonb, new_crdt_state bytea)` - updates only the row matching `diagram_id`; `null` args leave that column untouched (covers both the full "Save" and the `crdt_state`-only autosave).
2. **Drop `authenticated read`/`authenticated update`** and revoke the direct table `update` grant from `restrict_diagram_update_columns` - nothing but the owner (via `auth.uid() = user_id`) touches the table directly anymore; every other reader/writer goes through the RPCs above, including the owner's own normal load/save (one code path, not two).
3. **Wrapper**: `loadDiagram`/`updateDiagram`/`saveDiagramSnapshot` in `diagram-supabase-wrapper` switch from `.from("diagrams")...` to `.rpc("get_shared_diagram"/"update_shared_diagram", ...)`. `listDiagrams`/`saveDiagram`(insert)/`deleteDiagram` are unaffected - those were already correctly owner-scoped and have no enumeration surface.
4. **Realtime Authorization**: `subscribeToDiagram` creates the channel with `{ config: { private: true } }`; a migration adds `select`/`insert` policies on `realtime.messages` scoped to the `diagram:` topic namespace, gated on `authenticated`.

### Decisions made here

- **No new `share_token` column.** `id` is already a `gen_random_uuid()` primary key (122 bits of entropy, already unguessable, already what the "Copy Link" URL embeds) - inventing a second secret would add a column and a migration for no additional security property. The fix is entirely about _how_ the id gets checked (a table scan vs. a function argument), not about needing a fresher secret.
- **RPCs fully replace direct non-owner table access, rather than tightening the existing policies further.** A `SECURITY DEFINER` function's body always does `where id = $1` - there's no way to call it without supplying exactly one id, which is what actually closes the blind-mass-update hole; no RLS wording on the table itself can guarantee that.
- **The owner routes through the same RPCs too, not a separate owner-only update path.** Keeping one code path for "edit a diagram" (used by owner and shared collaborator alike) avoids two update flows silently drifting apart later. Owner-only table access remains for what's inherently owner-scoped: listing "My Diagrams," creating, deleting.
- **Realtime gets a namespace-level policy (`realtime.topic() like 'diagram:%'`), not a per-row join back to `diagrams`.** The security property here comes from Realtime only letting a client join topics it names explicitly (no "list channels" capability), not from checking table membership - so the policy only needs to confirm "this is a diagram channel and you're signed in," matching the same "know the id, be logged in" bar as the RPC path.
- **As-built discovery: `revoke ... from public` alone doesn't lock a new function down.** Supabase provisions each project with a default privilege that auto-grants `EXECUTE` on every newly-created function to `anon` (in addition to the implicit grant every function gets to `PUBLIC`) - so the first version of this migration, which only revoked from `public`, left `get_shared_diagram`/`update_shared_diagram` callable by a client with nothing but the (intentionally public) anon key, no sign-in required. Caught by testing an anon-only call directly rather than assuming the revoke worked; fixed by revoking from `public, anon` explicitly. Worth remembering for any future function on this project.

### Data model

```sql
-- replaces authenticated read/update
create function get_shared_diagram(diagram_id uuid)
returns table (id uuid, name text, data jsonb, crdt_state bytea, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select d.id, d.name, d.data, d.crdt_state, d.updated_at
  from diagrams d where d.id = diagram_id;
$$;

create function update_shared_diagram(diagram_id uuid, new_data jsonb, new_crdt_state bytea)
returns void language plpgsql security definer set search_path = public as $$
begin
  update diagrams
  set data = coalesce(new_data, data), crdt_state = coalesce(new_crdt_state, crdt_state)
  where id = diagram_id;
end;
$$;

revoke all on function get_shared_diagram(uuid) from public;
grant execute on function get_shared_diagram(uuid) to authenticated;
revoke all on function update_shared_diagram(uuid, jsonb, bytea) from public;
grant execute on function update_shared_diagram(uuid, jsonb, bytea) to authenticated;

drop policy "authenticated read" on diagrams;
drop policy "authenticated update" on diagrams;
revoke update on diagrams from authenticated;

-- realtime.messages: private-channel authorization for diagram:* topics
create policy "authenticated read diagram channels" on realtime.messages
  for select to authenticated using (realtime.topic() like 'diagram:%');
create policy "authenticated write diagram channels" on realtime.messages
  for insert to authenticated with check (realtime.topic() like 'diagram:%');
```

### Structure (new/changed files, on top of Stage 1-9's tree)

```
supabase/migrations/
└── ..._secure_diagram_sharing.sql   # new: RPCs, policy drops/adds, realtime.messages policies

diagram-supabase-wrapper/src/
├── diagrams.ts                      # loadDiagram/updateDiagram/saveDiagramSnapshot call .rpc(...) instead of .from("diagrams")
└── realtime.ts                      # subscribeToDiagram: channel(name, { config: { private: true } })

supabase/database.types.ts           # regenerated - RPC functions appear under public.Functions
```

### Tests

- Direct REST/RPC verification (as used for the ownership-hijack fix): a non-owner can still `get_shared_diagram`/`update_shared_diagram` a diagram whose id they have (the sharing feature keeps working); a non-owner's unfiltered `select`/blind `update` against the raw table now returns/affects nothing.
- Real browser: two signed-in users, one owns a diagram and copies its link, the other opens it and edits it live - confirm the collaborative session still works end-to-end after the RPC switch.
- Realtime: an anon-key-only client (no session) attempting to join `diagram:<id>` as a private channel is rejected; an authenticated client still joins and syncs normally.

### Out of scope

- A real collaborator ACL / invite-by-email system (Option A from the review) - deliberately not chosen, see Decisions above.
- Revoking/rotating a diagram's link without changing its id (would need the `share_token` column this stage decided against).
- Rate-limiting the RPCs against brute-force id guessing - not meaningful at 122 bits of entropy.
