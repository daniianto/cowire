import { useState } from "react";
import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "@/state";
import type { Shape } from "@/lib/geometry";

const TYPE_NAMES: Record<Shape["type"], string> = {
  rectangle: "Rectangle",
  circle: "Circle",
  arrow: "Arrow",
  label: "Label",
};

const displayName = (shape: Shape): string => {
  if (shape.type === "label") return shape.text || "Label";
  if (shape.type !== "arrow" && shape.label) return shape.label;
  return TYPE_NAMES[shape.type];
};

// Dialog-based, like SaveDialog/DiagramList, rather than a persistent side
// column - see STAGE_8.md for why
export const LayerTree = () => {
  const [open, setOpen] = useState(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Layers
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Layers</DialogTitle>
        </DialogHeader>
        {inZOrder.length === 0 && (
          <p className="text-sm text-muted-foreground">No shapes yet.</p>
        )}
        {inZOrder.length > 0 && (
          <ul className="flex flex-col gap-1">
            {inZOrder.map((shape) => (
              <li
                key={shape.id}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                style={{
                  background: selectedIds.includes(shape.id)
                    ? "var(--muted)"
                    : undefined,
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    useCanvasStore.getState().selectShape(shape.id)
                  }
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border"
                    style={{ backgroundColor: shape.color }}
                  />
                  <span>{displayName(shape)}</span>
                </button>
                <div className="flex gap-1">
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
      </DialogContent>
    </Dialog>
  );
};
