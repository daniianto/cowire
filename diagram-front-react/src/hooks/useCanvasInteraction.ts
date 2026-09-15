import { useEffect, useRef, type RefObject } from "react";
import {
  doBoxesIntersect,
  getBoundingBox,
  isPointInArrowHandle,
  isPointInResizeHandle,
  isPointInShape,
  screenToCanvas,
  translateShape,
  type NewShape,
  type Point,
  type Shape,
} from "@/lib/geometry";
import { useCanvasStore } from "@/state";

const DEFAULT_SHAPE_COLOR = "#94a3b8";
const DEFAULT_ARROW_COLOR = "#334155";
const DEFAULT_FONT_SIZE = 16;
const LABEL_PADDING = 8;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

type DragState =
  | { mode: "creating-box"; id: string; start: Point } // rectangle
  | { mode: "creating-circle"; id: string }
  | { mode: "creating-arrow"; id: string }
  | { mode: "moving"; ids: string[]; lastCanvasPoint: Point }
  | { mode: "resizing-box"; id: string; origin: Point } // rectangle/label
  | { mode: "resizing-circle"; id: string }
  | { mode: "resizing-arrow"; id: string; endpoint: "start" | "end" }
  | { mode: "panning"; lastScreenPoint: Point }
  | { mode: "marquee"; start: Point } // shift+drag on empty canvas
  | null;

// topmost shape under a point, matching Canvas's zIndex draw order
const findShapeAt = (
  point: Point,
  shapes: Record<string, Shape>
): Shape | undefined => {
  const inZOrder = Object.values(shapes).sort((a, b) => b.zIndex - a.zIndex);
  return inZOrder.find((shape) => isPointInShape(point, shape));
};

