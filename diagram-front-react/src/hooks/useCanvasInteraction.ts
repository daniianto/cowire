import { useEffect, useRef, type RefObject } from "react";
import {
  doBoxesIntersect,
  getBoundingBox,
  getEdgePoint,
  isPointInConnectorHandle,
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
  // "creating-box"/"resizing-box" are reused as-is for triangle/diamond too
  // (identical x/y/width/height fields and corner-drag math)
  | { mode: "creating-box"; id: string; start: Point } // rectangle/triangle/diamond
  | { mode: "creating-circle"; id: string; start: Point }
  | { mode: "creating-ellipse"; id: string; start: Point }
  // "creating-arrow"/"resizing-arrow" are reused as-is for line too
  // (identical endpoint/attachment fields, differing only in the arrowhead)
  | { mode: "creating-arrow"; id: string } // arrow/line
  // `committed` is lazy history-commit tracking: a gesture that never
  // actually moves the pointer shouldn't push a wasted undo step
  | {
      mode: "moving";
      ids: string[];
      lastCanvasPoint: Point;
      committed: boolean;
    }
  | { mode: "resizing-box"; id: string; origin: Point; committed: boolean } // rectangle/triangle/diamond
  | {
      mode: "resizing-label";
      id: string;
      origin: Point;
      initialHeight: number;
      initialFontSize: number;
      committed: boolean;
    }
  | { mode: "resizing-circle"; id: string; committed: boolean }
  | { mode: "resizing-ellipse"; id: string; origin: Point; committed: boolean }
  | {
      mode: "resizing-arrow"; // arrow/line
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
  return inZOrder.find((shape) => isPointInShape(point, shape, shapes));
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

  // pinch-zoom/two-finger pan tracking - independent of dragRef's
  // single-pointer state machine above. A second finger coming down always
  // cancels whatever single-touch gesture dragRef was tracking, since two
  // fingers means "zoom/pan", not "draw/move/resize"
  const touchPointsRef = useRef<Map<number, Point>>(new Map());
  const pinchStateRef = useRef<{ distance: number; midpoint: Point } | null>(
    null
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // tool switching also has an on-screen Toolbar (Stage 7, for touch
    // devices with no keyboard) - these shortcuts stay as a faster desktop
    // path, not a replacement: R/C/E/T/D/A/N/L pick a shape tool
    // (rectangle/circle/ellipse/triangle/diamond/arrow/line/label), G/Shift+G
    // group/ungroup, ]/[ bring-to-front/send-to-back, Cmd|Ctrl+Z/Shift+Z
    // undo/redo, Escape goes back to select tool and deselects,
    // Delete/Backspace removes the selection
    const handleKeyDown = (e: KeyboardEvent) => {
      // this listener is on `window`, not scoped to the canvas, so without
      // this guard every canvas shortcut (Backspace/Delete included) also
      // fires while typing into an unrelated text field - e.g. correcting a
      // typo in the Inspector's label input would delete the selected shape
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

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
      } else if (e.key === "e" || e.key === "E") {
        setTool("ellipse");
      } else if (e.key === "t" || e.key === "T") {
        setTool("triangle");
      } else if (e.key === "d" || e.key === "D") {
        setTool("diamond");
      } else if (e.key === "a" || e.key === "A") {
        setTool("arrow");
      } else if (e.key === "n" || e.key === "N") {
        setTool("line");
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
      if (e.pointerType === "touch") {
        touchPointsRef.current.set(e.pointerId, toScreenPoint(e, canvas));
        if (touchPointsRef.current.size >= 2) {
          dragRef.current = null;
          pinchStateRef.current = null;
          return;
        }
      }

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

      if (tool === "rectangle" || tool === "triangle" || tool === "diamond") {
        const shape: NewShape = {
          id: crypto.randomUUID(),
          type: tool,
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

      if (tool === "ellipse") {
        const shape: NewShape = {
          id: crypto.randomUUID(),
          type: "ellipse",
          x: canvasPoint.x,
          y: canvasPoint.y,
          radiusX: 0,
          radiusY: 0,
          color: DEFAULT_SHAPE_COLOR,
        };
        stopCapturing();
        addShape(shape);
        selectShape(shape.id);
        dragRef.current = {
          mode: "creating-ellipse",
          id: shape.id,
          start: canvasPoint,
        };
        return;
      }

      if (tool === "arrow" || tool === "line") {
        const shape: NewShape = {
          id: crypto.randomUUID(),
          type: tool,
          x1: canvasPoint.x,
          y1: canvasPoint.y,
          x2: canvasPoint.x,
          y2: canvasPoint.y,
          color: DEFAULT_ARROW_COLOR,
          startAttachedToId: null,
          endAttachedToId: null,
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
          (singleSelected.type === "rectangle" ||
            singleSelected.type === "triangle" ||
            singleSelected.type === "diamond") &&
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
        if (
          singleSelected.type === "ellipse" &&
          isPointInResizeHandle(canvasPoint, singleSelected)
        ) {
          dragRef.current = {
            mode: "resizing-ellipse",
            id: singleSelected.id,
            origin: {
              x: singleSelected.x - singleSelected.radiusX,
              y: singleSelected.y - singleSelected.radiusY,
            },
            committed: false,
          };
          return;
        }
        if (singleSelected.type === "arrow" || singleSelected.type === "line") {
          if (
            isPointInConnectorHandle(
              canvasPoint,
              singleSelected,
              "start",
              shapes
            )
          ) {
            dragRef.current = {
              mode: "resizing-arrow",
              id: singleSelected.id,
              endpoint: "start",
              committed: false,
            };
            return;
          }
          if (
            isPointInConnectorHandle(canvasPoint, singleSelected, "end", shapes)
          ) {
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
      if (
        e.pointerType === "touch" &&
        touchPointsRef.current.has(e.pointerId)
      ) {
        touchPointsRef.current.set(e.pointerId, toScreenPoint(e, canvas));
        if (touchPointsRef.current.size === 2) {
          const [p1, p2] = Array.from(touchPointsRef.current.values());
          const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

          const prev = pinchStateRef.current;
          if (prev) {
            const { viewport, setViewport } = useCanvasStore.getState();
            // same "keep a fixed canvas point anchored on screen" math as
            // handleWheel, but anchored to the previous midpoint - combines
            // zoom (distance changed) and pan (midpoint moved) in one step
            const canvasPointBefore = screenToCanvas(prev.midpoint, viewport);
            const zoomFactor = distance / prev.distance;
            const zoom = Math.min(
              MAX_ZOOM,
              Math.max(MIN_ZOOM, viewport.zoom * zoomFactor)
            );
            setViewport({
              zoom,
              offsetX: midpoint.x - canvasPointBefore.x * zoom,
              offsetY: midpoint.y - canvasPointBefore.y * zoom,
            });
          }
          pinchStateRef.current = { distance, midpoint };
          return;
        }
      }

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
        case "creating-ellipse": {
          // unlike creating-circle, width/height grow independently - the
          // whole point of an ellipse - so this is the plain corner-anchored
          // box math rectangle uses, just converted to center+radii after
          const boxX = Math.min(drag.start.x, canvasPoint.x);
          const boxY = Math.min(drag.start.y, canvasPoint.y);
          const width = Math.abs(canvasPoint.x - drag.start.x);
          const height = Math.abs(canvasPoint.y - drag.start.y);
          updateShape(drag.id, {
            x: boxX + width / 2,
            y: boxY + height / 2,
            radiusX: width / 2,
            radiusY: height / 2,
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
        case "resizing-ellipse": {
          if (!drag.committed) stopCapturing();
          const boxX = Math.min(drag.origin.x, canvasPoint.x);
          const boxY = Math.min(drag.origin.y, canvasPoint.y);
          const width = Math.abs(canvasPoint.x - drag.origin.x);
          const height = Math.abs(canvasPoint.y - drag.origin.y);
          updateShape(drag.id, {
            x: boxX + width / 2,
            y: boxY + height / 2,
            radiusX: width / 2,
            radiusY: height / 2,
          });
          dragRef.current = { ...drag, committed: true };
          break;
        }
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

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        touchPointsRef.current.delete(e.pointerId);
        pinchStateRef.current = null;
      }

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

      // hit-tests one connector (arrow/line) endpoint's current point
      // against every other (non-connector) shape and binds or unbinds it
      // accordingly - called once a create/resize-endpoint gesture actually
      // finishes, never mid-drag
      const resolveConnectorAttachment = (
        id: string,
        endpoint: "start" | "end"
      ) => {
        const connector = useCanvasStore.getState().shapes[id];
        if (connector?.type !== "arrow" && connector?.type !== "line") return;
        const point =
          endpoint === "start"
            ? { x: connector.x1, y: connector.y1 }
            : { x: connector.x2, y: connector.y2 };
        const otherPoint =
          endpoint === "start"
            ? { x: connector.x2, y: connector.y2 }
            : { x: connector.x1, y: connector.y1 };
        const target = Object.values(useCanvasStore.getState().shapes).find(
          (s) =>
            s.id !== id &&
            s.type !== "arrow" &&
            s.type !== "line" &&
            isPointInShape(point, s)
        );
        if (target) {
          const edge = getEdgePoint(target, otherPoint);
          updateShape(
            id,
            endpoint === "start"
              ? { startAttachedToId: target.id, x1: edge.x, y1: edge.y }
              : { endAttachedToId: target.id, x2: edge.x, y2: edge.y }
          );
        } else {
          updateShape(
            id,
            endpoint === "start"
              ? { startAttachedToId: null }
              : { endAttachedToId: null }
          );
        }
      };

      if (
        drag.mode === "creating-box" ||
        drag.mode === "resizing-box" ||
        drag.mode === "resizing-label"
      ) {
        if (!shape) return;
        const box = getBoundingBox(shape);
        // a click with no drag leaves a 0x0 shape — discard it instead of
        // committing invisible junk
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
      } else if (drag.mode === "creating-ellipse") {
        if (
          shape?.type === "ellipse" &&
          (shape.radiusX === 0 || shape.radiusY === 0)
        ) {
          removeShape(drag.id);
          selectShape(null);
        }
      } else if (drag.mode === "creating-arrow") {
        if (
          (shape?.type === "arrow" || shape?.type === "line") &&
          shape.x1 === shape.x2 &&
          shape.y1 === shape.y2
        ) {
          removeShape(drag.id);
          selectShape(null);
        } else {
          resolveConnectorAttachment(drag.id, "start");
          resolveConnectorAttachment(drag.id, "end");
        }
      } else if (drag.mode === "resizing-arrow") {
        resolveConnectorAttachment(drag.id, drag.endpoint);
      }

      if (
        drag.mode === "creating-box" ||
        drag.mode === "creating-circle" ||
        drag.mode === "creating-ellipse" ||
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
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [canvasRef]);
};
