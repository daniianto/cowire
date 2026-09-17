import { create } from "zustand";
import {
  createDiagramDoc,
  createLocalOrigin,
  createLocalUndoManager,
  getAllShapes,
  getShapesMap,
  loadSnapshot as loadSnapshotIntoDoc,
  removeManyShapes,
  removeShape as removeShapeFromDoc,
  replaceAllShapes,
  setShape,
  updateManyShapeFields,
  updateShapeFields,
  type ShapeRecord,
} from "diagram-crdt-core";
import type { BoundingBox, NewShape, Shape, Viewport } from "@/lib/geometry";

export type Tool = "select" | "rectangle" | "circle" | "arrow" | "label";

// the collaborative source of truth for shapes - `shapes` in the store below
// is a materialized read cache kept in sync by the observer at the bottom of
// this file, never written to directly. localOrigin tags every transaction
// this client causes, so a remote peer's update (applied under a different
// origin by the wrapper's realtime relay) is never mistaken for one of ours
// - which is also what keeps undoManager from ever undoing someone else's edit.
export const diagramDoc = createDiagramDoc();
const localOrigin = createLocalOrigin();
export const undoManager = createLocalUndoManager(diagramDoc, localOrigin);

// selecting any member of a group selects every member with it
const groupMembers = (shapes: Record<string, Shape>, id: string): string[] => {
  const shape = shapes[id];
  if (!shape?.groupId) return [id];
  return Object.values(shapes)
    .filter((s) => s.groupId === shape.groupId)
    .map((s) => s.id);
};

type CanvasState = {
  shapes: Record<string, Shape>;
  selectedIds: string[];
  tool: Tool;
  viewport: Viewport;
  // in-progress marquee/rubber-band rect (canvas space), or null when not dragging one
  marqueeRect: BoundingBox | null;
  // id of the shape currently under the pointer (not mid-gesture), or null -
  // drives the hover hint tooltip; purely local UI state, not shared
  hoveredShapeId: string | null;

  // zIndex/groupId are bookkeeping the store owns: new shapes always start
  // on top of everything else and ungrouped
  addShape: (shape: NewShape) => void;
  updateShape: (id: string, updates: Partial<Shape>) => void;
  removeShape: (id: string) => void;
  // deletes several shapes as one transaction/undo step - e.g. a whole
  // group at once, rather than N separate removeShape calls
  removeShapes: (ids: string[]) => void;

  // replaces the selection with one shape's group (or just itself if ungrouped)
  selectShape: (id: string | null) => void;
  // shift-click: toggles one shape's whole group in/out of the selection
  toggleSelect: (id: string) => void;
  // marquee finalize: merges these shapes' groups into the selection
  addToSelection: (ids: string[]) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  bringSelectedToFront: () => void;
  sendSelectedToBack: () => void;

  setTool: (tool: Tool) => void;
  setViewport: (viewport: Viewport) => void;
  setMarqueeRect: (rect: BoundingBox | null) => void;
  setHoveredShapeId: (id: string | null) => void;

  // atomically replaces the canvas with a loaded diagram's contents.
  // Clears selection/marquee/undo history too — a freshly loaded diagram
  // has no undo history of its own, and undoing into the *previous*
  // diagram's edits would be a correctness bug, not a convenience.
  // loadState is the legacy (pre-Stage-6) path: a plain shape list, used as
  // a one-time fallback for a diagram saved before CRDT snapshots existed.
  // loadSnapshot is the normal path from Stage 6 on: a real Yjs snapshot,
  // which also gives a reconnecting client actual merge history to build on.
  loadState: (shapes: Record<string, Shape>, viewport: Viewport) => void;
  loadSnapshot: (snapshot: Uint8Array, viewport: Viewport) => void;

  // ends the current undo-grouping window - call this right before a
  // discrete edit starts (a whole drag gesture, a group/ungroup, a delete),
  // never per intermediate update, or undo would only revert one animation
  // frame at a time instead of one meaningful action
  stopCapturing: () => void;
  undo: () => void;
  redo: () => void;
};

