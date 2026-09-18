# cowire

A collaborative diagram/whiteboard editor: shapes, arrows, and labels on a canvas, synced live between multiple users, backed by a CRDT so concurrent edits merge without conflicts.

Live: [daniianto.github.io/cowire](https://daniianto.github.io/cowire/)

## Table of Contents

- [An experiment in AI-only development](#an-experiment-in-ai-only-development)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Development process](#development-process)
- [Design decisions & trade-offs](#design-decisions--trade-offs)
- [Known issues](#known-issues)

## An experiment in AI-only development

One of the explicit goals of this project was to see how far an app like this could be built using AI tooling alone. Every line of application code, every commit, every migration, and the CI/deploy pipeline were written by [Claude Code](https://claude.com/claude-code) — no code in this repository was hand-written. The human side of the process was product ownership and review: describing a stage's goal in plain language, answering design questions when they came up, testing the result, and asking for changes — never writing or editing source directly.

The project was built stage by stage (see [Development process](#development-process)) specifically to keep this workable: each stage is small enough for the agent to plan, implement, and verify in a real browser before moving on, with conventions (`CLAUDE.md`) written down up front so behavior stayed consistent across an otherwise-stateless series of sessions.

## Features

- Shapes: rectangle, circle, ellipse, triangle, diamond, arrow, line, and text label
- Multi-select, grouping/ungrouping, z-order (bring to front / send to back), undo/redo
- Per-shape fill color and an optional caption label
- Arrows/lines can anchor to another shape's edge and follow it as that shape moves
- A live-updating layer tree (select, reorder, delete, collapsible on narrow screens)
- Real-time multi-user editing: concurrent edits merge via a Yjs CRDT, no last-write-wins data loss
- Live cursors and presence (who else has this diagram open)
- Reconnect handling — a dropped connection catches back up automatically
- Save / Save As, a "My Diagrams" list, and shareable links (`?diagram=<id>`)
- Diagrams persist correctly even if a joining client is the _only_ one connected (CRDT snapshot in Postgres)
- Responsive layout with touch support: pinch-to-zoom, two-finger pan, and an on-screen toolbar for tool switching without a keyboard

## Tech stack

- **Frontend**: React 19, TypeScript (strict), Vite, HTML5 Canvas 2D
- **UI**: Tailwind CSS v4, shadcn/ui, lucide-react icons
- **State**: Zustand (materialized read cache over the CRDT doc, not a second source of truth)
- **Collaboration**: [Yjs](https://yjs.dev/) CRDT for the shared document; a hand-rolled transport over Supabase Realtime Broadcast (no separate Yjs server)
- **Backend**: Supabase — Postgres (with Row Level Security), Auth, Realtime
- **Testing**: Vitest, Playwright (manual/scripted browser verification during development)
- **Tooling**: ESLint (flat config) + Prettier, Husky pre-commit hooks, GitHub Actions CI, GitHub Pages deploy

## Project structure

An npm workspaces monorepo, organized by concern:

```
diagram-front-react/       # the React app: canvas rendering, UI, hooks, zustand stores
diagram-crdt-core/         # framework-agnostic Yjs schema/logic (doc, undo, awareness)
diagram-supabase-wrapper/  # hand-written transport/persistence layer over @supabase/supabase-js
supabase/                  # Supabase CLI project: config.toml, migrations/, generated database.types.ts
```

Within `diagram-front-react`, code is organized by role, not by feature (`components/`, `hooks/`, `state/`, `views/`, `lib/`) — see `CLAUDE.md` for the full convention.

## Getting started

**Prerequisites**: Node 20+, Docker (for the local Supabase stack), the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install

# start a local Supabase stack (Postgres, Auth, Realtime)
cd supabase && supabase start
```

`supabase start` prints a local API URL and anon key, and applies every migration in `supabase/migrations/` automatically. Copy them into `diagram-front-react/.env` (see `diagram-front-react/.env.example`):

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<printed anon key>
```

Then, from the repo root:

```bash
npm run dev:front-react   # dev server at http://localhost:5173
npm test                  # vitest, both diagram-front-react and diagram-crdt-core
npm run lint              # eslint
npm run format            # prettier --write
```

Other useful root scripts: `build:front-react`, `build:wrapper`, `build:crdt-core`, `db:push`/`db:pull`, `gen:types`, `migration` (see `package.json`).

## Development process

Built stage by stage, each with its own plan doc (`STAGE_1.md` … `STAGE_8.md`) covering goal, scope, decisions made, data model changes, and what was explicitly left out. See `ROADMAP.md` for the full sequence and why it's ordered the way it is (performance-sensitive pieces — realtime, then CRDT, then persistence sync — are deliberately staged in that order).

1. Static canvas, local state
2. Full shape set + grouping (local undo/redo)
3. Persistence (single-user): auth, Postgres schema, save/load
4. Realtime transport (naive): Supabase Broadcast + Presence, last-write-wins
5. CRDT integration: Yjs-backed shared doc, concurrent edit merging
6. Persistence sync: CRDT → Postgres snapshotting, correct state for a joining client
7. Polish: reconnect handling, live cursors, touch/mobile input
8. Diagramming features: in-place re-save, layer tree, arrow-to-shape anchoring, per-shape color/label
9. Documentation (this README)

## Design decisions & trade-offs

A few of the more consequential calls made along the way — see the individual `STAGE_N.md` docs for the full reasoning behind each:

- **Yjs CRDT, not a custom merge strategy.** Concurrent shape edits converge automatically; the alternative (Stage 4's naive last-write-wins Broadcast) was kept only long enough to prove the transport worked before Stage 5 replaced the conflict handling underneath it.
- **Zustand is a read cache, never a second source of truth.** Every store action mutates the Yjs doc; a single deep-observe callback is the only thing that refreshes zustand's `shapes` map, for both local and remote changes alike.
- **Transport is hand-rolled over Supabase Realtime Broadcast, not `y-websocket`/`y-webrtc`.** No separate Yjs server or WebRTC signaling — reuses the same per-diagram channel already used for presence/awareness.
- **Sharing is "anyone with the link," not an email invite system.** RLS permits any authenticated user to read/update a diagram if they know its id; only the owner can create or delete their own rows. This sidesteps needing verified email ownership for anything sharing-related.
- **CRDT state persists as one `bytea` snapshot column, not per-shape rows.** Simple to autosave and load; a joining client gets correct state even if it's the only one connected, without needing a custom sync server.
- **Arrow/line-to-shape attachment is resolved at render/hit-test time, not written into the doc.** Recomputing "where on the target shape's edge does this endpoint land" happens in a pure geometry function on every draw, instead of writing a fresh coordinate into the CRDT doc (and broadcasting it) on every frame an attached shape is dragged.
- **Presence and live cursors ride on Yjs Awareness, not Supabase Presence.** Awareness is purpose-built for small, ephemeral, unpersisted per-client state — the same mechanism serves both "who's online" and "where's their cursor," over the same channel as doc updates.
- **An on-screen Toolbar and pinch/pan gestures are additive, not a replacement.** Desktop keyboard shortcuts (R/C/A/L/etc.) still work exactly as before; the toolbar exists because touch devices have no keyboard to press them on.
- **Color/label editing lives in a small Inspector panel, single-selection only.** Consistent with how selection resize handles already only render for one selected shape at a time.
- **The layer tree is a real layout sibling, not an overlay.** An earlier `position: absolute` version silently swallowed pointer events for canvas drags underneath its footprint; giving it real flex layout space (so the canvas is laid out narrower to begin with) fixed that at the root instead of working around it with `pointer-events` tricks.

## Known issues

- **Sign-up email addresses aren't verified** (email confirmation is disabled) — acceptable for the current link-based sharing model, but would need revisiting before any email-based invite/collaborator feature.
- **No coordination between multiple autosaving clients.** Any connected client can autosave; an older write landing after a newer one could in theory regress the stored snapshot. Accepted as a known race at this project's scale.
- **No offline/local-first editing.** Reconnect handling catches a client back up after a dropped connection, but it doesn't queue or replay edits made while actually disconnected.
- **Undo/redo is local and per-client only.** It never affects remote peers and only undoes this client's own edits — by design, but can feel surprising in a fast-moving multi-user session.
- **Triangle/diamond hit-testing uses the true polygon outline, but their arrow-attachment edge point and selection outline use the shape's bounding box as an approximation**, not the exact triangle/diamond outline.
- **No drag-and-drop layer reordering** — the layer tree only supports front/back buttons, not arbitrary reordering.
- **No multi-shape color/label editing** — the Inspector only appears for a single selected shape.
- **No arrow-to-arrow attachment** — arrows/lines can only anchor to rectangle/circle/ellipse/triangle/diamond/label shapes.
- **Resize-handle touch targets aren't enlarged for touch** — same size as the desktop mouse target, since there's no evidence yet it's actually hard to use on a phone.
