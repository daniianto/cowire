# Stage 1 — Static Canvas, Local State

Roadmap item 1: *"Static canvas, local state — render loop, pan/zoom, rectangle only, no persistence."*
Structure and style follow `CLAUDE.md`.

### Goal
Rendering + interaction fundamentals working before any data model complexity.

### Scope
- Canvas render loop
- Pan/zoom
- One shape type: rectangle
- Create / select / move / resize / delete
- Local React state only — no persistence, no backend
- GitHub Actions CI: lint + format check + test on every push (no deploy workflow yet — see `ROADMAP.md`)

### Structure

```
diagram-front-react/            # first workspace package; root package.json gains a "workspaces" array now so later stages (supabase-wrapper, crdt-core) slot in without restructuring
├── src/
│   ├── components/
│   │   ├── Canvas/
│   │   │   └── index.tsx        # render loop, pan/zoom; composes ShapeRenderer + SelectionBox
│   │   ├── ShapeRenderer/
│   │   │   └── index.tsx        # renders a rectangle shape
│   │   ├── SelectionBox/
│   │   │   └── index.tsx
│   │   └── index.ts             # barrel: export * from "./Canvas", etc.
│   ├── hooks/
│   │   └── useCanvasInteraction.ts   # pointer events -> select/move/resize/create/delete
│   ├── state/
│   │   ├── canvasStore.ts       # useCanvasStore (zustand): shapes[], selection, tool mode
│   │   └── index.ts             # barrel
│   ├── lib/
│   │   └── geometry.ts          # hit-testing, bounding box, coord transforms
│   └── main.tsx
└── test/
    └── geometry.test.ts
```

### Data model (local only)

```ts
type Shape = {
  id: string;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};
```

### Tests
- `geometry.test.ts` — hit-testing (point-in-shape), bounding box math, pan/zoom coordinate transform

### Out of scope
Other shape types, groups, persistence, multiplayer, undo/redo, shadcn/ui components (no forms/dialogs needed yet).
