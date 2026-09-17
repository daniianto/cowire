# Stage 6 — Persistence Sync

Roadmap item 6: _"Persistence sync — CRDT → Postgres snapshotting, correct state on join."_
Structure and style follow `CLAUDE.md`. Builds directly on Stage 5's `Y.Doc`-backed `canvasStore` and Stage 3's Postgres schema — this stage doesn't add new editing behavior, it closes the durability gap both of those left open.

### Goal

Stage 5 fixed "correct state on join" only for a joiner arriving while at least one other client with full history is still connected (via Yjs's state-vector handshake). If **nobody** is connected, a joiner still only gets whatever was last explicitly saved — and until now, "explicitly saved" means whatever the last person to click Save happened to have, which could be an hour of someone else's un-saved edits away from current. This stage makes Postgres a continuously-refreshed backstop, not just a manual snapshot, so the true "everyone left, then someone comes back" case is finally correct.

### Scope

- Persist the actual CRDT state (a Yjs binary update), not just a derived JSON shape list, so a freshly-loaded doc has real merge history to build on rather than a flattened snapshot
- Periodic autosave while a diagram is actively joined: any connected client can write a fresh snapshot, debounced/throttled so it's not one write per edit
- A final flush save on disconnect (best-effort, not guaranteed - see Out of scope) so the most common case ("last person closes the tab") is covered promptly rather than waiting for the next interval tick
- Backward compatibility: diagrams saved before this stage have no CRDT snapshot yet - loading falls back to the existing JSON shape list, and the next autosave populates the snapshot going forward
- `viewport` stays outside the CRDT doc (unchanged from every prior stage - it's per-client, never shared) and keeps round-tripping as plain JSON

### Decisions made here

- **Store the raw Yjs update (`Y.encodeStateAsUpdate`) in a new `bytea` column, not just the materialized JSON.** A flattened `{shapes}` JSON blob (what `data` has held since Stage 3) is enough to _render_ a diagram but throws away Yjs's merge metadata. Loading a real Yjs update into a fresh `Y.Doc` means a client that reconnects later merges correctly with whatever else has happened, the same way two live peers already do in Stage 5 - loading from Postgres becomes just another peer to sync with, not a special case.
- **`data: jsonb` is repurposed to hold only `{ viewport }` going forward.** Shapes are no longer duplicated into it. Existing rows still have a `data.shapes` from before this stage; see the backward-compatibility decision below for how that's handled once, not indefinitely.
- **Backward compatibility is a one-time fallback, not a permanent dual-write.** `loadDiagram` returns both the legacy JSON payload and the (possibly absent) CRDT snapshot. If a snapshot exists, seed the doc from it (`Y.applyUpdate`); if not (a pre-Stage-6 diagram), fall back to `replaceAllShapes` from `data.shapes` exactly as Stage 5 did. The very next autosave writes a real snapshot for that diagram, so this path only ever matters once per old diagram.
- **Autosave is periodic-if-changed, not debounced-per-edit.** A fixed interval (e.g. every 10s) compares the doc's current state vector against the last snapshot written; it only writes when something actually changed. This avoids both "one write per keystroke" (what per-edit debouncing without a cap risks under continuous editing) and indefinite deferral (what a pure debounce risks if edits never stop). Matches `CLAUDE.md`'s batch/debounce guidance for collaborative updates.
- **No coordination between which client autosaves - any of them can, and that's fine.** There's no server component to elect one writer. Multiple connected clients independently running the same periodic check means occasional redundant writes of the same (or very similar) state, which is harmless - Yjs updates are idempotent to apply, and RLS already permits any authenticated collaborator to update the row (Stage 4). The one real risk this accepts - an in-flight older write landing after a newer one and regressing the stored snapshot - is called out explicitly in Out of scope rather than solved here.
- **No RLS changes needed.** The existing Stage 4 "authenticated update" policy already covers writing the new column; RLS in Postgres is row-level, not column-level, here.

### Data model (Postgres)

```sql
alter table diagrams add column crdt_state bytea;
```

Nullable: existing rows have no snapshot until their first post-Stage-6 autosave or save.

### Structure (new/changed files, on top of Stage 1-5's tree)

```
supabase/migrations/
└── <timestamp>_add_diagram_crdt_state.sql

diagram-supabase-wrapper/src/
└── diagrams.ts                     # loadDiagram also returns the optional crdt_state bytes; saveDiagram/updateDiagram
                                     # accept and persist them; data jsonb payload shrinks to { viewport }

diagram-front-react/src/
├── hooks/
│   ├── useDiagrams.ts               # load: applies the CRDT snapshot if present, else falls back to legacy data.shapes
│   └── useDiagramAutosave.ts        # new: periodic if-changed snapshot save while a diagram is joined, plus a
│                                     # best-effort flush on unmount
└── components/
    └── App/index.tsx                # wires useDiagramAutosave alongside useDiagramRealtime, keyed off currentDiagramId
```

### Tests

- Wrapper-level: a `Y.Doc`'s encoded update round-trips through `saveDiagramSnapshot`/`loadDiagramSnapshot` against the real local Supabase instance (bytea in, identical bytes out) - not mocked, consistent with this project's realtime/persistence testing so far.
- Integration-level, the actual point of this stage: client A edits a diagram, an autosave interval fires, then **A fully disconnects** (closes its page/context - not just idles). Client B, joining afterward with no other peer connected, still sees A's edits - proving persistence, not peer-to-peer sync, is what closed the gap this time.
- Backward-compatibility check: a diagram row seeded with only legacy `data.shapes` (no `crdt_state`) still loads correctly, and a subsequent autosave gives it a real snapshot.

### Out of scope

- Resolving out-of-order autosave writes with a proper version/vector-clock check (an older write landing after a newer one can regress the stored snapshot) - accepted as a known race for this naive stage, matching how Stage 4 accepted last-write-wins for live edits
- Guaranteed save-on-disconnect (a crashed tab or lost network can't run cleanup code) - the periodic interval is the real backstop; the unmount flush is just a latency optimization for the clean-close case
- Reconnect/offline handling (Stage 7)
- Any UI showing save status ("saving…", "all changes saved") - not scoped anywhere yet
- Pruning/compacting old Yjs updates (a long-lived doc's encoded state only grows) - not a problem at this project's scale, revisit if it ever becomes one
