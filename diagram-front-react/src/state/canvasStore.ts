import { create } from "zustand";
import type { BoundingBox, NewShape, Shape, Viewport } from "@/lib/geometry";

export type Tool = "select" | "rectangle" | "circle" | "arrow" | "label";

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

  // zIndex/groupId are bookkeeping the store owns: new shapes always start
  // on top of everything else and ungrouped
  addShape: (shape: NewShape) => void;
  updateShape: (id: string, updates: Partial<Shape>) => void;
  removeShape: (id: string) => void;

  // replaces the selection with one shape's group (or just itself if ungrouped)
  selectShape: (id: string | null) => void;
  // shift-click: toggles one shape's whole group in/out of the selection
  toggleSelect: (id: string) => void;
  // marquee finalize: merges these shapes' groups into the selection
  addToSelection: (ids: string[]) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;

  setTool: (tool: Tool) => void;
  setViewport: (viewport: Viewport) => void;
  setMarqueeRect: (rect: BoundingBox | null) => void;
};

export const useCanvasStore = create<CanvasState>((set) => ({
  shapes: {},
  selectedIds: [],
  tool: "select",
  viewport: { offsetX: 0, offsetY: 0, zoom: 1 },
  marqueeRect: null,

  addShape: (shape) =>
    set((state) => {
      const topZIndex = Object.values(state.shapes).reduce(
        (max, s) => Math.max(max, s.zIndex),
        -1
      );
      const withDefaults = {
        ...shape,
        zIndex: topZIndex + 1,
        groupId: null,
      } as Shape;
      return {
        shapes: { ...state.shapes, [withDefaults.id]: withDefaults },
      };
    }),

  // `updates` is always a partial of the shape's own (already-known) type at
  // the call site, even though Partial<Shape> as a union can't express that
  // precisely — safe in practice, so a cast beats an unsound generic type
  updateShape: (id, updates) =>
    set((state) => {
      const shape = state.shapes[id];
      if (!shape) return state;
      return {
        shapes: { ...state.shapes, [id]: { ...shape, ...updates } as Shape },
      };
    }),

  removeShape: (id) =>
    set((state) => {
      const shapes = { ...state.shapes };
      delete shapes[id];
      return {
        shapes,
        selectedIds: state.selectedIds.filter((sid) => sid !== id),
      };
    }),

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

  groupSelected: () =>
    set((state) => {
      if (state.selectedIds.length < 2) return state;
      const groupId = crypto.randomUUID();
      const shapes = { ...state.shapes };
      for (const id of state.selectedIds) {
        const shape = shapes[id];
        if (shape) shapes[id] = { ...shape, groupId };
      }
      return { shapes };
    }),

  ungroupSelected: () =>
    set((state) => {
      const shapes = { ...state.shapes };
      for (const id of state.selectedIds) {
        const shape = shapes[id];
        if (shape) shapes[id] = { ...shape, groupId: null };
      }
      return { shapes };
    }),

  setTool: (tool) => set({ tool }),
  setViewport: (viewport) => set({ viewport }),
  setMarqueeRect: (rect) => set({ marqueeRect: rect }),
}));
