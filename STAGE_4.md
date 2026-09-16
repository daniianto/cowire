# Stage 4 — Realtime Transport (Naive)

Roadmap item 4: _"Realtime transport (naive) — Supabase Broadcast + Presence, last-write-wins."_
Structure and style follow `CLAUDE.md`. Builds on Stage 3's auth/persistence — a diagram still lives in Postgres and is still saved/loaded the same way; this stage adds a live sync layer on top for whoever currently has it open.

### Goal

Let multiple signed-in users edit the _same_ diagram at the same time, with changes appearing on every connected client in near-real-time. Conflict handling is deliberately naive (last-write-wins, no merging) — that's Stage 5's CRDT problem. This stage is about wiring up Broadcast + Presence correctly and cheaply, not about correctness under concurrent edits.

### Scope

- A diagram can be "joined" for live editing: opening it subscribes to a per-diagram Supabase Realtime channel
- Local shape edits (create/move/resize/delete/group/reorder) are broadcast to everyone else currently on that channel; incoming broadcasts are applied to the local canvas
- Presence: track and show who else currently has the diagram open (minimal — a list of emails/initials, not live cursors; rich presence UI is Stage 7)
- Sharing model: **open access via link/id**, not an email-based invite system — see Decisions below
- Continuous drags are throttled before broadcasting (see `CLAUDE.md` Performance section) — never one message per pointer-move

### Decisions made here

- **Sharing is "anyone with the link," not an email invite.** Loosen RLS so any authenticated user can read/update a diagram if they know its id; only the owner can create/delete their own diagram rows. This sidesteps Stage 3's unverified-email question entirely for now — there's no email lookup involved, just a shared id/URL. The ROADMAP note about revisiting unverified email still applies, but only if/when an actual email-based invite feature gets built, which isn't scoped anywhere yet.
- **`listDiagrams` stays scoped to "my own" via an explicit query filter**, not RLS alone — now that RLS permits any authenticated user to `select` any diagram (needed so a joined collaborator can read it), the wrapper must filter `.eq("user_id", session.user.id)` itself or "My Diagrams" would list every user's diagrams.
- **Join-by-link, no router.** A `?diagram=<id>` URL query param auto-joins on load; a "Copy Link" button builds that URL. Plain `URLSearchParams`, not a router — consistent with Stage 3's no-router decision. `App` holds the one active-diagram id as state; picking from "My Diagrams" and finishing a save both just set that id, and a single effect keyed on it performs the actual load — one code path for "how a diagram becomes active," whether that's a shared link, a list pick, or a fresh save.
- **Broadcast payload is the whole shape, not a diff.** On any change, send `{ type: "shape-upsert", shape }` with the complete current shape record (including its `zIndex`/`groupId`), or `{ type: "shape-remove", id }`. Simpler and correctness-friendly; bandwidth-inefficient, which is fine for a stage CRDT will replace anyway.
- **Remote shapes bypass the normal `addShape` zIndex auto-assignment.** `addShape` deliberately omits `zIndex`/`groupId` and has the store assign them locally (see `CLAUDE.md`) — correct for local creation, wrong for a shape that arrives with a `zIndex` already assigned by whoever created it elsewhere. A new store action (`applyRemoteShape`) upserts the shape exactly as received. Otherwise z-order could silently diverge between clients.
- **Remote-applied changes don't touch local undo history.** Undo stays a local, per-client concept (already flagged as a rough edge in `CLAUDE.md`'s Performance section from Stage 2) — applying an incoming broadcast must not call `commitHistory()` or push onto `past`.

### Known limitation (by design, not a bug)

A client that joins a diagram's channel only receives changes made **after** it joins. If others made unsaved edits before this client connected, it only sees the last explicitly-**saved** state until someone saves again. Getting a joining client the true current live state is Stage 6's "Persistence sync" problem — this stage doesn't solve it.

### Data model (Postgres) — RLS change

```sql
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
```

### Structure (new/changed files, on top of Stage 1-3's tree)

```
diagram-supabase-wrapper/src/
└── realtime.ts                # subscribeToDiagram(client, diagramId, presence, handlers) - presence
                                # is tracked from the start of the join, not added later; also exports
                                # broadcastShapeChange(channel, message) and unsubscribeFromDiagram(channel)

diagram-front-react/src/
├── lib/
│   └── diagramSync.ts         # pure diff: (oldShapes, newShapes) -> upsert/remove messages to broadcast
├── hooks/
│   └── useDiagramRealtime.ts  # joins the channel, applies incoming messages, broadcasts local changes (throttled), tracks presence
├── components/
│   └── PresenceIndicator/index.tsx   # minimal "who's here" list
└── state/
    └── canvasStore.ts         # + applyRemoteShape(shape), applyRemoteRemoval(id) — bypass zIndex assignment and undo history
```

### Tests

- `lib/diagramSync.ts`'s diff function is pure — gets a `geometry.test.ts`-style unit test covering: a new shape produces an upsert, a changed shape produces an upsert with the new data, a removed shape produces a remove message, an unchanged shape produces nothing.

### Out of scope

- Correct conflict merging (Stage 5's CRDT) — last-write-wins only
- Correct state for a client joining mid-session without a recent save (Stage 6)
- Reconnect/offline handling, rich presence UI (live cursors, colors) — both Stage 7 Polish
- An email-based invite/collaborator system — not scoped anywhere yet; link-sharing is the model until (if ever) that's explicitly planned
- Touch/mobile input (Stage 7), shadcn/ui beyond what `PresenceIndicator` needs