const toScreenPoint = (
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement
): Point => {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

const distance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Wires pointer/wheel/keyboard input on the canvas to create, select
 * (single, shift-click multi, or marquee), move, resize, group/ungroup, and
 * delete shapes, plus pan (drag empty canvas) and zoom (wheel).
 *
 * Gesture note: plain drag on empty canvas pans (unchanged from Stage 1);
 * Shift+drag on empty canvas marquee-selects instead, reusing Shift as the
 * same "additive/multi" modifier it already is for click.
 *
 * Attaches its own native listeners — wheel needs `{ passive: false }` to
 * reliably preventDefault the page-zoom/scroll, which React's synthetic
 * onWheel doesn't guarantee.
 */
export const useCanvasInteraction = (
  canvasRef: RefObject<HTMLCanvasElement | null>
) => {
  const dragRef = useRef<DragState>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // no toolbar exists yet (out of scope until shadcn/ui components land),
    // so tool switching and delete are keyboard-only for now: R/C/A/L pick a
    // shape tool, G/U group/ungroup the selection, Escape goes back to
    // select tool and deselects, Delete/Backspace removes the selection
    const handleKeyDown = (e: KeyboardEvent) => {
      const {
        selectedIds,
        removeShape,
        setTool,
        selectShape,
        groupSelected,
        ungroupSelected,
      } = useCanvasStore.getState();

      if (e.key === "Delete" || e.key === "Backspace") {
        for (const id of selectedIds) removeShape(id);
      } else if (e.key === "r" || e.key === "R") {
        setTool("rectangle");
      } else if (e.key === "c" || e.key === "C") {
        setTool("circle");
      } else if (e.key === "a" || e.key === "A") {
        setTool("arrow");
      } else if (e.key === "l" || e.key === "L") {
        setTool("label");
      } else if (e.key === "g" || e.key === "G") {
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
      } else if (e.key === "Escape") {
        setTool("select");
        selectShape(null);
      }
    };

    // labels are placed with a single click (no drag-to-size, since their
    // size comes from measuring the text) and their text comes from a native
    // prompt() — the only zero-dependency text entry available without a
    // real UI component library
    const createLabelAt = (point: Point) => {
      const { addShape, selectShape, setTool } = useCanvasStore.getState();
      const text = window.prompt("Label text:");
      setTool("select");
      if (!text) return;

      const ctx = canvas.getContext("2d");
      ctx?.save();
      if (ctx) ctx.font = `${DEFAULT_FONT_SIZE}px system-ui, sans-serif`;
      const width =
        (ctx?.measureText(text).width ?? text.length * 8) + LABEL_PADDING * 2;
      ctx?.restore();

      const shape: NewShape = {
        id: crypto.randomUUID(),
        type: "label",
        x: point.x,
        y: point.y,
        width,
        height: DEFAULT_FONT_SIZE * 1.4,
        text,
        fontSize: DEFAULT_FONT_SIZE,
        color: DEFAULT_SHAPE_COLOR,
      };
      addShape(shape);
      selectShape(shape.id);
    };

    const handlePointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const {
        shapes,
        selectedIds,
        tool,
        viewport,
        addShape,
        selectShape,
        toggleSelect,
      } = useCanvasStore.getState();
      const screenPoint = toScreenPoint(e, canvas);
      const canvasPoint = screenToCanvas(screenPoint, viewport);

      if (tool === "rectangle") {
        const shape: NewShape = {
          id: crypto.randomUUID(),
          type: "rectangle",
          x: canvasPoint.x,
          y: canvasPoint.y,
          width: 0,
          height: 0,
          color: DEFAULT_SHAPE_COLOR,
        };
        addShape(shape);
        selectShape(shape.id);
        dragRef.current = {
          mode: "creating-box",
          id: shape.id,
          start: canvasPoint,
        };
        return;
      }

      if (tool === "circle") {
        const shape: NewShape = {
          id: crypto.randomUUID(),
          type: "circle",
          x: canvasPoint.x,
          y: canvasPoint.y,
          radius: 0,
          color: DEFAULT_SHAPE_COLOR,
        };
        addShape(shape);
        selectShape(shape.id);
        dragRef.current = { mode: "creating-circle", id: shape.id };
        return;
      }

      if (tool === "arrow") {
        const shape: NewShape = {
          id: crypto.randomUUID(),
          type: "arrow",
          x1: canvasPoint.x,
          y1: canvasPoint.y,
          x2: canvasPoint.x,
          y2: canvasPoint.y,
          color: DEFAULT_ARROW_COLOR,
        };
        addShape(shape);
        selectShape(shape.id);
        dragRef.current = { mode: "creating-arrow", id: shape.id };
        return;
      }

      if (tool === "label") {
        createLabelAt(canvasPoint);
        return;
      }

      // select tool: resize handle (single selection, type-specific) > move > pan/marquee
      const singleSelected =
        selectedIds.length === 1 ? shapes[selectedIds[0]] : undefined;
      if (singleSelected) {
        if (
          (singleSelected.type === "rectangle" ||
            singleSelected.type === "label") &&
          isPointInResizeHandle(canvasPoint, singleSelected)
        ) {
          dragRef.current = {
            mode: "resizing-box",
            id: singleSelected.id,
            origin: { x: singleSelected.x, y: singleSelected.y },
          };
          return;
        }
        if (
          singleSelected.type === "circle" &&
          isPointInResizeHandle(canvasPoint, singleSelected)
        ) {
          dragRef.current = { mode: "resizing-circle", id: singleSelected.id };
          return;
        }
        if (singleSelected.type === "arrow") {
          if (isPointInArrowHandle(canvasPoint, singleSelected, "start")) {
            dragRef.current = {
              mode: "resizing-arrow",
              id: singleSelected.id,
              endpoint: "start",
            };
            return;
          }
          if (isPointInArrowHandle(canvasPoint, singleSelected, "end")) {
            dragRef.current = {
              mode: "resizing-arrow",
              id: singleSelected.id,
              endpoint: "end",
            };
            return;
          }
        }
      }

      const hit = findShapeAt(canvasPoint, shapes);
      if (hit) {
        if (e.shiftKey) {
          // shift-click only toggles selection — it doesn't start a drag
          toggleSelect(hit.id);
          return;
        }
        // dragging a shape that's already part of a multi-selection moves
        // the whole selection; otherwise this click replaces it (expanding
        // to the clicked shape's group, if any) — selectShape is synchronous,
        // so re-reading selectedIds after it reflects whichever case applies
        if (!selectedIds.includes(hit.id)) selectShape(hit.id);
        const ids = useCanvasStore.getState().selectedIds;
        dragRef.current = { mode: "moving", ids, lastCanvasPoint: canvasPoint };
        return;
      }

      if (e.shiftKey) {
        dragRef.current = { mode: "marquee", start: canvasPoint };
        return;
      }

      selectShape(null);
      dragRef.current = { mode: "panning", lastScreenPoint: screenPoint };
    };

    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const { shapes, viewport, updateShape, setViewport, setMarqueeRect } =
        useCanvasStore.getState();
      const screenPoint = toScreenPoint(e, canvas);

      if (drag.mode === "panning") {
        const dx = screenPoint.x - drag.lastScreenPoint.x;
        const dy = screenPoint.y - drag.lastScreenPoint.y;
        setViewport({
          ...viewport,
          offsetX: viewport.offsetX + dx,
          offsetY: viewport.offsetY + dy,
        });
        dragRef.current = { ...drag, lastScreenPoint: screenPoint };
        return;
      }

      const canvasPoint = screenToCanvas(screenPoint, viewport);

      if (drag.mode === "marquee") {
        setMarqueeRect({
          x: Math.min(drag.start.x, canvasPoint.x),
          y: Math.min(drag.start.y, canvasPoint.y),
          width: Math.abs(canvasPoint.x - drag.start.x),
          height: Math.abs(canvasPoint.y - drag.start.y),
        });
        return;
      }

      if (drag.mode === "moving") {
        const dx = canvasPoint.x - drag.lastCanvasPoint.x;
        const dy = canvasPoint.y - drag.lastCanvasPoint.y;
        for (const id of drag.ids) {
          const shape = shapes[id];
          if (shape) updateShape(id, translateShape(shape, dx, dy));
        }
        dragRef.current = { ...drag, lastCanvasPoint: canvasPoint };
        return;
      }

      const shape = shapes[drag.id];
      if (!shape) return;

      switch (drag.mode) {
        case "creating-box":
          updateShape(drag.id, {
            width: canvasPoint.x - drag.start.x,
            height: canvasPoint.y - drag.start.y,
          });
          break;
        case "creating-circle":
          if (shape.type === "circle") {
            updateShape(drag.id, {
              radius: distance({ x: shape.x, y: shape.y }, canvasPoint),
            });
          }
          break;
        case "creating-arrow":
          updateShape(drag.id, { x2: canvasPoint.x, y2: canvasPoint.y });
          break;
        case "resizing-box":
          updateShape(drag.id, {
            width: canvasPoint.x - drag.origin.x,
            height: canvasPoint.y - drag.origin.y,
          });
          break;
        case "resizing-circle":
          if (shape.type === "circle") {
            updateShape(drag.id, {
              radius: distance({ x: shape.x, y: shape.y }, canvasPoint),
            });
          }
          break;
        case "resizing-arrow":
          updateShape(
            drag.id,
            drag.endpoint === "start"
              ? { x1: canvasPoint.x, y1: canvasPoint.y }
              : { x2: canvasPoint.x, y2: canvasPoint.y }
          );
          break;
      }
    };

    const handlePointerUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || drag.mode === "panning" || drag.mode === "moving") return;

      const {
        shapes,
        updateShape,
        removeShape,
        selectShape,
        setTool,
        setMarqueeRect,
        addToSelection,
      } = useCanvasStore.getState();

      if (drag.mode === "marquee") {
        const rect = useCanvasStore.getState().marqueeRect;
        setMarqueeRect(null);
        if (!rect) return;
        const hitIds = Object.values(shapes)
          .filter((s) => doBoxesIntersect(getBoundingBox(s), rect))
          .map((s) => s.id);
        if (hitIds.length > 0) addToSelection(hitIds);
        return;
      }

      const shape = shapes[drag.id];

      if (drag.mode === "creating-box" || drag.mode === "resizing-box") {
        if (!shape) return;
        const box = getBoundingBox(shape);
        // a click with no drag leaves a 0x0 rectangle — discard it instead
        // of committing invisible junk
        if (box.width === 0 || box.height === 0) {
          removeShape(drag.id);
          selectShape(null);
        } else {
          updateShape(drag.id, box);
        }
      } else if (drag.mode === "creating-circle") {
        if (shape?.type === "circle" && shape.radius === 0) {
          removeShape(drag.id);
          selectShape(null);
        }
      } else if (drag.mode === "creating-arrow") {
        if (
          shape?.type === "arrow" &&
          shape.x1 === shape.x2 &&
          shape.y1 === shape.y2
        ) {
          removeShape(drag.id);
          selectShape(null);
        }
      }

      if (
        drag.mode === "creating-box" ||
        drag.mode === "creating-circle" ||
        drag.mode === "creating-arrow"
      ) {
        setTool("select");
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { viewport, setViewport } = useCanvasStore.getState();
      const screenPoint = toScreenPoint(e, canvas);
      const canvasPointBefore = screenToCanvas(screenPoint, viewport);

      const zoomFactor = Math.exp(-e.deltaY * 0.001);
      const zoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, viewport.zoom * zoomFactor)
      );

      // keep the point under the cursor fixed on screen while zooming
      setViewport({
        zoom,
        offsetX: screenPoint.x - canvasPointBefore.x * zoom,
        offsetY: screenPoint.y - canvasPointBefore.y * zoom,
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [canvasRef]);
};
