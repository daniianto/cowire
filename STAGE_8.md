# Stage 8 — Diagramming Features

Roadmap item 8: _"Diagramming features — re-save an already-saved diagram in place, a layer tree panel, arrows that anchor to a shape's edge and follow it, per-shape color + an optional label property."_
Structure and style follow `CLAUDE.md`. Four independent additions on top of the working collaborative editor from Stages 1-7 - no changes to the realtime/CRDT/persistence machinery itself, just new editing capability built on it.

### Goal

The editor can create, collaborate on, and persist diagrams, but is still missing several things any real diagramming tool needs: saving over an existing diagram instead of always forking a new one, a way to see/manage what's on the canvas beyond what's visible at once, arrows that stay attached to the shapes they connect, and basic styling (color, a caption) on ordinary shapes.

### Scope

1. **Re-save in place**: "Save" on an already-loaded diagram overwrites it; a separate "Save As" creates a new one under a new name.
2. **Layer tree**: a panel listing every shape in z-order, click to select, with front/back reordering per row.
3. **Arrow-to-shape anchoring**: dropping an arrow endpoint onto a shape binds it there; the endpoint then tracks that shape's edge as it moves/resizes.
4. **Shape color + label property**: any rectangle/circle/arrow can have its fill/stroke color changed and an optional caption added - a property on the shape itself, not the existing standalone Label shape type.

### Decisions made here

