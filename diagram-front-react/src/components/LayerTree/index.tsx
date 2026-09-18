import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  GripVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "@/state";
import type { Shape } from "@/lib/geometry";

const TYPE_NAMES: Record<Shape["type"], string> = {
  rectangle: "Rectangle",
  circle: "Circle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  diamond: "Diamond",
  arrow: "Arrow",
  line: "Line",
  label: "Label",
};

const displayName = (shape: Shape): string => {
  if (shape.type === "label") return shape.text || "Label";
  if (shape.type !== "arrow" && shape.type !== "line" && shape.label) {
    return shape.label;
  }
  return TYPE_NAMES[shape.type];
};

// a persistent side panel rather than a Dialog - revisited from STAGE_8.md's
// original decision at the user's request
export const LayerTree = () => {
  const shapes = useCanvasStore((s) => s.shapes);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  // collapsed to a slim rail by default on narrow viewports so it doesn't
  // eat into the canvas on mobile; the user can still expand it there
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 640);

  const inZOrder = Object.values(shapes).sort((a, b) => b.zIndex - a.zIndex);

  // free drag-to-reorder, in addition to the front/back buttons below -
  // pointer events (not native HTML5 drag-and-drop) so this works the same
  // on touch as it does with a mouse, consistent with how the canvas itself
  // handles gestures
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  // kept in sync every render so the drag effect (which only re-subscribes
  // when a drag starts/ends) always sees the current order, without needing
  // to restart its window listeners on every shapes-map change
  const orderRef = useRef(inZOrder);
  orderRef.current = inZOrder;

  useEffect(() => {
    if (!dragId) return;

    const handleMove = (e: PointerEvent) => {
      const order = orderRef.current;
      let index = order.length;
      for (let i = 0; i < order.length; i++) {
        const row = rowRefs.current.get(order[i].id);
        if (!row) continue;
        const rect = row.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          index = i;
          break;
        }
      }
      setDropIndex(index);
    };

    const handleUp = () => {
      setDropIndex((index) => {
        const order = orderRef.current;
        const from = order.findIndex((s) => s.id === dragId);
        if (from !== -1 && index !== null && index !== from) {
          const ids = order.map((s) => s.id);
          ids.splice(from, 1);
          ids.splice(index > from ? index - 1 : index, 0, dragId);
          const { stopCapturing, reorderShapes } = useCanvasStore.getState();
          stopCapturing();
          reorderShapes(ids);
        }
        return null;
      });
      setDragId(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragId]);

  const reorder = (id: string, direction: "front" | "back") => {
    const {
      selectShape,
      stopCapturing,
      bringSelectedToFront,
      sendSelectedToBack,
    } = useCanvasStore.getState();
    selectShape(id);
    stopCapturing();
    if (direction === "front") bringSelectedToFront();
    else sendSelectedToBack();
  };

  // deletes the shape's whole group as one step, same as pressing
  // Delete/Backspace with it selected - selectShape already expands a
  // grouped id to every member, so removeShapes sees the full group
  const handleDelete = (id: string) => {
    const { selectShape, stopCapturing, removeShapes } =
      useCanvasStore.getState();
    selectShape(id);
    stopCapturing();
    removeShapes(useCanvasStore.getState().selectedIds);
  };

  if (collapsed) {
    return (
      <div className="flex h-full w-8 shrink-0 flex-col items-center border-r bg-background p-1 shadow-sm">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Show layers"
          title="Show layers"
          onClick={() => setCollapsed(false)}
        >
          <PanelLeftOpen />
        </Button>
      </div>
    );
  }

  return (
    // a real flex sibling (not a position:absolute overlay) so the canvas
    // is actually laid out narrower than the viewport, rather than merely
    // painted under this panel - otherwise this panel's own hit area (a
    // real scrollable list, unlike Inspector's few small controls) would
    // block canvas drags/clicks anywhere under its footprint
    <div className="flex h-full w-32 shrink-0 flex-col gap-2 overflow-y-auto border-r bg-background p-2 shadow-sm sm:w-44">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-medium text-muted-foreground">Layers</h2>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Hide layers"
          title="Hide layers"
          onClick={() => setCollapsed(true)}
        >
          <PanelLeftClose />
        </Button>
      </div>
      {inZOrder.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">No shapes yet.</p>
      )}
      {inZOrder.length > 0 && (
        <ul className="flex flex-col gap-1">
          {inZOrder.map((shape, index) => (
            <li
              key={shape.id}
              ref={(el) => {
                if (el) rowRefs.current.set(shape.id, el);
                else rowRefs.current.delete(shape.id);
              }}
              className="flex items-center gap-1 rounded-md px-1 py-1 text-sm"
              style={{
                background: selectedIds.includes(shape.id)
                  ? "var(--muted)"
                  : undefined,
                opacity: dragId === shape.id ? 0.4 : undefined,
                borderTop:
                  dragId && dropIndex === index
                    ? "2px solid var(--primary)"
                    : "2px solid transparent",
                borderBottom:
                  dragId &&
                  dropIndex === inZOrder.length &&
                  index === inZOrder.length - 1
                    ? "2px solid var(--primary)"
                    : "2px solid transparent",
              }}
            >
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDragId(shape.id);
                }}
                aria-label="Drag to reorder"
                title="Drag to reorder"
                className="shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => useCanvasStore.getState().selectShape(shape.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-sm border"
                  style={{ backgroundColor: shape.color }}
                />
                <span className="truncate">{displayName(shape)}</span>
              </button>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Bring to front"
                  title="Bring to front"
                  onClick={() => reorder(shape.id, "front")}
                >
                  <ArrowUpToLine />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Send to back"
                  title="Send to back"
                  onClick={() => reorder(shape.id, "back")}
                >
                  <ArrowDownToLine />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Delete"
                  title="Delete"
                  onClick={() => handleDelete(shape.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
