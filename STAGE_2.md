# Stage 2 — Full Shape Set + Grouping (Local)

Roadmap item 2: _"Full shape set + grouping (local) — circle/arrow/label, multi-select, group/ungroup, z-order, undo/redo."_
Structure and style follow `CLAUDE.md`. Builds directly on Stage 1's canvas, store, and interaction hook rather than replacing them.

### Goal

Round out the local editing toolset — more shape types, multi-select, grouping, explicit z-order, and undo/redo — before any persistence or collaboration exists. Still local React state only.

### Scope

- Shape types: circle, arrow, label (rectangle already exists from Stage 1)
- Multi-select (shift-click to add/remove from selection; marquee/rubber-band select by dragging empty canvas)
- Group / ungroup selected shapes; moving or selecting one member acts on the whole group
- Explicit z-order: bring-to-front / send-to-back on the selected shape(s) or group
- Undo/redo (local-only — see `CLAUDE.md` Performance section for why this is expected to need rework once Stage 5's CRDT lands)
- Keyboard-hint text updated to cover new shortcuts (no toolbar still — same reasoning as Stage 1)

### Data model changes

`Shape` becomes a discriminated union instead of the rectangle-only type from Stage 1, and gains `zIndex` + `groupId`:

```ts
type BaseShape = {
  id: string;
  zIndex: number;
  groupId: string | null;
  color: string;
};

type RectangleShape = BaseShape & {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
};

type CircleShape = BaseShape & {
  type: "circle";
  x: number;
  y: number;
  radius: number;
};

type ArrowShape = BaseShape & {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type LabelShape = BaseShape & {
  type: "label";
  x: number;
  y: number;
  text: string;
  fontSize: number;
};

type Shape = RectangleShape | CircleShape | ArrowShape | LabelShape;
```

Store changes in `canvasStore.ts`:

- `selectedId: string | null` → `selectedIds: string[]` (multi-select)
- add grouping actions: `groupSelected()`, `ungroupSelected()`
- add z-order actions: `bringToFront(id)`, `sendToBack(id)` (reassign `zIndex`)
- add `undo()` / `redo()` with `past`/`future` snapshot stacks of `{ shapes, selectedIds }` — simplest correct approach for local-only history; not designed to survive CRDT integration

### Structure (changed/new files, on top of Stage 1's tree)

```
src/
├── components/
│   ├── ShapeRenderer/index.tsx     # dispatch per shape.type instead of rectangle-only
│   ├── SelectionBox/index.tsx      # draw per selected shape + a group bounding box when a group is selected
│   ├── Canvas/index.tsx            # draw shapes sorted by zIndex
│   └── KeyboardHint/index.tsx      # add new shortcuts
├── hooks/
│   └── useCanvasInteraction.ts     # per-type create, shift-click + marquee multi-select, group drag, undo/redo + group/ungroup + z-order keys
├── state/
│   └── canvasStore.ts              # selectedIds[], groupId, zIndex, undo/redo stacks
└── lib/
    └── geometry.ts                 # hit-testing/bounding-box per shape type; group bounding box (union of member boxes)
```

### Tests

Extend `geometry.test.ts` (or split by shape type if it gets large — decide when it does, not upfront):

- hit-testing and bounding-box math for circle, arrow, and label (each has different geometry than a rectangle)
- group bounding box (union of member shapes' boxes)
- z-order comparator/sort correctness

### Out of scope

Persistence, multiplayer, touch/mobile input (Stage 7), shadcn/ui components (still no forms/dialogs needed — grouping/z-order/undo are all keyboard-driven).
