# Diagram Builder — Roadmap

1. **Static canvas, local state** — render loop, pan/zoom, rectangle only, no persistence
2. **Full shape set + grouping (local)** — circle/arrow/label, multi-select, group/ungroup, z-order, undo/redo
3. **Persistence (single-user)** — auth, Postgres schema + RLS, save/load
4. **Realtime transport (naive)** — Supabase Broadcast + Presence, last-write-wins
5. **CRDT integration** — Yjs-backed shared doc, concurrent edit merging
6. **Persistence sync** — CRDT → Postgres snapshotting, correct state on join
7. **Polish** — reconnect handling, group-delete edge cases, presence UI
8. **Documentation** — README with trade-offs, Table of Contents, Known Issues, Design Decisions

Stage detail docs: `STAGE_1.md`, `STAGE_2.md`, ...