- **"Save" vs "Save As" mirrors ordinary desktop app semantics.** If `currentDiagramId` is set, the existing `SaveDialog`'s primary action calls `updateDiagram` (already existed in the wrapper since Stage 3/6 but was never wired up) against that same row - no name prompt needed, since the name doesn't change. "Save As" always opens the name dialog and inserts a new row via `saveDiagram`, matching the current behavior exactly. If nothing is loaded yet, "Save" and "Save As" do the same thing.
- **Arrow attachment is resolved at render/hit-test time, not written back into the doc.** An attached arrow's stored `x2`/`y2` (or `x1`/`y1`) are a fallback, not the live position. Recomputing "what point on the target shape's edge is closest to the other endpoint" happens in a pure geometry helper called wherever an arrow is drawn or hit-tested, using whatever the _current_ `shapes` map says the target looks like. This sidesteps a much worse design: writing a fresh coordinate update into the CRDT doc every time an attached shape moves, which would mean every drag of a connected shape also broadcasts arrow updates, multiplied per attached arrow, on every animation frame.
- **Attachment fields are flat, matching every other shape field.** `startAttachedToId: string | null` / `endAttachedToId: string | null` on `ArrowShape` - not a nested `{ start, end }` object, because `diagram-crdt-core`'s `ShapeRecord` is `Record<string, JsonScalar>` (flat scalars only, one Y.Map key per field - see Stage 5). This is the same pattern `groupId` already uses.
- **Attachment is (re)decided once per gesture, not continuously during a drag.** When an arrow-creation or endpoint-resize gesture ends, the final point is hit-tested against every other shape; a hit sets the attachment id and immediately snaps the stored coordinate to that shape's edge (facing the other endpoint), a miss clears it back to `null` and keeps the raw dropped point. Continuous re-attachment-checking during the drag itself isn't needed and would just add per-frame hit-testing cost.
- **A dangling attachment (target shape deleted) is self-healing, not cleaned up.** `resolveArrowEndpoints` only trusts `startAttachedToId`/`endAttachedToId` if that id still exists in the current `shapes` map; otherwise it falls back to the stored raw coordinate, exactly as if the field were `null`. No extra logic is needed anywhere shapes get deleted (including `removeManyShapes` group-delete from Stage 7).
- **Arrows can attach to rectangle/circle/label shapes, not to other arrows.** An arrow-to-arrow connection isn't a meaningful "edge" the way a box or circle has one; out of scope until a real use case shows up.
- **Label is a new optional field on the three non-Label shapes, the existing Label shape type is untouched.** `label?: string` on `RectangleShape`/`CircleShape`/`ArrowShape`. Rendered centered on the shape (rectangle/circle) or at its midpoint (arrow). This is a distinct concept from the standalone `LabelShape` (a shape that _is_ text) - the roadmap explicitly asked for this as "a property of another one," so the two coexist rather than merging.
- **One color per shape, no separate label-text color.** The color picker changes `shape.color` (already existed on every shape type since Stage 1 via `BaseShape`, just never had UI to change it). Label text color is computed automatically from `shape.color`'s luminance (light background → dark text, dark background → light text) rather than adding a second user-facing color control - keeps the data model flat and the UI to one picker.
- **Color/label editing lives in a small Inspector panel, shown only when exactly one shape is selected.** Consistent with how `SelectionBox` already only renders resize handles for a single selection - editing a shared property across a multi-selection isn't scoped here.
- **The layer tree is a Dialog-triggered panel, like `DiagramList`/`SaveDialog`, not a persistent side column.** A permanently-visible side panel needs its own responsive/collapse behavior on narrow viewports (`CLAUDE.md`'s responsiveness requirement); reusing the existing Dialog pattern gets that for free and stays consistent with every other piece of chrome added so far. Revisit if a persistent panel turns out to matter more than the consistency.
- **Layer tree supports front/back reordering per row (reusing `bringSelectedToFront`/`sendSelectedToBack`), not free drag-to-reorder.** Full drag-and-drop layer reordering is a meaningfully bigger UI feature; front/back covers the common case.

### Data model

No Postgres/migration changes - everything here is shape fields inside the existing CRDT doc (still round-trips through the same `crdt_state` bytea from Stage 6) plus new UI. `Shape` (in `diagram-front-react/src/lib/geometry.ts`) changes:

```ts
type BaseShape = {
  id: string;
  zIndex: number;
  groupId: string | null;
  color: string;
};

export type RectangleShape = BaseShape & {
  type: "rectangle";
  x;
  y;
  width;
  height;
  label?: string;
};
export type CircleShape = BaseShape & {
  type: "circle";
  x;
  y;
  radius;
  label?: string;
};
export type ArrowShape = BaseShape & {
  type: "arrow";
  x1;
  y1;
  x2;
  y2;
  label?: string;
  startAttachedToId: string | null;
  endAttachedToId: string | null;
};
// LabelShape unchanged
```

### Structure (new/changed files, on top of Stage 1-7's tree)

```
diagram-front-react/src/
├── lib/
│   └── geometry.ts                 # + label?/startAttachedToId/endAttachedToId fields; resolveArrowEndpoints(
│                                    #   shape, shapes) -> {x1,y1,x2,y2}; getBoundingBox/isPointInShape/
│                                    #   getArrowHandleBounds take the shapes map for arrows
├── hooks/
│   ├── useDiagrams.ts               # + update(): calls updateDiagram against the current diagram id
│   └── useCanvasInteraction.ts      # arrow creation/resize-endpoint gestures resolve attachment on pointerup
├── components/
│   ├── SaveDialog/index.tsx         # primary action becomes Save-in-place when a diagram is loaded; adds
│   │                                 # a secondary "Save As" trigger for the existing create-new flow
│   ├── ShapeRenderer/index.tsx      # renders label text; resolves arrow endpoints before drawing
│   ├── Inspector/index.tsx          # new: color picker + label input, shown for a single selection
│   └── LayerTree/index.tsx          # new: Dialog-based panel listing shapes in z-order
```

### Tests

- `geometry.ts`: `resolveArrowEndpoints` - unattached arrow returns its raw coordinates unchanged; an attached endpoint returns a point on the target shape's boundary (rectangle and circle); a dangling attachment (target id not in the shapes map) falls back to the raw coordinate.
- Real browser (consistent with this project's standard so far): draw a shape, save, reload the page via its own link, edit it, click Save (not Save As), reload again, confirm the edit persisted to the _same_ diagram id rather than creating a second one; draw an arrow onto a shape, move the shape, confirm the arrow's rendered endpoint moved with it; set a shape's color and label, confirm both render.

### Out of scope

- Drag-and-drop layer reordering (front/back buttons only)
- Multi-shape color/label editing at once
- A user-chosen label text color (auto-contrast only)
- Arrow-to-arrow attachment
- Any richer shape styling (borders, opacity, fonts) beyond fill color and a caption
