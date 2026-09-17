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
import { setLocalCursor } from "diagram-crdt-core";
import { getActiveAwareness, useCanvasStore } from "@/state";

const DEFAULT_SHAPE_COLOR = "#94a3b8";
const DEFAULT_ARROW_COLOR = "#334155";
const DEFAULT_FONT_SIZE = 16;
const LABEL_PADDING = 8;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

type DragState =
  | { mode: "creating-box"; id: string; start: Point } // rectangle
  | { mode: "creating-circle"; id: string; start: Point }
  | { mode: "creating-arrow"; id: string }
  // `committed` is lazy history-commit tracking: a gesture that never
  // actually moves the pointer shouldn't push a wasted undo step
  | {
      mode: "moving";
      ids: string[];
      lastCanvasPoint: Point;
      committed: boolean;
    }
  | { mode: "resizing-box"; id: string; origin: Point; committed: boolean } // rectangle
  | {
      mode: "resizing-label";
      id: string;
      origin: Point;
      initialHeight: number;
      initialFontSize: number;
      committed: boolean;
    }
  | { mode: "resizing-circle"; id: string; committed: boolean }
  | {
      mode: "resizing-arrow";
      id: string;
      endpoint: "start" | "end";
      committed: boolean;
    }
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
 * (single, shift-click multi, or marquee), move, resize, group/ungroup,
 * reorder, undo/redo, and delete shapes, plus pan (drag empty canvas) and
 * zoom (wheel).
 *
 * Gesture note: plain drag on empty canvas pans (unchanged from Stage 1);
 * Shift+drag on empty canvas marquee-selects instead, reusing Shift as the
 * same "additive/multi" modifier it already is for click.
 *
 * Undo/redo note: undo grouping is ended at gesture boundaries (before a
 * create/move/resize starts, or before a one-shot action like group/delete),
 * never on every intermediate update — otherwise undo would only revert one
 * animation frame of a drag instead of the whole gesture. Backed by
 * canvasStore's Y.UndoManager (see state/canvasStore.ts), not a hand-rolled
 * snapshot stack.
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
    // so tool switching, grouping, reordering, undo/redo, and delete are all
    // keyboard-only: R/C/A/L pick a shape tool, G/Shift+G group/ungroup,
    // ]/[ bring-to-front/send-to-back, Cmd|Ctrl+Z/Shift+Z undo/redo, Escape
    // goes back to select tool and deselects, Delete/Backspace removes the
    // selection
    const handleKeyDown = (e: KeyboardEvent) => {
      const {
        selectedIds,
        removeShapes,
        setTool,
        selectShape,
        groupSelected,
        ungroupSelected,
        bringSelectedToFront,
        sendSelectedToBack,
        stopCapturing,
        undo,
        redo,
      } = useCanvasStore.getState();
      const cmdOrCtrl = e.metaKey || e.ctrlKey;

      if (cmdOrCtrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length > 0) {
          stopCapturing();
          removeShapes(selectedIds);
        }
      } else if (e.key === "r" || e.key === "R") {
        setTool("rectangle");
      } else if (e.key === "c" || e.key === "C") {
        setTool("circle");
      } else if (e.key === "a" || e.key === "A") {
        setTool("arrow");
      } else if (e.key === "l" || e.key === "L") {
        setTool("label");
      } else if (e.key === "g" || e.key === "G") {
        if (e.shiftKey) {
          if (
            selectedIds.some(
              (id) => useCanvasStore.getState().shapes[id]?.groupId
            )
          ) {
            stopCapturing();
            ungroupSelected();
          }
        } else if (selectedIds.length >= 2) {
          stopCapturing();
          groupSelected();
        }
      } else if (e.key === "]") {
        if (selectedIds.length > 0) {
          stopCapturing();
          bringSelectedToFront();
        }
      } else if (e.key === "[") {
        if (selectedIds.length > 0) {
          stopCapturing();
          sendSelectedToBack();
        }
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
      const { addShape, selectShape, setTool, stopCapturing } =
        useCanvasStore.getState();
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
      stopCapturing();
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
        stopCapturing,
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
        stopCapturing();
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
        stopCapturing();
        addShape(shape);
        selectShape(shape.id);
        dragRef.current = {
          mode: "creating-circle",
          id: shape.id,
          start: canvasPoint,
        };
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
        stopCapturing();
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
          singleSelected.type === "rectangle" &&
          isPointInResizeHandle(canvasPoint, singleSelected)
        ) {
          dragRef.current = {
            mode: "resizing-box",
            id: singleSelected.id,
            origin: { x: singleSelected.x, y: singleSelected.y },
            committed: false,
          };
          return;
        }
        if (
          singleSelected.type === "label" &&
          isPointInResizeHandle(canvasPoint, singleSelected)
        ) {
          dragRef.current = {
            mode: "resizing-label",
            id: singleSelected.id,
            origin: { x: singleSelected.x, y: singleSelected.y },
            initialHeight: singleSelected.height,
            initialFontSize: singleSelected.fontSize,
            committed: false,
          };
          return;
        }
        if (
          singleSelected.type === "circle" &&
          isPointInResizeHandle(canvasPoint, singleSelected)
        ) {
          dragRef.current = {
            mode: "resizing-circle",
            id: singleSelected.id,
            committed: false,
          };
          return;
        }
        if (singleSelected.type === "arrow") {
          if (isPointInArrowHandle(canvasPoint, singleSelected, "start")) {
            dragRef.current = {
              mode: "resizing-arrow",
              id: singleSelected.id,
              endpoint: "start",
              committed: false,
            };
            return;
          }
          if (isPointInArrowHandle(canvasPoint, singleSelected, "end")) {
            dragRef.current = {
              mode: "resizing-arrow",
              id: singleSelected.id,
              endpoint: "end",
              committed: false,
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
        dragRef.current = {
          mode: "moving",
          ids,
          lastCanvasPoint: canvasPoint,
          committed: false,
        };
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
      // published unconditionally (not just mid-gesture) so peers see where
      // this client's pointer is even while it's just hovering
      const awareness = getActiveAwareness();
      if (awareness) {
        const point = screenToCanvas(
          toScreenPoint(e, canvas),
          useCanvasStore.getState().viewport
        );
        setLocalCursor(awareness, point);
      }

      const drag = dragRef.current;
      if (!drag) return;

      const {
        shapes,
        viewport,
        updateShape,
        setViewport,
        setMarqueeRect,
        stopCapturing,
      } = useCanvasStore.getState();
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
        if (!drag.committed) stopCapturing();
        const dx = canvasPoint.x - drag.lastCanvasPoint.x;
        const dy = canvasPoint.y - drag.lastCanvasPoint.y;
        for (const id of drag.ids) {
          const shape = shapes[id];
          if (shape) updateShape(id, translateShape(shape, dx, dy));
        }
        dragRef.current = {
          ...drag,
          lastCanvasPoint: canvasPoint,
          committed: true,
        };
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
        case "creating-circle": {
          // anchored exactly like a rectangle's corner: `start` stays fixed
          // as one corner of a square bounding box that grows toward the
          // pointer. Sizing the square from max(|dx|,|dy|) — rather than
          // the direct start-to-pointer distance — is what keeps that
          // corner from drifting as the drag direction wobbles off-axis;
          // using the raw distance instead makes the diameter (and thus
          // the edge nearest `start`) grow with any vertical component too.
          const dx = canvasPoint.x - drag.start.x;
          const dy = canvasPoint.y - drag.start.y;
          const side = Math.max(Math.abs(dx), Math.abs(dy));
          const boxX = dx >= 0 ? drag.start.x : drag.start.x - side;
          const boxY = dy >= 0 ? drag.start.y : drag.start.y - side;
          updateShape(drag.id, {
            x: boxX + side / 2,
            y: boxY + side / 2,
            radius: side / 2,
          });
          break;
        }
        case "creating-arrow":
          updateShape(drag.id, { x2: canvasPoint.x, y2: canvasPoint.y });
          break;
        case "resizing-box":
          if (!drag.committed) stopCapturing();
          updateShape(drag.id, {
            width: canvasPoint.x - drag.origin.x,
            height: canvasPoint.y - drag.origin.y,
          });
          dragRef.current = { ...drag, committed: true };
          break;
        case "resizing-label": {
          if (shape.type !== "label") break;
          if (!drag.committed) stopCapturing();

          // scale font size by how much the box's height changed, then
          // re-measure the actual text at that size so width follows the
          // text rather than being independently draggable
          const newHeight = canvasPoint.y - drag.origin.y;
          const scale = Math.max(0.1, Math.abs(newHeight) / drag.initialHeight);
          const fontSize = Math.max(4, drag.initialFontSize * scale);

          const ctx = canvas.getContext("2d");
          let width = shape.width;
          if (ctx) {
            ctx.save();
            ctx.font = `${fontSize}px system-ui, sans-serif`;
            width = ctx.measureText(shape.text).width + LABEL_PADDING * 2;
            ctx.restore();
          }

          updateShape(drag.id, { height: newHeight, width, fontSize });
          dragRef.current = { ...drag, committed: true };
          break;
        }
        case "resizing-circle":
          if (shape.type === "circle") {
            if (!drag.committed) stopCapturing();
            updateShape(drag.id, {
              radius: distance({ x: shape.x, y: shape.y }, canvasPoint),
            });
            dragRef.current = { ...drag, committed: true };
          }
          break;
        case "resizing-arrow":
          if (!drag.committed) stopCapturing();
          updateShape(
            drag.id,
            drag.endpoint === "start"
              ? { x1: canvasPoint.x, y1: canvasPoint.y }
              : { x2: canvasPoint.x, y2: canvasPoint.y }
          );
          dragRef.current = { ...drag, committed: true };
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

      if (
        drag.mode === "creating-box" ||
        drag.mode === "resizing-box" ||
        drag.mode === "resizing-label"
      ) {
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

    // don't leave a stale cursor showing for peers once this pointer leaves
    // the canvas entirely
    const handlePointerLeave = () => {
      const awareness = getActiveAwareness();
      if (awareness) setLocalCursor(awareness, null);
    };

    window.addEventListener("keydown", handleKeyDown);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [canvasRef]);
};
