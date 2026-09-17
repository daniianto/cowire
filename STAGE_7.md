# Stage 7 — Polish

Roadmap item 7: _"Polish — reconnect handling, group-delete edge cases, presence UI, touch/mobile canvas input."_
Structure and style follow `CLAUDE.md`. Four distinct, mostly-independent cleanups on top of Stages 1-6's working (but naive/rough-edged) collaborative editor — no new persistence or CRDT behavior, just closing gaps those stages explicitly deferred here.

### Goal

Every prior stage left a named rough edge "for Stage 7." This stage is that bill coming due: a dropped connection doesn't currently recover cleanly, deleting a multi-shape group isn't atomic, presence is a plain name list, and the whole app is unusable without a keyboard. None of these are new features - they're finishing work on what already exists.

### Scope

- **Reconnect handling**: a client whose realtime connection drops and comes back currently has no idea it missed anything - broadcasts sent while disconnected are simply gone. Detect the reconnect and redo the join handshake; tell the user their connection blipped (`CLAUDE.md`'s UI section names this exact case as a toast, not a silent recovery).
- **Group-delete edge case**: deleting a multi-shape selection currently calls `removeShape` once per shape - N separate transactions/broadcasts instead of one. Make it atomic, matching how group/ungroup/reorder already work.
- **Presence UI**: replace the Stage 4 "list of names" with live cursors and per-user colors, built on Yjs Awareness (deliberately deferred in Stage 5 until there was an actual cursor to justify it).
- **Touch/mobile canvas input**: pinch-to-zoom, two-finger pan, and - the real blocker - an on-screen toolbar, since R/C/A/L keyboard shortcuts don't exist on a touch device at all.

### Decisions made here

- **Reconnect detection watches the channel's own status callback, not a custom heartbeat.** Supabase's Realtime client already reports `SUBSCRIBED` → `CLOSED`/`TIMED_OUT`/`CHANNEL_ERROR` → `SUBSCRIBED` transitions. Rejoining (any `SUBSCRIBED` after the first) re-sends this client's state vector and re-broadcasts its awareness state - anything broadcast by peers during the outage is gone for good (no queueing/replay exists), so re-syncing on reconnect is the only way to catch up, the same mechanism Stage 5 already uses for a fresh join.
- **Toast on disconnect and on reconnect, nothing else.** No banner, no retry button, no connection-quality indicator - `CLAUDE.md` already scoped this exact case to a toast back in Stage 1. Reconnection itself is automatic (the underlying client retries); the toast is purely informational.
- **New `removeManyShapes(doc, ids, origin)` in `diagram-crdt-core`**, mirroring the existing `updateManyShapeFields`. The Delete/Backspace handler switches to it: one transaction, one merged broadcast, one undo step, instead of N of each.
- **Presence and live cursors both ride on Yjs Awareness, replacing Supabase Presence entirely.** Awareness is built for exactly this - small, ephemeral, per-client state (not persisted, not part of the CRDT doc) that's ideal for "where's your cursor" and "who's online" alike, unlike Presence which Stage 4 only reached for because Awareness had no use yet. One Awareness instance per client carries `{ userId, email, color, cursor }`; the "who's here" list and the rendered cursors both read from the same peer states.
- **Cursor color is derived deterministically from `userId`** (hashed into a small fixed palette), not user-chosen and not randomly re-rolled per session - so the same person keeps a stable color across reconnects without needing a database column for it.
- **Cursor broadcasts are throttled the same way doc updates are** (see `CLAUDE.md` Performance section) - never one message per raw `pointermove`.
- **Awareness updates travel over the same per-diagram Supabase Broadcast channel** used for doc updates, not a second channel - one connection per diagram, consistent with every prior stage's transport choice.
- **A minimal on-screen toolbar is added, not a replacement for keyboard shortcuts.** Desktop keeps R/C/A/L etc. exactly as-is; the toolbar (plain shadcn `Button`s, no new dependency) is the _only_ way to switch tools on a touch device, since there's no keyboard to press. This is the toolbar `STAGE_3.md` explicitly deferred "until that's explicitly revisited" - this is that revisit, scoped to tool-switching only, nothing richer (no color pickers, no style panels).
- **Pinch-to-zoom and two-finger pan are handled as a second, parallel gesture path in `useCanvasInteraction`**, keyed off tracking two simultaneous pointers, alongside the existing single-pointer create/move/resize/pan logic - not a rewrite of it.
- **Resize-handle touch target size is left unchanged.** `HANDLE_SIZE` (10px) is a real usability question on a fingertip, but there's no evidence yet it's actually a problem worth a design decision now - revisit if it turns out to be, rather than guessing.

### Data model

No Postgres schema changes this stage - everything here is in-memory (Awareness), transport-level (reconnect handling), or UI (toolbar, cursors).

### Structure (new/changed files, on top of Stage 1-6's tree)

```
diagram-crdt-core/src/
├── awareness.ts                 # createLocalAwareness(doc): Awareness instance; typed setLocalCursor/setLocalUser
│                                 # helpers; getStates() -> other clients' current awareness state
└── doc.ts                       # + removeManyShapes(doc, ids, origin)

diagram-supabase-wrapper/src/
└── realtime.ts                  # relays awareness updates alongside doc updates on the same channel;
                                  # subscribeToDiagram's status callback re-syncs (state vector + awareness)
                                  # on every SUBSCRIBED after the first, and reports connection status changes

diagram-front-react/src/
├── state/
│   └── awareness.ts             # new: a tiny shared holder (setActiveAwareness/getActiveAwareness) so
│                                 # useCanvasInteraction can publish cursor moves without importing
│                                 # useDiagramRealtime - the two hooks don't otherwise know about each other
├── hooks/
│   ├── useDiagramRealtime.ts    # owns the Awareness instance itself (created per join, via state/awareness.ts);
│   │                             # surfaces peer awareness states instead of Supabase presence; toasts on
│   │                             # disconnect/reconnect
│   └── useCanvasInteraction.ts  # + two-pointer pinch-zoom/pan gesture path (reads state/awareness.ts to publish
│                                 # cursor position); Delete handler uses removeShapes -> removeManyShapes
└── components/
    ├── PresenceIndicator/index.tsx  # colored avatars, from awareness state instead of Supabase presence
    ├── RemoteCursors/index.tsx      # new: renders other clients' live cursor positions in their color
    └── Toolbar/index.tsx            # new: on-screen tool-switching buttons (select/rectangle/circle/arrow/label)
```

### Tests

- `diagram-crdt-core`: `removeManyShapes` unit test - several shapes removed in one transaction/undo step.
- Integration, real browser (consistent with every realtime/CRDT stage so far, not mocked): two clients, one moves its pointer, the other renders a live cursor at the corresponding position and color; a simulated connection drop (tear down and recreate the channel, or stop/restart the local Realtime service mid-session) followed by recovery shows the disconnect/reconnect toasts and correctly re-syncs any changes missed during the outage.
- Manual/Playwright touch simulation for pinch-zoom and the toolbar, given both are meaningfully testable via synthetic multi-touch pointer events.

### Out of scope

- Full offline support (editing while disconnected, replaying on reconnect) - reconnect handling here only covers _catching up_, not local-first editing
- Conflict resolution UI (still Yjs merging silently, per Stage 5)
- Any toolbar functionality beyond tool-switching (styling, colors, shape properties panels)
- Enlarging touch targets for resize handles, unless it turns out to actually be a problem
- Documentation (Stage 8)
