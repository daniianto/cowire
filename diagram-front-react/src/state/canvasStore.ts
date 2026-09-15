import { create } from "zustand";
import type { NewShape, Shape, Viewport } from "@/lib/geometry";

export type Tool = "select" | "rectangle" | "circle" | "arrow" | "label";

type CanvasState = {
  shapes: Record<string, Shape>;
  selectedId: string | null;
  tool: Tool;
  viewport: Viewport;

  // zIndex/groupId are bookkeeping the store owns: new shapes always start
  // on top of everything else and ungrouped
  addShape: (shape: NewShape) => void;
  updateShape: (id: string, updates: Partial<Shape>) => void;
  removeShape: (id: string) => void;

  selectShape: (id: string | null) => void;
  setTool: (tool: Tool) => void;
  setViewport: (viewport: Viewport) => void;
};

export const useCanvasStore = create<CanvasState>((set) => ({
  shapes: {},
  selectedId: null,
  tool: "select",
  viewport: { offsetX: 0, offsetY: 0, zoom: 1 },

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
      // clear selection if the removed shape was selected
      const selectedId = state.selectedId === id ? null : state.selectedId;
      return { shapes, selectedId };
    }),

  selectShape: (id) => set({ selectedId: id }),
  setTool: (tool) => set({ tool }),
  setViewport: (viewport) => set({ viewport }),
}));
