# Stage 5 — CRDT Integration

Roadmap item 5: _"CRDT integration — Yjs-backed shared doc, concurrent edit merging."_
Structure and style follow `CLAUDE.md`. Builds on Stage 4's realtime plumbing (a per-diagram Supabase Realtime channel, presence) but **replaces** its shape-sync transport and payload — Stage 4 was explicitly naive/LWW, and this stage is where that gets superseded, not layered on top of.

### Goal

Make concurrent edits to the same diagram merge correctly instead of one clobbering the other. Stage 4 broadcast whole shapes and applied them last-write-wins — if two people moved the same shape at once, one edit silently wins and the other is lost. A Yjs-backed doc merges at the field level, so (for example) one person resizing a shape's `width` and another repositioning its `x` at the same time both survive.

### Scope

- Introduce a `Y.Doc` as the actual source of truth for a diagram's shapes; `canvasStore`'s `shapes` becomes a materialized cache kept in sync via a Yjs observer, not an independently-mutated store
- Every shape mutation (create/move/resize/delete/group/reorder) becomes a Y.Doc transaction instead of a direct zustand `set()`
- Transport: reuse Stage 4's per-diagram Supabase Realtime channel, but broadcast raw Yjs binary updates instead of whole-shape JSON messages
- A client joining while others are already connected reconciles full doc state via Yjs's state-vector sync, not just future changes — this is a real (partial) fix for Stage 4's "known limitation," see Decisions
- Undo/redo rework: replace the hand-rolled local `past`/`future` stacks with `Y.UndoManager`, scoped to local-origin transactions only — this is the rework CLAUDE.md's Performance section flagged as expected once this stage landed
- New workspace package `diagram-crdt-core` (per `CLAUDE.md`'s monorepo naming, which already anticipates this package) holding the Y.Doc schema and pure merge logic, framework- and transport-agnostic

### Decisions made here

- **New `diagram-crdt-core` package owns the Y.Doc schema, not `diagram-front-react` or the wrapper.** Keeps the CRDT data model (how a shape maps to Yjs types) testable in isolation with plain Yjs, no React/Supabase involved — matches the split already established between UI (`diagram-front-react`), Supabase transport (`diagram-supabase-wrapper`), and now CRDT logic (`diagram-crdt-core`).
- **Each shape is a nested `Y.Map`, not a plain object value.** The top-level structure is `Y.Map<string, Y.Map>` (shape id → shape fields), not `Y.Map<string, Shape>`. Nesting is what makes field-level merging possible — a plain-object value in a `Y.Map` is still replaced wholesale on write, which would just be Stage 4's LWW behavior again with extra steps.
- **Zustand's `shapes` becomes a read cache, not a second source of truth.** All existing store actions (`addShape`, `updateShape`, `removeShape`, `groupSelected`, etc.) are rewritten to mutate the Y.Doc; a single Yjs deep-observe callback is what actually calls zustand's `set()` to refresh the cached `shapes` map. This applies to local and remote changes identically — Yjs's own origin-tagging on transactions is what distinguishes "this client caused it" from "a remote update arrived," which is why Stage 4's separate `applyRemoteShape`/`applyRemoteRemoval` code path is no longer needed and gets deleted (see Out of scope / removed).
- **Undo uses `Y.UndoManager`'s origin tracking, not manual snapshots.** `commitHistory()` and the `past`/`future` arrays are removed. `Y.UndoManager` is scoped to the shapes map and configured with `trackedOrigins` set to "this client's local origin" so a remote peer's edits are never undone by pressing Ctrl+Z locally — the actual bug class the CLAUDE.md risk note called out. The existing gesture-boundary call sites in `useCanvasInteraction.ts` (where `commitHistory()` used to fire before a drag starts) switch to `undoManager.stopCapturing()`, preserving "one undo step per gesture" instead of Yjs's default time-based grouping.
- **Transport is a hand-rolled Supabase Broadcast provider, not `y-websocket`/`y-webrtc`.** No separate Yjs server or WebRTC signaling — reuses the same per-diagram channel from Stage 4. On a local doc update (filtered to local origin), the binary update is base64-encoded and broadcast; on receiving one, `Y.applyUpdate(doc, decoded, remoteOrigin)`. On join, the client broadcasts its state vector and any already-connected peer replies with the missing update, so two connected clients converge on full shared history — this is a genuine (partial) fix for Stage 4's "joiner only sees last save" limitation, but only while at least one peer with full history is connected. If nobody is connected, a joiner still only gets what was last saved to Postgres — that gap is still Stage 6's job.
- **Presence stays on Supabase's native Presence API from Stage 4, unchanged.** Only shape data moves to Yjs this stage. Yjs Awareness (the usual pairing for a Yjs doc, and a better fit for ephemeral per-user state like live cursors) is deliberately not adopted yet — revisit when Stage 7 adds live cursors, since a plain "who's online" list doesn't need it.
- **Postgres storage format is unchanged for now.** Save/load still round-trips a plain JSON `{ shapes, viewport }` blob (via `Y.Map.toJSON()`-equivalent serialization of the doc), not a raw Yjs update. Switching persistence to a CRDT-native format is Stage 6's "snapshotting" problem, not this stage's — conflating the two would blur what each stage actually proves.

### Data model

`diagram-crdt-core` defines the shape of the doc, not a database schema (no Postgres changes this stage):

```
Y.Doc
└── shapes: Y.Map<string, Y.Map<string, Json>>   // shape id -> { type, x, y, ..., zIndex, groupId, color }
```

Each field inside a shape's `Y.Map` is a plain JSON-compatible value (numbers/strings/null) — no further nesting needed, since Stage 4's `Shape` fields are all flat scalars already.

### Structure (new/changed files, on top of Stage 1-4's tree)

```
cowire/
├── package.json                         # workspaces gains diagram-crdt-core; build:crdt-core, dev:crdt-core scripts
└── diagram-crdt-core/
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── src/
    │   ├── doc.ts                        # createDiagramDoc(), getShapesMap(doc), shapeToYMap(shape), yMapToShape(yMap)
    │   ├── undo.ts                       # createLocalUndoManager(doc, shapesMap) -> Y.UndoManager scoped to this client's origin
    │   └── index.ts
    └── test/
        └── doc.test.ts                   # two Y.Docs edit different fields of the same shape concurrently, merge, both survive

diagram-supabase-wrapper/src/
└── realtime.ts                           # subscribeToDiagram(client, diagramId, doc, presence, handlers) ->
                                           # DiagramDocConnection ({ channel, disconnect() }) - owns the whole relay: throttled
                                           # local-update broadcast, applying incoming updates, and the state-vector handshake
                                           # on join; presence unchanged from Stage 4

diagram-front-react/src/
├── state/
│   └── canvasStore.ts                    # exports diagramDoc/undoManager alongside useCanvasStore; shapes actions become
│                                          # Y.Doc transactions; past/future + commitHistory/undo/redo removed in favor of
│                                          # the wrapped Y.UndoManager (stopCapturing/undo/redo); applyRemoteShape/
│                                          # applyRemoteRemoval removed - a single observeDeep callback now updates the
│                                          # `shapes` cache for local and remote changes alike
└── hooks/
    └── useDiagramRealtime.ts             # shrank to opening/closing the connection and surfacing presence - all relay
                                           # logic (throttling, apply, sync handshake) now lives in the wrapper, not here
```

### Removed from Stage 4 (superseded, not kept alongside)

- `diagram-front-react/src/lib/diagramSync.ts` and its test — the whole-shape diff approach is replaced by Yjs's own update encoding
- `canvasStore`'s `applyRemoteShape`/`applyRemoteRemoval` actions — folded into the single Yjs-observer-driven update path
- `ShapeChangeMessage` broadcast payload shape in the wrapper — replaced by raw Yjs update bytes

### Tests

- `diagram-crdt-core/test/doc.test.ts`: the concurrent-edit-merge scenario CLAUDE.md's Testing section calls out by name — two `Y.Doc`s start from the same state, diverge (edit different fields of the same shape on each), exchange updates via `Y.encodeStateAsUpdate`/`Y.applyUpdate`, and both fields' edits are present in both docs afterward. Also: a shape created on one doc and merged into the other; a shape deleted on one doc merging correctly into the other.
- Integration-level verification (real two-client sync over the actual local Supabase Realtime channel, not mocked) follows this project's established pattern for realtime work — same as Stage 4's browser-based verification.

### Out of scope

- CRDT-native Postgres persistence / snapshotting, correct state for a joiner when nobody else is connected (Stage 6)
- Yjs Awareness / live cursors, presence colors (Stage 7)
- Reconnect/offline handling (Stage 7)
- Conflict resolution UI (e.g. showing "so-and-so also edited this") — Yjs merges silently; surfacing that to users isn't scoped anywhere yet
