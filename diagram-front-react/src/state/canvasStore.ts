import { create } from "zustand";
import type { Shape, Viewport } from "@/lib/geometry";

export type Tool = "select" | "rectangle";

type CanvasState = {
  shapes: Record<string, Shape>;
  selectedId: string | null;
  tool: Tool;
  viewport: Viewport;

  addShape: (shape: Shape) => void;
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
    set((state) => ({ shapes: { ...state.shapes, [shape.id]: shape } })),

  updateShape: (id, updates) =>
    set((state) => {
      const shape = state.shapes[id];
      if (!shape) return state;
      return { shapes: { ...state.shapes, [id]: { ...shape, ...updates } } };
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
