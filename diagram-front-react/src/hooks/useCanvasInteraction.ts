import { useEffect, useRef, type RefObject } from "react";
import {
  getBoundingBox,
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
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

type DragState =
  | { mode: "creating"; id: string; start: Point }
  | { mode: "moving"; id: string; lastCanvasPoint: Point }
  | { mode: "resizing"; id: string; origin: Point }
  | { mode: "panning"; lastScreenPoint: Point }
  | null;

// topmost shape under a point — later entries were added more recently and
// are drawn on top, so search from the end
const findShapeAt = (
  point: Point,
  shapes: Record<string, Shape>
): Shape | undefined => {
  const values = Object.values(shapes);
  for (let i = values.length - 1; i >= 0; i--) {
    if (isPointInShape(point, values[i])) return values[i];
  }
  return undefined;
};

const toScreenPoint = (
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement
): Point => {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

/**
 * Wires pointer/wheel/keyboard input on the canvas to create, select, move,
 * resize, and delete shapes, plus pan (drag empty canvas) and zoom (wheel).
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
    // so tool switching and delete are keyboard-only for now: R = rectangle
    // tool, Escape = back to select tool and deselect, Delete/Backspace =
    // remove the selected shape
    const handleKeyDown = (e: KeyboardEvent) => {
      const { selectedId, removeShape, setTool, selectShape } =
        useCanvasStore.getState();

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) removeShape(selectedId);
      } else if (e.key === "r" || e.key === "R") {
        setTool("rectangle");
      } else if (e.key === "Escape") {
        setTool("select");
        selectShape(null);
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const { shapes, selectedId, tool, viewport, addShape, selectShape } =
        useCanvasStore.getState();
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
          mode: "creating",
          id: shape.id,
          start: canvasPoint,
        };
        return;
      }

      // only rectangles resize from a single corner handle for now — circle/
      // arrow/label get their own resize handling once they're creatable
      const selectedShape = selectedId ? shapes[selectedId] : undefined;
      if (
        selectedShape?.type === "rectangle" &&
        isPointInResizeHandle(canvasPoint, selectedShape)
      ) {
        dragRef.current = {
          mode: "resizing",
          id: selectedShape.id,
          origin: { x: selectedShape.x, y: selectedShape.y },
        };
        return;
      }

      const hit = findShapeAt(canvasPoint, shapes);
      if (hit) {
        selectShape(hit.id);
        dragRef.current = {
          mode: "moving",
          id: hit.id,
          lastCanvasPoint: canvasPoint,
        };
        return;
      }

      selectShape(null);
      dragRef.current = { mode: "panning", lastScreenPoint: screenPoint };
    };

    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const { shapes, viewport, updateShape, setViewport } =
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

      if (drag.mode === "creating") {
        updateShape(drag.id, {
          width: canvasPoint.x - drag.start.x,
          height: canvasPoint.y - drag.start.y,
        });
      } else if (drag.mode === "moving") {
        const shape = shapes[drag.id];
        if (!shape) return;
        const dx = canvasPoint.x - drag.lastCanvasPoint.x;
        const dy = canvasPoint.y - drag.lastCanvasPoint.y;
        updateShape(drag.id, translateShape(shape, dx, dy));
        dragRef.current = { ...drag, lastCanvasPoint: canvasPoint };
      } else if (drag.mode === "resizing") {
        updateShape(drag.id, {
          width: canvasPoint.x - drag.origin.x,
          height: canvasPoint.y - drag.origin.y,
        });
      }
    };

    const handlePointerUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;

      const { shapes, updateShape, removeShape, selectShape, setTool } =
        useCanvasStore.getState();

      if (drag.mode === "creating" || drag.mode === "resizing") {
        const shape = shapes[drag.id];
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
        if (drag.mode === "creating") setTool("select");
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