export const useCanvasStore = create<CanvasState>((set, get) => ({
  shapes: getAllShapes<Shape>(diagramDoc),
  selectedIds: [],
  tool: "select",
  viewport: { offsetX: 0, offsetY: 0, zoom: 1 },
  marqueeRect: null,
  hoveredShapeId: null,

  addShape: (shape) => {
    const topZIndex = Object.values(get().shapes).reduce(
      (max, s) => Math.max(max, s.zIndex),
      -1
    );
    const withDefaults = {
      ...shape,
      zIndex: topZIndex + 1,
      groupId: null,
    } as Shape;
    setShape(diagramDoc, withDefaults.id, withDefaults, localOrigin);
  },

  // `updates` is always a partial of the shape's own (already-known) type at
  // the call site, even though Partial<Shape> as a union can't express that
  // precisely — safe in practice, so a cast beats an unsound generic type
  updateShape: (id, updates) => {
    updateShapeFields(diagramDoc, id, updates as ShapeRecord, localOrigin);
  },

  removeShape: (id) => removeShapeFromDoc(diagramDoc, id, localOrigin),

  removeShapes: (ids) => removeManyShapes(diagramDoc, ids, localOrigin),

  selectShape: (id) =>
    set((state) => ({
      selectedIds: id ? groupMembers(state.shapes, id) : [],
    })),

  toggleSelect: (id) =>
    set((state) => {
      const unit = groupMembers(state.shapes, id);
      const alreadySelected = unit.every((sid) =>
        state.selectedIds.includes(sid)
      );
      return {
        selectedIds: alreadySelected
          ? state.selectedIds.filter((sid) => !unit.includes(sid))
          : [...new Set([...state.selectedIds, ...unit])],
      };
    }),

  addToSelection: (ids) =>
    set((state) => {
      const units = ids.flatMap((id) => groupMembers(state.shapes, id));
      return { selectedIds: [...new Set([...state.selectedIds, ...units])] };
    }),

  groupSelected: () => {
    const { selectedIds } = get();
    if (selectedIds.length < 2) return;
    const groupId = crypto.randomUUID();
    const updates: Record<string, ShapeRecord> = {};
    for (const id of selectedIds) updates[id] = { groupId };
    updateManyShapeFields(diagramDoc, updates, localOrigin);
  },

  ungroupSelected: () => {
    const updates: Record<string, ShapeRecord> = {};
    for (const id of get().selectedIds) updates[id] = { groupId: null };
    updateManyShapeFields(diagramDoc, updates, localOrigin);
  },

  bringSelectedToFront: () => {
    const { selectedIds, shapes } = get();
    if (selectedIds.length === 0) return;
    const topZIndex = Object.values(shapes).reduce(
      (max, s) => Math.max(max, s.zIndex),
      -1
    );
    const updates: Record<string, ShapeRecord> = {};
    selectedIds.forEach((id, i) => {
      updates[id] = { zIndex: topZIndex + 1 + i };
    });
    updateManyShapeFields(diagramDoc, updates, localOrigin);
  },

  sendSelectedToBack: () => {
    const { selectedIds, shapes } = get();
    if (selectedIds.length === 0) return;
    const bottomZIndex = Object.values(shapes).reduce(
      (min, s) => Math.min(min, s.zIndex),
      0
    );
    const updates: Record<string, ShapeRecord> = {};
    selectedIds.forEach((id, i) => {
      updates[id] = { zIndex: bottomZIndex - selectedIds.length + i };
    });
    updateManyShapeFields(diagramDoc, updates, localOrigin);
  },

  setTool: (tool) => set({ tool }),
  setViewport: (viewport) => set({ viewport }),
  setMarqueeRect: (rect) => set({ marqueeRect: rect }),
  setHoveredShapeId: (id) => set({ hoveredShapeId: id }),

  loadState: (shapes, viewport) => {
    undoManager.clear();
    replaceAllShapes(diagramDoc, shapes, localOrigin);
    set({ viewport, selectedIds: [], marqueeRect: null });
  },

  loadSnapshot: (snapshot, viewport) => {
    undoManager.clear();
    loadSnapshotIntoDoc(diagramDoc, snapshot, localOrigin);
    set({ viewport, selectedIds: [], marqueeRect: null });
  },

  stopCapturing: () => undoManager.stopCapturing(),
  undo: () => undoManager.undo(),
  redo: () => undoManager.redo(),
}));

// the single place shapes actually flow into the reactive store - covers
// local edits and remote ones identically, since by the time a transaction
// lands here (local or applied from the wire) it's just a doc change.
// Dropping any now-deleted id from selectedIds here (rather than only in
// removeShape) also covers a shape someone else deletes remotely while this
// client still has it selected.
getShapesMap(diagramDoc).observeDeep(() => {
  const shapes = getAllShapes<Shape>(diagramDoc);
  useCanvasStore.setState((state) => ({
    shapes,
    selectedIds: state.selectedIds.filter((id) => shapes[id]),
  }));
});
