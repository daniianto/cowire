# Diagram Builder — Roadmap

Performance is a first-class goal: co-op editing must stay fast as shape count and collaborator count grow — hence naive-realtime (4) before CRDT (5) before persistence-sync (6). See `CLAUDE.md`'s Performance section.

1. **Static canvas, local state** — render loop, pan/zoom, rectangle only, no persistence
2. **Full shape set + grouping (local)** — circle/arrow/label, multi-select, group/ungroup, z-order, undo/redo (local-only implementation; expect rework once Stage 5's CRDT lands — undo under concurrent multi-user edits is a known hard problem, see `CLAUDE.md`)
3. **Persistence (single-user)** — auth, Postgres schema + RLS, save/load
4. **Realtime transport (naive)** — Supabase Broadcast + Presence, last-write-wins (first stage with other users in the picture — revisit Stage 3's unverified email sign-up before trusting email ownership for anything like sharing a diagram or password reset)
5. **CRDT integration** — Yjs-backed shared doc, concurrent edit merging
6. **Persistence sync** — CRDT → Postgres snapshotting, correct state on join
7. **Polish** — reconnect handling, group-delete edge cases, presence UI, touch/mobile canvas input
8. **Documentation** — README with trade-offs, Table of Contents, Known Issues, Design Decisions

**CI/Deploy**: GitHub Actions runs lint/format/test on every push, starting Stage 1 — not gated behind a later stage. Hosting target is GitHub Pages (static frontend, Supabase as the external backend); the deploy workflow itself is added once Stage 3 (persistence) makes the app worth shipping.

Stage detail docs: `STAGE_1.md`, `STAGE_2.md`, ...
