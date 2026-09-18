import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
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

  const inZOrder = Object.values(shapes).sort((a, b) => b.zIndex - a.zIndex);

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

  return (
    // a real flex sibling (not a position:absolute overlay) so the canvas
    // is actually laid out narrower than the viewport, rather than merely
    // painted under this panel - otherwise this panel's own hit area (a
    // real scrollable list, unlike Inspector's few small controls) would
    // block canvas drags/clicks anywhere under its footprint
    <div className="flex h-full w-32 shrink-0 flex-col gap-2 overflow-y-auto border-r bg-background p-2 shadow-sm sm:w-44">
      <h2 className="px-1 text-xs font-medium text-muted-foreground">Layers</h2>
      {inZOrder.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">No shapes yet.</p>
      )}
      {inZOrder.length > 0 && (
        <ul className="flex flex-col gap-1">
          {inZOrder.map((shape) => (
            <li
              key={shape.id}
              className="flex items-center justify-between rounded-md px-1.5 py-1 text-sm"
              style={{
                background: selectedIds.includes(shape.id)
                  ? "var(--muted)"
                  : undefined,
              }}
            >
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
